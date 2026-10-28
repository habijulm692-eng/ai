import { NextRequest, NextResponse } from 'next/server';

// ==========================================
// In-Memory Cache (TTL: 60s) for Serverless
// ==========================================
interface CacheState {
  providers: Record<string, any>;
  settings: Record<string, any>;
  lastFetched: number;
}

const memoryCache: CacheState = {
  providers: {},
  settings: {},
  lastFetched: 0,
};

const CACHE_TTL_MS = 60 * 1000;

async function getCachedConfig() {
  const now = Date.now();
  if (
    now - memoryCache.lastFetched < CACHE_TTL_MS &&
    Object.keys(memoryCache.providers).length > 0
  ) {
    return {
      providers: memoryCache.providers,
      settings: memoryCache.settings,
    };
  }

  // Fetch from Firebase Realtime Database REST API
  const firebaseUrl = process.env.FIREBASE_DATABASE_URL || '';
  const firebaseSecret = process.env.FIREBASE_DATABASE_SECRET || '';

  if (firebaseUrl) {
    try {
      const cleanUrl = firebaseUrl.replace(/\/$/, '');
      const authParam = firebaseSecret ? `?auth=${encodeURIComponent(firebaseSecret)}` : '';
      
      const [providersRes, settingsRes] = await Promise.all([
        fetch(`${cleanUrl}/providers.json${authParam}`, { cache: 'no-store' }),
        fetch(`${cleanUrl}/settings.json${authParam}`, { cache: 'no-store' }),
      ]);

      if (providersRes.ok) {
        memoryCache.providers = (await providersRes.json()) || {};
      }
      if (settingsRes.ok) {
        memoryCache.settings = (await settingsRes.json()) || {};
      }
      memoryCache.lastFetched = now;
      return { providers: memoryCache.providers, settings: memoryCache.settings };
    } catch (err) {
      console.error('[Firebase RTDB] Error fetching config:', err);
    }
  }

  // Fallback defaults if Firebase not configured
  return {
    providers: memoryCache.providers,
    settings: memoryCache.settings,
  };
}

