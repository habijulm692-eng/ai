import { Request, Response } from 'express';
import { appendLog, getGatewayData, recordKeyUsage, validateBearerToken } from './store';
import { AIProvider, ChatMessage, FallbackAttempt, OpenAIModelItem, ProviderModel } from '../types/gateway';

function convertOpenAiMessagesToGemini(messages: ChatMessage[]) {
  let systemInstruction: string | undefined = undefined;
  const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      systemInstruction = systemInstruction ? `${systemInstruction}\n${msg.content}` : msg.content;
    } else {
      contents.push({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content || '' }],
      });
    }
  }

  return {
    contents,
    systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
  };
}

function convertGeminiToOpenAiResponse(geminiData: any, modelId: string) {
  const candidate = geminiData.candidates?.[0];
  const text = candidate?.content?.parts?.[0]?.text || '';
  const finishReason = candidate?.finishReason === 'STOP' ? 'stop' : (candidate?.finishReason?.toLowerCase() || 'stop');
  const promptTokens = geminiData.usageMetadata?.promptTokenCount || 0;
  const completionTokens = geminiData.usageMetadata?.candidatesTokenCount || 0;

  return {
    id: `chatcmpl-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: modelId,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: text,
        },
        finish_reason: finishReason,
      },
    ],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
    },
  };
}

/**
 * Returns OpenAI-compatible JSON list of all active models + virtual "all-models"
 */
export async function getModelsDiscovery(): Promise<{ object: 'list'; data: OpenAIModelItem[] }> {
  const db = await getGatewayData();
  const modelsList: OpenAIModelItem[] = [];

  // 1. Virtual model "all-models" (OpenRouter-style dynamic fallback)
  modelsList.push({
    id: 'all-models',
    object: 'model',
    created: 1729584000,
    owned_by: 'gateway-dynamic-fallback',
    permission: [],
    root: 'all-models',
    parent: null,
    metadata: {
      providerId: 'gateway',
      providerName: 'Unified Gateway Dynamic Fallback Pipeline',
      priority: 0,
      pipelineOrder: 0,
      inAllModelsPool: true,
      isVirtual: true,
      contextWindow: 2097152,
    },
  });

  // 2. Discover all active models from all active providers
  const activeProviders = Object.values(db.providers).filter((p) => p && p.enabled);
  for (const prov of activeProviders) {
    const activeModels = (prov.models || []).filter((m) => m && m.enabled);
    for (const mod of activeModels) {
      modelsList.push({
        id: mod.id,
        object: 'model',
        created: prov.createdAt || 1729584000,
        owned_by: prov.name,
        permission: [],
        root: mod.id,
        parent: null,
        metadata: {
          providerId: prov.id,
          providerName: prov.name,
          priority: mod.priority,
          pipelineOrder: typeof mod.pipelineOrder === 'number' ? mod.pipelineOrder : mod.priority,
          inAllModelsPool: mod.inAllModelsPool !== false,
          isVirtual: false,
          contextWindow: mod.contextWindow || 128000,
          protocol: prov.protocol,
        },
      });
    }
  }

  // Sort: Virtual model first, then by pipelineOrder ascending
  modelsList.sort((a, b) => {
    if (a.id === 'all-models') return -1;
    if (b.id === 'all-models') return 1;
    const orderA = typeof a.metadata?.pipelineOrder === 'number' ? a.metadata.pipelineOrder : (a.metadata?.priority || 99);
    const orderB = typeof b.metadata?.pipelineOrder === 'number' ? b.metadata.pipelineOrder : (b.metadata?.priority || 99);
    return orderA - orderB;
  });

  return {
    object: 'list',
    data: modelsList,
  };
}

export async function processChatCompletion(req: Request, res: Response) {
  const overallStart = Date.now();
  const db = await getGatewayData();

  // 1. Authenticate API Key (Master Key OR Distinct Client API Key)
  const authHeader = req.headers['authorization'] || '';
  const token = (typeof authHeader === 'string' ? authHeader : authHeader[0] || '').replace(/^Bearer\s+/i, '').trim();

  const auth = await validateBearerToken(token);
  if (!auth.isValid) {
    return res.status(401).json({
      error: {
        message: 'Invalid or missing API Key. Provide Authorization: Bearer <GATEWAY_KEY>',
        type: 'invalid_request_error',
        code: 'invalid_api_key',
      },
    });
  }

  const { model: requestedModel, messages = [], stream = false, temperature = 0.7, max_tokens = 2048 } = req.body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({
      error: {
        message: 'Request body must include a valid non-empty "messages" array',
        type: 'invalid_request_error',
      },
    });
  }

  // 2. Discover Candidates from Dynamic DB (Active Providers & Active Models)
  const activeProviders = Object.values(db.providers).filter((p) => p && p.enabled);
  const allActiveCandidates: Array<{ provider: AIProvider; model: ProviderModel }> = [];

  for (const prov of activeProviders) {
    const activeModels = (prov.models || []).filter((m) => m && m.enabled);
    for (const mod of activeModels) {
      allActiveCandidates.push({ provider: prov, model: mod });
    }
  }

  // Handle Virtual Model "all-models" or specific model selection
  const isVirtualAllModels = !requestedModel || requestedModel === 'all-models' || requestedModel === 'auto';
  let executionQueue: Array<{ provider: AIProvider; model: ProviderModel }> = [];

  if (isVirtualAllModels) {
    // OpenRouter-style Dynamic Fallback Pipeline:
    // 1. Filter out any models where inAllModelsPool === false or parent provider / model is disabled
    const pipelineCandidates = allActiveCandidates.filter((c) => c.model.inAllModelsPool !== false);

    // 2. Order by pipelineOrder ascending (defaulting to model.priority)
    pipelineCandidates.sort((a, b) => {
      const orderA = typeof a.model.pipelineOrder === 'number' ? a.model.pipelineOrder : (a.model.priority || 99);
      const orderB = typeof b.model.pipelineOrder === 'number' ? b.model.pipelineOrder : (b.model.priority || 99);
      return orderA - orderB;
    });

    executionQueue = pipelineCandidates;
  } else {
    // Specific model requested: target model is tried first, then fallbacks if enabled
    const directMatches = allActiveCandidates.filter((c) => c.model.id === requestedModel);
    const otherCandidates = allActiveCandidates.filter((c) => c.model.id !== requestedModel);

    // Sort others by pipelineOrder
    otherCandidates.sort((a, b) => {
      const orderA = typeof a.model.pipelineOrder === 'number' ? a.model.pipelineOrder : (a.model.priority || 99);
      const orderB = typeof b.model.pipelineOrder === 'number' ? b.model.pipelineOrder : (b.model.priority || 99);
      return orderA - orderB;
    });

    if (directMatches.length > 0) {
      executionQueue = db.settings.fallbackEnabled
        ? [...directMatches, ...otherCandidates]
        : directMatches;
    } else {
      // If requested model is not found, fallback to pipeline queue
      executionQueue = [...allActiveCandidates];
    }
  }

  if (executionQueue.length === 0) {
    return res.status(503).json({
      error: {
        message: 'No active AI providers or models configured in the gateway fallback pipeline.',
        type: 'gateway_error',
      },
    });
  }

  let attemptCount = 0;
  const fallbackChain: FallbackAttempt[] = [];
  const fallbackSequenceUsed: string[] = [];

  // =========================================================================
  // OpenRouter-Style Async Waterfall Loop
  // Attempt Model #1 in sequence -> If 200 OK, return/stream immediately.
  // If 429, 500, 503, or timeout -> record step, auto-cascade to Model #2
  // =========================================================================
  for (const item of executionQueue) {
    attemptCount++;
    const { provider, model } = item;
    const isFallback = attemptCount > 1;
    const attemptStart = Date.now();
    const logId = `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    try {
      if (provider.protocol === 'gemini-native') {
        const apiKey = provider.apiKey || process.env.GEMINI_API_KEY || '';
        if (!apiKey) {
          throw new Error('Google Gemini API Key is missing');
        }

        const { contents, systemInstruction } = convertOpenAiMessagesToGemini(messages);
        const isBearerAuth = apiKey.startsWith('AQ.') || apiKey.startsWith('ya29.');
        let endpoint = `${provider.baseUrl.replace(/\/$/, '')}/models/${model.id}:${
          stream ? 'streamGenerateContent?alt=sse' : 'generateContent'
        }`;

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };

        if (isBearerAuth) {
          headers['Authorization'] = `Bearer ${apiKey}`;
        } else {
          endpoint += (stream ? '&key=' : '?key=') + encodeURIComponent(apiKey);
          headers['x-goog-api-key'] = apiKey;
        }

        const geminiPayload: any = {
          contents,
          generationConfig: {
            temperature,
            maxOutputTokens: max_tokens,
          },
        };
        if (systemInstruction) {
          geminiPayload.systemInstruction = systemInstruction;
        }

        const controller = new AbortController();
        const timeoutMs = db.settings.requestTimeoutMs || 30000;
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        const upstreamRes = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(geminiPayload),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!upstreamRes.ok) {
          const errText = await upstreamRes.text();
          const latency = Date.now() - attemptStart;

          fallbackSequenceUsed.push(`${model.id} (failed: ${upstreamRes.status})`);

          fallbackChain.push({
            providerId: provider.id,
            providerName: provider.name,
            modelId: model.id,
            status: upstreamRes.status,
            latencyMs: latency,
            error: errText.substring(0, 300),
          });

          await appendLog({
            id: logId,
            timestamp: Date.now(),
            providerId: provider.id,
            providerName: provider.name,
            model: model.id,
            status: 'failure',
            statusCode: upstreamRes.status,
            latencyMs: latency,
            errorMessage: `Gemini Error ${upstreamRes.status}: ${errText.substring(0, 300)}`,
            wasFallback: isFallback,
            originalModelRequested: requestedModel,
            stream,
            userAgent: req.headers['user-agent'],
            apiKeyId: auth.keyId,
            apiKeyName: auth.keyName,
            fallbackChain: [...fallbackChain],
            fallbackSequenceUsed: [...fallbackSequenceUsed],
          });

          const isRetryable =
            upstreamRes.status === 429 ||
            upstreamRes.status === 503 ||
            upstreamRes.status === 500 ||
            upstreamRes.status === 502 ||
            upstreamRes.status === 504;

          if (db.settings.fallbackEnabled && isRetryable && attemptCount < executionQueue.length) {
            console.warn(`[Pipeline Waterfall] Step #${attemptCount} ${provider.name} (${model.id}) failed with ${upstreamRes.status}. Cascading to next pipeline rank...`);
            continue;
          } else if (!db.settings.fallbackEnabled && !isVirtualAllModels) {
            return res.status(upstreamRes.status).json({
              error: {
                message: `Gemini Upstream Error: ${errText}`,
                code: upstreamRes.status,
              },
            });
          } else {
            continue;
          }
        }

        // Succeeded on Gemini Native!
        fallbackSequenceUsed.push(`${model.id} (success: 200)`);

        if (!stream) {
          const data = await upstreamRes.json();
          const latency = Date.now() - overallStart;
          const openAiFormatted = convertGeminiToOpenAiResponse(data, model.id);

          const promptToks = openAiFormatted.usage.prompt_tokens;
          const compToks = openAiFormatted.usage.completion_tokens;

          if (auth.keyId && auth.keyId !== 'master') {
            recordKeyUsage(auth.keyId, promptToks, compToks).catch((err) =>
              console.error('Failed to record key usage:', err)
            );
          }

          await appendLog({
            id: logId,
            timestamp: Date.now(),
            providerId: provider.id,
            providerName: provider.name,
            model: model.id,
            status: 'success',
            statusCode: 200,
            latencyMs: latency,
            wasFallback: isFallback,
            originalModelRequested: requestedModel,
            stream: false,
            promptTokens: promptToks,
            completionTokens: compToks,
            totalTokens: openAiFormatted.usage.total_tokens,
            userAgent: req.headers['user-agent'],
            apiKeyId: auth.keyId,
            apiKeyName: auth.keyName,
            fallbackChain: fallbackChain.length > 0 ? fallbackChain : undefined,
            fallbackSequenceUsed: [...fallbackSequenceUsed],
          });

          return res.status(200).json({
            ...openAiFormatted,
            fallbackSequenceUsed: [...fallbackSequenceUsed],
          });
        } else {
          // Streaming Gemini to OpenAI SSE format
          res.setHeader('x-fallback-sequence', JSON.stringify(fallbackSequenceUsed));
          res.setHeader('Content-Type', 'text/event-stream');
          res.setHeader('Cache-Control', 'no-cache');
          res.setHeader('Connection', 'keep-alive');

          const completionId = `chatcmpl-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
          let totalCompletionChars = 0;

          if (!upstreamRes.body) {
            throw new Error('No streaming response body from upstream');
          }

          const reader = upstreamRes.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (trimmed.startsWith('data: ')) {
                const jsonStr = trimmed.slice(6);
                if (jsonStr === '[DONE]') continue;
                try {
                  const chunkData = JSON.parse(jsonStr);
                  const chunkText = chunkData.candidates?.[0]?.content?.parts?.[0]?.text || '';
                  if (chunkText) {
                    totalCompletionChars += chunkText.length;
                    const openAiChunk = {
                      id: completionId,
                      object: 'chat.completion.chunk',
                      created: Math.floor(Date.now() / 1000),
                      model: model.id,
                      choices: [
                        {
                          index: 0,
                          delta: { content: chunkText },
                          finish_reason: null,
                        },
                      ],
                    };
                    res.write(`data: ${JSON.stringify(openAiChunk)}\n\n`);
                  }
                } catch (parseErr) {
                  // ignore
                }
              }
            }
          }

          // Send final stop chunk and [DONE]
          const finalChunk = {
            id: completionId,
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model: model.id,
            choices: [
              {
                index: 0,
                delta: {},
                finish_reason: 'stop',
              },
            ],
          };
          res.write(`data: ${JSON.stringify(finalChunk)}\n\n`);
          res.write('data: [DONE]\n\n');
          res.end();

          const latency = Date.now() - overallStart;
          const estCompletionTokens = Math.ceil(totalCompletionChars / 4);
          const estPromptTokens = Math.ceil(JSON.stringify(messages).length / 4);

          if (auth.keyId && auth.keyId !== 'master') {
            recordKeyUsage(auth.keyId, estPromptTokens, estCompletionTokens).catch((err) =>
              console.error('Failed to record key usage:', err)
            );
          }

          await appendLog({
            id: logId,
            timestamp: Date.now(),
            providerId: provider.id,
            providerName: provider.name,
            model: model.id,
            status: 'success',
            statusCode: 200,
            latencyMs: latency,
            wasFallback: isFallback,
            originalModelRequested: requestedModel,
            stream: true,
            promptTokens: estPromptTokens,
            completionTokens: estCompletionTokens,
            totalTokens: estPromptTokens + estCompletionTokens,
            userAgent: req.headers['user-agent'],
            apiKeyId: auth.keyId,
            apiKeyName: auth.keyName,
            fallbackChain: fallbackChain.length > 0 ? fallbackChain : undefined,
            fallbackSequenceUsed: [...fallbackSequenceUsed],
          });

          return;
        }
      } else {
        // OpenAI-Compatible Protocol Forwarder (Groq, OpenRouter, xKiro, etc.)
        const targetUrl = `${provider.baseUrl.replace(/\/$/, '')}/chat/completions`;
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${provider.apiKey}`,
          ...(provider.customHeaders || {}),
        };

        const upstreamBody = {
          ...req.body,
          model: model.id,
        };

        const controller = new AbortController();
        const timeoutMs = db.settings.requestTimeoutMs || 30000;
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        const upstreamRes = await fetch(targetUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(upstreamBody),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!upstreamRes.ok) {
          const errText = await upstreamRes.text();
          const latency = Date.now() - attemptStart;

          fallbackSequenceUsed.push(`${model.id} (failed: ${upstreamRes.status})`);

          fallbackChain.push({
            providerId: provider.id,
            providerName: provider.name,
            modelId: model.id,
            status: upstreamRes.status,
            latencyMs: latency,
            error: errText.substring(0, 300),
          });

          await appendLog({
            id: logId,
            timestamp: Date.now(),
            providerId: provider.id,
            providerName: provider.name,
            model: model.id,
            status: 'failure',
            statusCode: upstreamRes.status,
            latencyMs: latency,
            errorMessage: `Upstream error ${upstreamRes.status}: ${errText.substring(0, 300)}`,
            wasFallback: isFallback,
            originalModelRequested: requestedModel,
            stream,
            userAgent: req.headers['user-agent'],
            apiKeyId: auth.keyId,
            apiKeyName: auth.keyName,
            fallbackChain: [...fallbackChain],
            fallbackSequenceUsed: [...fallbackSequenceUsed],
          });

          const isRetryable =
            upstreamRes.status === 429 ||
            upstreamRes.status === 503 ||
            upstreamRes.status === 500 ||
            upstreamRes.status === 502 ||
            upstreamRes.status === 504;

          if (db.settings.fallbackEnabled && isRetryable && attemptCount < executionQueue.length) {
            console.warn(`[Pipeline Waterfall] Step #${attemptCount} ${provider.name} (${model.id}) failed with ${upstreamRes.status}. Cascading to next pipeline rank...`);
            continue;
          } else if (!db.settings.fallbackEnabled && !isVirtualAllModels) {
            return res.status(upstreamRes.status).json({
              error: {
                message: `Upstream error from ${provider.name}: ${errText}`,
                code: upstreamRes.status,
              },
            });
          } else {
            continue;
          }
        }

        // Succeeded on OpenAI-compatible!
        fallbackSequenceUsed.push(`${model.id} (success: 200)`);

        if (!stream) {
          const data = await upstreamRes.json();
          const latency = Date.now() - overallStart;

          const promptToks = data.usage?.prompt_tokens || 0;
          const compToks = data.usage?.completion_tokens || 0;

          if (auth.keyId && auth.keyId !== 'master') {
            recordKeyUsage(auth.keyId, promptToks, compToks).catch((err) =>
              console.error('Failed to record key usage:', err)
            );
          }

          await appendLog({
            id: logId,
            timestamp: Date.now(),
            providerId: provider.id,
            providerName: provider.name,
            model: model.id,
            status: 'success',
            statusCode: 200,
            latencyMs: latency,
            wasFallback: isFallback,
            originalModelRequested: requestedModel,
            stream: false,
            promptTokens: promptToks,
            completionTokens: compToks,
            totalTokens: data.usage?.total_tokens || promptToks + compToks,
            userAgent: req.headers['user-agent'],
            apiKeyId: auth.keyId,
            apiKeyName: auth.keyName,
            fallbackChain: fallbackChain.length > 0 ? fallbackChain : undefined,
            fallbackSequenceUsed: [...fallbackSequenceUsed],
          });

          return res.status(200).json({
            ...data,
            fallbackSequenceUsed: [...fallbackSequenceUsed],
          });
        } else {
          // Pass-through streaming SSE
          res.setHeader('x-fallback-sequence', JSON.stringify(fallbackSequenceUsed));
          res.setHeader('Content-Type', 'text/event-stream');
          res.setHeader('Cache-Control', 'no-cache');
          res.setHeader('Connection', 'keep-alive');

          if (!upstreamRes.body) throw new Error('No upstream body for stream');
          const reader = upstreamRes.body.getReader();

          let totalChars = 0;
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            // BUG FIX: Convert Uint8Array to Buffer before writing to Express response
            // res.write() with raw Uint8Array can cause issues in Node.js streams
            const chunk = Buffer.from(value);
            totalChars += chunk.length;
            res.write(chunk);
          }
          res.end();

          const latency = Date.now() - overallStart;
          const estCompToks = Math.ceil(totalChars / 12);
          const estPromptToks = Math.ceil(JSON.stringify(messages).length / 4);

          if (auth.keyId && auth.keyId !== 'master') {
            recordKeyUsage(auth.keyId, estPromptToks, estCompToks).catch((err) =>
              console.error('Failed to record key usage:', err)
            );
          }

          await appendLog({
            id: logId,
            timestamp: Date.now(),
            providerId: provider.id,
            providerName: provider.name,
            model: model.id,
            status: 'success',
            statusCode: 200,
            latencyMs: latency,
            wasFallback: isFallback,
            originalModelRequested: requestedModel,
            stream: true,
            promptTokens: estPromptToks,
            completionTokens: estCompToks,
            totalTokens: estPromptToks + estCompToks,
            userAgent: req.headers['user-agent'],
            apiKeyId: auth.keyId,
            apiKeyName: auth.keyName,
            fallbackChain: fallbackChain.length > 0 ? fallbackChain : undefined,
            fallbackSequenceUsed: [...fallbackSequenceUsed],
          });
          return;
        }
      }
    } catch (err: any) {
      const latency = Date.now() - attemptStart;
      const failReason = err?.name === 'AbortError' ? 'timeout' : '500';

      fallbackSequenceUsed.push(`${model.id} (failed: ${failReason})`);

      fallbackChain.push({
        providerId: provider.id,
        providerName: provider.name,
        modelId: model.id,
        status: 500,
        latencyMs: latency,
        error: err?.message || 'Connection failure or timeout',
      });

      await appendLog({
        id: logId,
        timestamp: Date.now(),
        providerId: provider.id,
        providerName: provider.name,
        model: model.id,
        status: 'failure',
        statusCode: 500,
        latencyMs: latency,
        errorMessage: err?.message || 'Connection failure or timeout',
        wasFallback: isFallback,
        originalModelRequested: requestedModel,
        stream,
        userAgent: req.headers['user-agent'],
        apiKeyId: auth.keyId,
        apiKeyName: auth.keyName,
        fallbackChain: [...fallbackChain],
        fallbackSequenceUsed: [...fallbackSequenceUsed],
      });

      if (db.settings.fallbackEnabled && attemptCount < executionQueue.length) {
        console.warn(`[Pipeline Waterfall] Step #${attemptCount} ${model.id} failed with error: ${err?.message}. Retrying next in pipeline...`);
        continue;
      } else if (!db.settings.fallbackEnabled && !isVirtualAllModels) {
        return res.status(500).json({ error: { message: err?.message || 'Connection failed' } });
      } else {
        continue;
      }
    }
  }

  // If every model in the sequence fails, return a 502/504 error detailing the sequence attempts
  return res.status(502).json({
    error: {
      message: 'All available AI models in the configured Fallback Pipeline sequence failed or were rate-limited.',
      type: 'gateway_pipeline_exhausted',
      attempts: attemptCount,
      requestedModel: requestedModel || 'all-models',
      fallbackSequenceUsed,
      fallbackChain,
    },
  });
}
