import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  MessageSquareCode,
  Send,
  Square,
  Trash2,
  Minimize2,
  Maximize2,
  X,
  Bot,
  User,
  Zap,
  Clock,
  Cpu,
  Layers,
  Repeat,
  Check,
  Copy,
  AlertCircle,
  Sparkles,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { AIProvider, GatewaySettings } from '../types/gateway';
import { MarkdownRenderer } from './MarkdownRenderer';

export interface ChatMessageItem {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  modelUsed?: string;
  providerName?: string;
  latencyMs?: number;
  tokensCount?: number;
  isStreaming?: boolean;
  error?: string;
  // For parallel comparison mode:
  isParallelComparison?: boolean;
  parallelResults?: Record<
    string,
    {
      modelId: string;
      providerName: string;
      content: string;
      latencyMs: number;
      isStreaming: boolean;
      status: 'pending' | 'streaming' | 'completed' | 'error';
      error?: string;
      tokensCount?: number;
    }
  >;
}

interface ChatConsoleProps {
  providers: AIProvider[];
  settings: GatewaySettings | null;
  onRefreshLogs?: () => void;
  isFloating?: boolean;
  isOpen?: boolean;
  onClose?: () => void;
  onToggleMaximize?: () => void;
  isMaximized?: boolean;
}