async function writeLogToFirebase(logEntry: Record<string, any>) {
  const firebaseUrl = process.env.FIREBASE_DATABASE_URL || '';
  const firebaseSecret = process.env.FIREBASE_DATABASE_SECRET || '';
  if (!firebaseUrl) return;

  try {
    const cleanUrl = firebaseUrl.replace(/\/$/, '');
    const authParam = firebaseSecret ? `?auth=${encodeURIComponent(firebaseSecret)}` : '';
    await fetch(`${cleanUrl}/logs/${logEntry.id}.json${authParam}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(logEntry),
    });
  } catch (err) {
    console.error('[Firebase RTDB] Failed to write log:', err);
  }
}

// ==========================================
// Payload Converters
// ==========================================
function convertOpenAiMessagesToGemini(messages: Array<{ role: string; content: string }>) {
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
    systemInstruction: systemInstruction
      ? { parts: [{ text: systemInstruction }] }
      : undefined,
  };
}

function convertGeminiCandidateToOpenAi(geminiData: any, model: string) {
  const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const finishReason = geminiData.candidates?.[0]?.finishReason === 'STOP' ? 'stop' : 'stop';
  const promptTokens = geminiData.usageMetadata?.promptTokenCount || 0;
  const completionTokens = geminiData.usageMetadata?.candidatesTokenCount || 0;

  return {
    id: `chatcmpl-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
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

// ==========================================
// Next.js Route Handler
// ==========================================
export async function POST(req: NextRequest) {
  const startTime = Date.now();
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  let body: any;
  try {
    body = await req.json();
  } catch (e) {
    return NextResponse.json({ error: { message: 'Invalid JSON request payload' } }, { status: 400 });
  }

  const { providers, settings } = await getCachedConfig();

  // 1. Authenticate Gateway Key (Master Key or Client Key)
  const masterKey = settings?.masterApiKey || process.env.GATEWAY_MASTER_KEY;
  const isMasterValid = masterKey && token === masterKey;

  // Check client keys
  const clientKeys = (settings as any)?.clientKeys || {};
  const isClientValid = Object.values(clientKeys).some((k: any) => k?.enabled && k?.key === token);

  if (!isMasterValid && !isClientValid) {
    return NextResponse.json(
      { error: { message: 'Unauthorized: Invalid or missing API Key' } },
      { status: 401 }
    );
  }

  const requestedModel = body.model;
  const isStream = Boolean(body.stream);
  const messages = body.messages || [];

  // 2. Build candidate queue with priority
  const candidates: Array<{ provider: any; model: any }> = [];
  const activeProviders = Object.values(providers || {}).filter((p: any) => p && p.enabled);

  for (const prov of activeProviders) {
    const activeModels = (prov.models || []).filter((m: any) => m && m.enabled);
    for (const mod of activeModels) {
      candidates.push({ provider: prov, model: mod });
    }
  }

  // Sort by priority (1 is highest)
  candidates.sort((a, b) => (a.model.priority || 99) - (b.model.priority || 99));

  // Handle "all-models" virtual model or specific model
  const isAllModels = !requestedModel || requestedModel === 'all-models' || requestedModel === 'auto';
  let executionQueue = candidates;

  if (!isAllModels) {
    const matched = candidates.filter((c) => c.model.id === requestedModel);
    const others = candidates.filter((c) => c.model.id !== requestedModel);
    executionQueue = matched.length > 0 ? [...matched, ...others] : candidates;
  }

  if (executionQueue.length === 0) {
    return NextResponse.json(
      { error: { message: 'No active AI providers or models available in gateway' } },
      { status: 503 }
    );
  }

  // 3. Fallback Engine Loop
  let lastError: any = null;
  let attemptCount = 0;

  for (const { provider, model } of executionQueue) {
    attemptCount++;
    const isFallback = attemptCount > 1;
    const attemptStart = Date.now();

    try {
      if (provider.protocol === 'gemini-native') {
        const { contents, systemInstruction } = convertOpenAiMessagesToGemini(messages);
        const geminiApiKey = provider.apiKey || process.env.GEMINI_API_KEY || '';
        const isBearerAuth = geminiApiKey.startsWith('AQ.') || geminiApiKey.startsWith('ya29.');
        let endpoint = `${provider.baseUrl.replace(/\/$/, '')}/models/${model.id}:${
          isStream ? 'streamGenerateContent?alt=sse' : 'generateContent'
        }`;

        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (isBearerAuth) {
          headers['Authorization'] = `Bearer ${geminiApiKey}`;
        } else {
          endpoint += (isStream ? '&key=' : '?key=') + encodeURIComponent(geminiApiKey);
          headers['x-goog-api-key'] = geminiApiKey;
        }

        const geminiBody: any = {
          contents,
          generationConfig: {
            temperature: body.temperature ?? 0.7,
            maxOutputTokens: body.max_tokens ?? 2048,
          },
        };
        if (systemInstruction) geminiBody.systemInstruction = systemInstruction;

        const geminiRes = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(geminiBody),
        });

        if (!geminiRes.ok) {
          const errText = await geminiRes.text();
          const latency = Date.now() - attemptStart;
          await writeLogToFirebase({
            id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            timestamp: Date.now(),
            providerId: provider.id,
            providerName: provider.name,
            model: model.id,
            status: 'failure',
            statusCode: geminiRes.status,
            latencyMs: latency,
            errorMessage: `Gemini API Error ${geminiRes.status}: ${errText.substring(0, 300)}`,
            wasFallback: isFallback,
            originalModelRequested: requestedModel,
            stream: isStream,
          });

          // Check for rate limit or 5xx to trigger next fallback
          if (geminiRes.status === 429 || geminiRes.status >= 500) {
            lastError = `Rate limit or server error (${geminiRes.status}) on ${model.id}`;
            continue;
          } else {
            return NextResponse.json(
              { error: { message: `Provider error: ${errText}`, code: geminiRes.status } },
              { status: geminiRes.status }
            );
          }
        }

        const data = await geminiRes.json();
        const openAiResponse = convertGeminiCandidateToOpenAi(data, model.id);
        const latency = Date.now() - startTime;

        await writeLogToFirebase({
          id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          timestamp: Date.now(),
          providerId: provider.id,
          providerName: provider.name,
          model: model.id,
          status: 'success',
          statusCode: 200,
          latencyMs: latency,
          wasFallback: isFallback,
          originalModelRequested: requestedModel,
          stream: isStream,
          promptTokens: openAiResponse.usage.prompt_tokens,
          completionTokens: openAiResponse.usage.completion_tokens,
          totalTokens: openAiResponse.usage.total_tokens,
        });

        return NextResponse.json(openAiResponse);
      } else {
        // OpenAI-compatible provider
        const targetUrl = `${provider.baseUrl.replace(/\/$/, '')}/chat/completions`;
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${provider.apiKey}`,
          ...(provider.customHeaders || {}),
        };

        const upstreamBody = {
          ...body,
          model: model.id,
        };

        const upstreamRes = await fetch(targetUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(upstreamBody),
        });

        if (!upstreamRes.ok) {
          const errText = await upstreamRes.text();
          const latency = Date.now() - attemptStart;
          await writeLogToFirebase({
            id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
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
            stream: isStream,
          });

          if (upstreamRes.status === 429 || upstreamRes.status >= 500) {
            lastError = `Rate limit or server error (${upstreamRes.status}) on ${model.id}`;
            continue;
          } else {
            return NextResponse.json(
              { error: { message: `Upstream error: ${errText}`, code: upstreamRes.status } },
              { status: upstreamRes.status }
            );
          }
        }

        const data = await upstreamRes.json();
        const latency = Date.now() - startTime;

        await writeLogToFirebase({
          id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          timestamp: Date.now(),
          providerId: provider.id,
          providerName: provider.name,
          model: model.id,
          status: 'success',
          statusCode: 200,
          latencyMs: latency,
          wasFallback: isFallback,
          originalModelRequested: requestedModel,
          stream: isStream,
          promptTokens: data.usage?.prompt_tokens,
          completionTokens: data.usage?.completion_tokens,
          totalTokens: data.usage?.total_tokens,
        });

        return NextResponse.json(data);
      }
    } catch (err: any) {
      lastError = err?.message || 'Connection failure';
      continue;
    }
  }

  return NextResponse.json(
    {
      error: {
        message: `All fallback providers failed. Last error: ${lastError}`,
        attempts: attemptCount,
      },
    },
    { status: 502 }
  );
}