export const ChatConsole: React.FC<ChatConsoleProps> = ({
  providers,
  settings,
  onRefreshLogs,
  isFloating = false,
  isOpen = true,
  onClose,
  onToggleMaximize,
  isMaximized = false,
}) => {
  const [selectedModelKey, setSelectedModelKey] = useState<string>('all-models'); // 'all' = Parallel compare, 'auto' = Fallback, or modelId
  const [inputPrompt, setInputPrompt] = useState<string>('');
  const [systemPrompt, setSystemPrompt] = useState<string>(
    'You are a helpful, brilliant AI assistant communicating through the Unified Multi-Provider AI Gateway.'
  );
  const [showSystemPrompt, setShowSystemPrompt] = useState<boolean>(false);
  const [messages, setMessages] = useState<ChatMessageItem[]>([
    {
      id: 'welcome-1',
      role: 'assistant',
      content: `👋 **Welcome to the Unified AI Chat Console!**\n\nYou can prompt any model directly, test the **🛡️ Automatic Fallback Engine**, or select **⚡ All Active Models (Parallel Compare)** to run simultaneous multi-model benchmarks with real-time latency ranking.`,
      timestamp: Date.now(),
      modelUsed: 'Gateway System',
    },
  ]);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-scroll to bottom of messages
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isGenerating, scrollToBottom]);

  // Collect all active models grouped by provider
  const groupedActiveModels: Array<{ provider: AIProvider; models: Array<{ id: string; name: string; priority: number }> }> = [];
  const allActiveFlatModels: Array<{ modelId: string; modelName: string; providerId: string; providerName: string }> = [];

  providers
    .filter((p) => p.enabled)
    .forEach((p) => {
      const active = (p.models || []).filter((m) => m.enabled);
      if (active.length > 0) {
        groupedActiveModels.push({
          provider: p,
          models: active.map((m) => ({ id: m.id, name: m.name, priority: m.priority })),
        });
        active.forEach((m) => {
          allActiveFlatModels.push({
            modelId: m.id,
            modelName: m.name,
            providerId: p.id,
            providerName: p.name,
          });
        });
      }
    });

  // Stop Generation
  const handleStopGenerating = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsGenerating(false);
  };

  // Clear Chat History
  const handleClearChat = () => {
    if (isGenerating) handleStopGenerating();
    setMessages([]);
  };

  const copyMessage = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Helper to stream a single request
  const streamSingleRequest = async (
    targetModel: string | undefined,
    userText: string,
    historyMessages: Array<{ role: string; content: string }>,
    signal: AbortSignal,
    onChunk: (textDelta: string, accumulated: string) => void
  ): Promise<{ fullText: string; latencyMs: number; tokens: number }> => {
    const startTime = Date.now();
    const masterApiKey = settings?.masterApiKey || 'gw-sk-master-live-2026';

    const payloadMessages = [
      ...(systemPrompt.trim() ? [{ role: 'system', content: systemPrompt.trim() }] : []),
      ...historyMessages,
      { role: 'user', content: userText },
    ];

    const res = await fetch('/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${masterApiKey}`,
      },
      body: JSON.stringify({
        model: targetModel,
        messages: payloadMessages,
        stream: true,
      }),
      signal,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `Gateway Error ${res.status}: ${res.statusText}`);
    }

    if (!res.body) {
      throw new Error('No readable response body received from Gateway');
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let accumulated = '';
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
          const raw = trimmed.slice(6);
          if (raw === '[DONE]') continue;
          try {
            const parsed = JSON.parse(raw);
            const delta = parsed.choices?.[0]?.delta?.content || '';
            if (delta) {
              accumulated += delta;
              onChunk(delta, accumulated);
            }
          } catch (e) {
            // Ignore partial SSE JSON parses
          }
        }
      }
    }

    const latencyMs = Date.now() - startTime;
    const tokens = Math.ceil(accumulated.length / 4);
    return { fullText: accumulated, latencyMs, tokens };
  };

  // Main Submit Handler
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const prompt = inputPrompt.trim();
    if (!prompt || isGenerating) return;

    setInputPrompt('');
    setIsGenerating(true);

    const userMessageId = `user-${Date.now()}`;
    const userMsg: ChatMessageItem = {
      id: userMessageId,
      role: 'user',
      content: prompt,
      timestamp: Date.now(),
    };

    // Filter previous conversation context for history
    const history = messages
      .filter((m) => m.role === 'user' || (m.role === 'assistant' && !m.isParallelComparison))
      .map((m) => ({ role: m.role, content: m.content }));

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    // Mode 1: PARALLEL COMPARISON MODE ("all")
    if (selectedModelKey === 'all') {
      const comparisonMsgId = `compare-${Date.now()}`;
      const initialParallelResults: Record<string, any> = {};

      allActiveFlatModels.forEach((m) => {
        initialParallelResults[m.modelId] = {
          modelId: m.modelId,
          providerName: m.providerName,
          content: '',
          latencyMs: 0,
          isStreaming: true,
          status: 'pending',
          tokensCount: 0,
        };
      });

      const assistantMsg: ChatMessageItem = {
        id: comparisonMsgId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        isParallelComparison: true,
        parallelResults: initialParallelResults,
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);

      // Trigger concurrent parallel requests
      const promises = allActiveFlatModels.map(async (item) => {
        const itemStart = Date.now();
        // Update to streaming
        setMessages((prev) =>
          prev.map((msg) => {
            if (msg.id !== comparisonMsgId) return msg;
            return {
              ...msg,
              parallelResults: {
                ...msg.parallelResults,
                [item.modelId]: {
                  ...(msg.parallelResults?.[item.modelId] as any),
                  status: 'streaming',
                },
              },
            };
          })
        );

        try {
          const result = await streamSingleRequest(
            item.modelId,
            prompt,
            history,
            abortController.signal,
            (delta, accumulated) => {
              setMessages((prev) =>
                prev.map((msg) => {
                  if (msg.id !== comparisonMsgId) return msg;
                  return {
                    ...msg,
                    parallelResults: {
                      ...msg.parallelResults,
                      [item.modelId]: {
                        modelId: item.modelId,
                        providerName: item.providerName,
                        content: accumulated,
                        latencyMs: Date.now() - itemStart,
                        isStreaming: true,
                        status: 'streaming',
                        tokensCount: Math.ceil(accumulated.length / 4),
                      },
                    },
                  };
                })
              );
            }
          );

          // Mark completed
          setMessages((prev) =>
            prev.map((msg) => {
              if (msg.id !== comparisonMsgId) return msg;
              return {
                ...msg,
                parallelResults: {
                  ...msg.parallelResults,
                  [item.modelId]: {
                    modelId: item.modelId,
                    providerName: item.providerName,
                    content: result.fullText,
                    latencyMs: result.latencyMs,
                    isStreaming: false,
                    status: 'completed',
                    tokensCount: result.tokens,
                  },
                },
              };
            })
          );
        } catch (err: any) {
          if (err.name === 'AbortError') return;
          // Record failure state
          setMessages((prev) =>
            prev.map((msg) => {
              if (msg.id !== comparisonMsgId) return msg;
              const prevContent = msg.parallelResults?.[item.modelId]?.content || '';
              return {
                ...msg,
                parallelResults: {
                  ...msg.parallelResults,
                  [item.modelId]: {
                    modelId: item.modelId,
                    providerName: item.providerName,
                    content: prevContent,
                    latencyMs: Date.now() - itemStart,
                    isStreaming: false,
                    status: 'error',
                    error: err.message || 'Request failed',
                    tokensCount: Math.ceil(prevContent.length / 4),
                  },
                },
              };
            })
          );
        }
      });

      await Promise.allSettled(promises);
      setIsGenerating(false);
      abortControllerRef.current = null;
      if (onRefreshLogs) onRefreshLogs();
      return;
    }

    // Mode 2: SINGLE MODEL / GATEWAY FALLBACK MODE
    const targetModel = selectedModelKey === 'auto' ? undefined : selectedModelKey;
    const assistantMsgId = `assistant-${Date.now()}`;

    const assistantMsg: ChatMessageItem = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      modelUsed: targetModel || 'Gateway Fallback (P1)',
      isStreaming: true,
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);

    try {
      const result = await streamSingleRequest(
        targetModel,
        prompt,
        history,
        abortController.signal,
        (delta, accumulated) => {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMsgId
                ? {
                    ...msg,
                    content: accumulated,
                    tokensCount: Math.ceil(accumulated.length / 4),
                  }
                : msg
            )
          );
        }
      );

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMsgId
            ? {
                ...msg,
                content: result.fullText,
                latencyMs: result.latencyMs,
                tokensCount: result.tokens,
                isStreaming: false,
              }
            : msg
        )
      );
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMsgId
              ? {
                  ...msg,
                  isStreaming: false,
                  error: err.message || 'Gateway completion failed',
                }
              : msg
          )
        );
      }
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
      if (onRefreshLogs) onRefreshLogs();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  if (!isOpen && isFloating) {
    return null;
  }

  // Find fastest model in parallel results
  const getFastestModelId = (parallelResults?: Record<string, any>) => {
    if (!parallelResults) return null;
    let minLatency = Infinity;
    let fastestId: string | null = null;
    Object.values(parallelResults).forEach((item) => {
      if (item.status === 'completed' && item.latencyMs > 0 && item.latencyMs < minLatency) {
        minLatency = item.latencyMs;
        fastestId = item.modelId;
      }
    });
    return fastestId;
  };

  return (
    <div
      className={`flex flex-col bg-slate-950 border border-slate-800 shadow-2xl transition-all duration-200 ${
        isFloating
          ? isMaximized
            ? 'fixed inset-4 z-50 rounded-2xl'
            : 'fixed bottom-5 right-5 z-50 w-[95vw] sm:w-[480px] md:w-[560px] h-[640px] max-h-[88vh] rounded-2xl'
          : 'w-full h-[720px] rounded-2xl'
      }`}
    >
      {/* Top Console Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800/90 bg-slate-900/80 rounded-t-2xl">
        <div className="flex items-center gap-2.5">
          <div className="relative flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-indigo-600 text-white shadow-sm shadow-cyan-500/20">
            <MessageSquareCode className="w-4 h-4" />
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full border border-slate-950 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white tracking-tight">AI Chat Console</h3>
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800/60 uppercase">
                Gateway SSE
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              {allActiveFlatModels.length} active models connected
            </p>
          </div>
        </div>

        {/* Header Controls */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowSystemPrompt(!showSystemPrompt)}
            title="Configure System Prompt"
            className={`p-1.5 rounded-lg text-xs transition-colors ${
              showSystemPrompt
                ? 'bg-cyan-950 border border-cyan-800 text-cyan-300'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Bot className="w-4 h-4" />
          </button>

          <button
            onClick={handleClearChat}
            title="Clear Chat History"
            className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>

          {isFloating && onToggleMaximize && (
            <button
              onClick={onToggleMaximize}
              title={isMaximized ? 'Minimize Window' : 'Maximize Window'}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            >
              {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          )}

          {isFloating && onClose && (
            <button
              onClick={onClose}
              title="Close Console"
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Model Selector Bar */}
      <div className="px-4 py-2 bg-slate-900/40 border-b border-slate-800/60 flex items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 flex-1">
          <Layers className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <span className="text-slate-400 font-medium shrink-0">Model:</span>
          <select
            value={selectedModelKey}
            onChange={(e) => setSelectedModelKey(e.target.value)}
            disabled={isGenerating}
            className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-cyan-500 font-semibold truncate"
          >
            <option value="all-models">
              ⚡ "all-models" (OpenRouter-Style Dynamic Fallback Waterfall)
            </option>
            <option value="all">
              ⚡ All Active Models (Parallel Benchmark & Compare - {allActiveFlatModels.length} models)
            </option>
            <option value="auto">
              🛡️ Gateway Priority Auto-Failover
            </option>
            {groupedActiveModels.map(({ provider, models }) => (
              <optgroup key={provider.id} label={`── ${provider.name} (${provider.protocol}) ──`}>
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} (P{m.priority})
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        {selectedModelKey === 'all' && (
          <span className="shrink-0 text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-amber-950/70 text-amber-300 border border-amber-800/80">
            Multi-Stream Grid
          </span>
        )}
      </div>

      {/* Collapsible System Prompt Drawer */}
      {showSystemPrompt && (
        <div className="px-4 py-2.5 bg-slate-900/60 border-b border-slate-800 space-y-1.5 animate-fadeIn">
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span className="font-semibold text-slate-300">System Instruction Persona</span>
            <button
              onClick={() =>
                setSystemPrompt(
                  'You are a helpful, brilliant AI assistant communicating through the Unified Multi-Provider AI Gateway.'
                )
              }
              className="text-cyan-400 hover:underline"
            >
              Reset Default
            </button>
          </div>
          <textarea
            rows={2}
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder="Customize system prompt..."
            className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
          />
        </div>
      )}

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 py-12 space-y-2">
            <Sparkles className="w-8 h-8 text-cyan-500/40" />
            <p className="text-xs text-slate-400">Ready to chat! Select a model or Parallel Compare and send a prompt.</p>
          </div>
        )}

        {messages.map((msg) => {
          const isUser = msg.role === 'user';

          if (isUser) {
            return (
              <div key={msg.id} className="flex justify-end items-start gap-2.5">
                <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-gradient-to-r from-cyan-600 to-indigo-600 text-white p-3.5 shadow-md text-sm leading-relaxed whitespace-pre-wrap select-text">
                  {msg.content}
                </div>
                <div className="w-7 h-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 shrink-0 mt-0.5">
                  <User className="w-4 h-4" />
                </div>
              </div>
            );
          }

          // Case A: Parallel Comparison Response
          if (msg.isParallelComparison && msg.parallelResults) {
            const fastestId = getFastestModelId(msg.parallelResults);
            const results = Object.values(msg.parallelResults);

            return (
              <div key={msg.id} className="space-y-3">
                <div className="flex items-center justify-between text-xs text-slate-400 px-1">
                  <div className="flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-amber-400" />
                    <span className="font-semibold text-white">Parallel Model Benchmark & Live Stream</span>
                  </div>
                  <span className="font-mono text-[11px] text-slate-400">
                    {results.filter((r) => r.status === 'completed').length} / {results.length} completed
                  </span>
                </div>

                {/* Grid Comparison Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {results.map((res) => {
                    const isFastest = fastestId === res.modelId;
                    const cardCopied = copiedId === `${msg.id}-${res.modelId}`;

                    return (
                      <div
                        key={res.modelId}
                        className={`rounded-xl border flex flex-col justify-between overflow-hidden transition-all ${
                          res.status === 'error'
                            ? 'bg-rose-950/30 border-rose-900/60'
                            : isFastest && res.status === 'completed'
                            ? 'bg-slate-900/90 border-amber-500/60 shadow-lg shadow-amber-500/10'
                            : 'bg-slate-900/70 border-slate-800'
                        }`}
                      >
                        {/* Card Header */}
                        <div className="px-3.5 py-2 bg-slate-950/80 border-b border-slate-800/80 flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono font-bold text-xs text-cyan-300 truncate">
                                {res.modelId}
                              </span>
                              {isFastest && res.status === 'completed' && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-700 shrink-0">
                                  ⚡ Fastest
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-400 truncate">
                              {res.providerName}
                            </div>
                          </div>

                          {/* Stats badge */}
                          <div className="flex items-center gap-1.5 shrink-0">
                            {res.status === 'streaming' && (
                              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                            )}
                            {res.latencyMs > 0 && (
                              <span
                                className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                                  res.latencyMs < 600
                                    ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                                    : res.latencyMs < 1500
                                    ? 'bg-indigo-950 text-indigo-300 border-indigo-800'
                                    : 'bg-slate-800 text-slate-300 border-slate-700'
                                }`}
                              >
                                {res.latencyMs} ms
                              </span>
                            )}
                            {res.content && (
                              <button
                                onClick={() => copyMessage(res.content, `${msg.id}-${res.modelId}`)}
                                title="Copy answer"
                                className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800"
                              >
                                {cardCopied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Card Body */}
                        <div className="p-3.5 flex-1 min-h-[100px] overflow-y-auto max-h-[300px]">
                          {res.status === 'pending' && (
                            <div className="text-slate-500 text-xs italic flex items-center gap-1.5 py-4">
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-pulse" />
                              <span>Waiting for turn...</span>
                            </div>
                          )}

                          {res.status === 'error' && (
                            <div className="text-rose-300 text-xs space-y-1 py-1">
                              <div className="flex items-center gap-1 font-semibold">
                                <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                                <span>Execution Failed / Rate Limit</span>
                              </div>
                              <p className="font-mono text-[11px] text-rose-300/80 break-words">
                                {res.error}
                              </p>
                            </div>
                          )}

                          {res.content && (
                            <div className="text-xs">
                              <MarkdownRenderer content={res.content} />
                              {res.status === 'streaming' && (
                                <span className="inline-block w-1.5 h-3.5 bg-cyan-400 ml-1 animate-pulse align-middle" />
                              )}
                            </div>
                          )}
                        </div>

                        {/* Card Footer */}
                        <div className="px-3 py-1.5 bg-slate-950/60 border-t border-slate-800/60 flex items-center justify-between text-[10px] text-slate-500 font-mono">
                          <span>Status: {res.status}</span>
                          {res.tokensCount ? <span>~{res.tokensCount} tokens</span> : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          }

          // Case B: Standard Single Model Response
          const isMsgCopied = copiedId === msg.id;

          return (
            <div key={msg.id} className="flex items-start gap-2.5">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-600 to-cyan-600 flex items-center justify-center text-white shrink-0 mt-0.5 shadow-sm">
                <Bot className="w-4 h-4" />
              </div>
              <div className="flex-1 max-w-[92%] space-y-1.5">
                {/* Assistant Bubble */}
                <div className="rounded-2xl rounded-tl-sm bg-slate-900 border border-slate-800 p-4 text-sm leading-relaxed shadow-md">
                  {msg.error ? (
                    <div className="text-rose-300 text-xs flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold block">Gateway Error:</span>
                        <span className="font-mono text-[11px]">{msg.error}</span>
                      </div>
                    </div>
                  ) : msg.content ? (
                    <div>
                      <MarkdownRenderer content={msg.content} />
                      {msg.isStreaming && (
                        <span className="inline-block w-2 h-4 bg-cyan-400 ml-1 animate-pulse align-middle" />
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-slate-400 text-xs py-1">
                      <div className="w-3 h-3 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin" />
                      <span>Streaming response from Gateway...</span>
                    </div>
                  )}
                </div>

                {/* Message Meta Footnote */}
                <div className="flex items-center justify-between px-1 text-[11px] text-slate-500">
                  <div className="flex items-center gap-2">
                    {msg.modelUsed && (
                      <span className="font-mono text-cyan-400/90 font-medium">
                        {msg.modelUsed}
                      </span>
                    )}
                    {msg.latencyMs ? (
                      <>
                        <span>•</span>
                        <span className="flex items-center gap-1 font-mono text-emerald-400">
                          <Clock className="w-3 h-3" />
                          {msg.latencyMs} ms
                        </span>
                      </>
                    ) : null}
                    {msg.tokensCount ? (
                      <>
                        <span>•</span>
                        <span>{msg.tokensCount} tokens</span>
                      </>
                    ) : null}
                  </div>

                  {msg.content && (
                    <button
                      onClick={() => copyMessage(msg.content, msg.id)}
                      className="flex items-center gap-1 text-slate-400 hover:text-white transition-colors"
                    >
                      {isMsgCopied ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-400">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Form Bar */}
      <div className="p-3 bg-slate-900/90 border-t border-slate-800 rounded-b-2xl">
        <form onSubmit={handleSendMessage} className="space-y-2">
          <div className="relative flex items-center bg-slate-950 border border-slate-800 rounded-xl focus-within:border-cyan-500 transition-colors">
            <textarea
              ref={textareaRef}
              rows={2}
              value={inputPrompt}
              onChange={(e) => setInputPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                selectedModelKey === 'all'
                  ? 'Send prompt to benchmark ALL active models concurrently...'
                  : 'Type prompt... (Press Enter to send, Shift+Enter for newline)'
              }
              className="w-full px-3.5 py-2.5 bg-transparent text-xs text-white placeholder-slate-500 resize-none focus:outline-none"
            />

            <div className="pr-3 flex items-center gap-2">
              {isGenerating ? (
                <button
                  type="button"
                  onClick={handleStopGenerating}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-md transition-colors"
                >
                  <Square className="w-3 h-3 fill-current" />
                  <span>Stop</span>
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!inputPrompt.trim()}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white text-xs font-semibold shadow-md shadow-cyan-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  <Send className="w-3 h-3" />
                  <span>Send</span>
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-500 px-1">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>
                {selectedModelKey === 'all'
                  ? `Broadcasting to ${allActiveFlatModels.length} models simultaneously`
                  : `Routing to ${selectedModelKey === 'auto' ? 'Gateway Auto-Fallback' : selectedModelKey}`}
              </span>
            </div>
            <span>Markdown & Code format supported</span>
          </div>
        </form>
      </div>
    </div>
  );
};
