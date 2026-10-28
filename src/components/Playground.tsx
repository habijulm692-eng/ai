import React, { useState } from 'react';
import {
  Terminal,
  Send,
  Loader2,
  Sliders,
  Sparkles,
  Zap,
  Repeat,
  Check,
  Copy,
  Clock,
  Code,
  Shield,
  Layers,
  Key,
} from 'lucide-react';
import { AIProvider, ClientApiKey, GatewaySettings } from '../types/gateway';
import { callGatewayCompletion } from '../services/api';

interface PlaygroundProps {
  providers: AIProvider[];
  clientKeys?: ClientApiKey[];
  settings: GatewaySettings | null;
  onRefreshLogs: () => void;
}

export const Playground: React.FC<PlaygroundProps> = ({
  providers,
  clientKeys = [],
  settings,
  onRefreshLogs,
}) => {
  const [selectedModel, setSelectedModel] = useState<string>('all-models'); // 'all-models' OpenRouter waterfall
  const [selectedKeyId, setSelectedKeyId] = useState<string>('master');
  const [systemPrompt, setSystemPrompt] = useState('You are an expert AI assistant routing through the Unified Multi-Provider Gateway.');
  const [userPrompt, setUserPrompt] = useState('Explain why an OpenRouter-style dynamic fallback waterfall prevents downtime during rate limits.');
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(1024);
  const [isStreaming, setIsStreaming] = useState(true);

  const [loading, setLoading] = useState(false);
  const [responseText, setResponseText] = useState('');
  const [rawResponse, setRawResponse] = useState<any>(null);
  const [executionStats, setExecutionStats] = useState<{
    latency: number;
    tokens?: number;
    promptTokens?: number;
    completionTokens?: number;
    model?: string;
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [activeView, setActiveView] = useState<'preview' | 'json' | 'code'>('preview');
  const [copiedCode, setCopiedCode] = useState(false);

  // Extract all active models across active providers
  const activeModels: Array<{ id: string; name: string; providerName: string; priority: number }> = [];
  providers
    .filter((p) => p.enabled)
    .forEach((p) => {
      p.models
        .filter((m) => m.enabled)
        .forEach((m) => {
          activeModels.push({
            id: m.id,
            name: m.name,
            providerName: p.name,
            priority: m.priority,
          });
        });
    });

  // Sort by priority
  activeModels.sort((a, b) => a.priority - b.priority);

  // Determine which active key string to use for the call
  const activeClientKeyObj = clientKeys.find((k) => k.id === selectedKeyId);
  const currentToken =
    selectedKeyId === 'master'
      ? settings?.masterApiKey || 'gw-sk-master-live-2026'
      : activeClientKeyObj?.key || settings?.masterApiKey || 'gw-sk-master-live-2026';

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!userPrompt.trim() || loading) return;

    setLoading(true);
    setResponseText('');
    setRawResponse(null);
    setErrorMsg(null);
    setExecutionStats(null);

    const startTime = Date.now();

    const messages = [
      ...(systemPrompt.trim() ? [{ role: 'system', content: systemPrompt.trim() }] : []),
      { role: 'user', content: userPrompt.trim() },
    ];

    try {
      const result = await callGatewayCompletion({
        model: selectedModel,
        messages,
        stream: isStreaming,
        temperature,
        max_tokens: maxTokens,
        masterApiKey: currentToken,
        onChunk: (accumulated) => {
          setResponseText(accumulated);
        },
      });

      const latency = Date.now() - startTime;
      if (!isStreaming) {
        const text = result?.choices?.[0]?.message?.content || '';
        setResponseText(text);
      }
      setRawResponse(result);

      const promptTokens = result?.usage?.prompt_tokens || Math.ceil(JSON.stringify(messages).length / 4);
      const completionTokens = result?.usage?.completion_tokens || Math.ceil((responseText.length || 100) / 4);

      setExecutionStats({
        latency,
        tokens: promptTokens + completionTokens,
        promptTokens,
        completionTokens,
        model: result?.model || selectedModel,
      });

      // Refresh logs table
      onRefreshLogs();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to complete request through Gateway');
    } finally {
      setLoading(false);
    }
  };

  const samplePrompts = [
    { label: 'Quantum Computing', text: 'Explain quantum computing in three clear, non-technical bullet points.' },
    { label: 'Dynamic Fallback', text: 'How does an OpenRouter-style dynamic fallback waterfall handle 429 rate limits?' },
    { label: 'Python Async', text: 'Write a concise Python async function with retry logic and exponential backoff.' },
  ];

  const host = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';

  const codeSnippet = `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "${host}/api/v1",
  apiKey: "${currentToken}",
});

async function main() {
  const completion = await client.chat.completions.create({
    model: "${selectedModel}", // "all-models" enables automatic OpenRouter waterfall
    messages: [
      { role: "system", content: "${systemPrompt.replace(/"/g, '\\"')}" },
      { role: "user", content: "${userPrompt.replace(/"/g, '\\"')}" }
    ],
    temperature: ${temperature},
    stream: ${isStreaming},
  });

  console.log(completion);
}
main();`;

  const copyCode = () => {
    navigator.clipboard.writeText(codeSnippet);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Terminal className="w-5 h-5 text-cyan-400" />
          <span>Interactive Gateway Playground</span>
        </h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Send live requests through <code className="text-cyan-300">/api/v1/chat/completions</code> using any client API key, testing the <code className="text-cyan-300">"all-models"</code> OpenRouter dynamic waterfall.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Form & Controls (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
            {/* Model Selection */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center justify-between">
                <span>Model / Routing Strategy</span>
                <span className="text-[10px] text-cyan-400 font-mono">
                  {activeModels.length} models active
                </span>
              </label>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500 font-medium"
              >
                <option value="all-models">
                  ⚡ "all-models" (OpenRouter-Style Dynamic Fallback Waterfall)
                </option>
                {activeModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    P{m.priority} • {m.providerName}: {m.id}
                  </option>
                ))}
              </select>
              {selectedModel === 'all-models' && (
                <div className="mt-1.5 p-2 rounded-lg bg-amber-950/40 border border-amber-800/60 text-[11px] text-amber-300 flex items-center gap-1.5">
                  <Repeat className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>Waterfall: Tries P1 model first. If 429/500/503 occurs, instantly retries P2 without dropping connection!</span>
                </div>
              )}
            </div>

            {/* API Key Selection */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center justify-between">
                <span>Authenticated API Key</span>
                <span className="text-[10px] text-slate-400">Tracks token usage per key</span>
              </label>
              <select
                value={selectedKeyId}
                onChange={(e) => setSelectedKeyId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
              >
                <option value="master">
                  Master Key ({settings?.masterApiKey ? `••••${settings.masterApiKey.slice(-4)}` : 'Default'})
                </option>
                {clientKeys.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.name} (••••{k.key.slice(-4)}) — {k.totalTokens.toLocaleString()} tokens
                  </option>
                ))}
              </select>
            </div>

            {/* System Prompt */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                System Prompt (Optional)
              </label>
              <textarea
                rows={2}
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="Set behavior or instructions..."
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-300 focus:outline-none focus:border-cyan-500"
              />
            </div>

            {/* User Prompt */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-300">
                  User Prompt
                </label>
                <div className="flex items-center gap-1">
                  {samplePrompts.map((s, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setUserPrompt(s.text)}
                      className="text-[10px] text-cyan-400 hover:text-cyan-300 bg-slate-950 hover:bg-slate-800 px-2 py-0.5 rounded border border-slate-800 transition-colors"
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
              <textarea
                rows={4}
                value={userPrompt}
                onChange={(e) => setUserPrompt(e.target.value)}
                placeholder="Enter prompt to execute via Gateway..."
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500"
              />
            </div>

            {/* Inference Parameters */}
            <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-800/80">
              <div>
                <div className="flex items-center justify-between text-xs text-slate-300 mb-1">
                  <span>Temperature</span>
                  <span className="font-mono text-cyan-400">{temperature}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={temperature}
                  onChange={(e) => setTemperature(parseFloat(e.target.value))}
                  className="w-full accent-cyan-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between text-xs text-slate-300 mb-1">
                  <span>Max Tokens</span>
                  <span className="font-mono text-cyan-400">{maxTokens}</span>
                </div>
                <input
                  type="range"
                  min="64"
                  max="4096"
                  step="64"
                  value={maxTokens}
                  onChange={(e) => setMaxTokens(parseInt(e.target.value, 10))}
                  className="w-full accent-cyan-500"
                />
              </div>
            </div>

            {/* Streaming Toggle */}
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-slate-300 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-cyan-400" />
                <span>Stream Response (SSE chunks)</span>
              </span>
              <button
                type="button"
                onClick={() => setIsStreaming(!isStreaming)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border border-transparent transition-colors duration-200 ease-in-out ${
                  isStreaming ? 'bg-cyan-500' : 'bg-slate-800'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    isStreaming ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Execute Button */}
            <button
              onClick={handleSend}
              disabled={loading || !userPrompt.trim()}
              className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-cyan-500 via-indigo-600 to-violet-600 hover:from-cyan-400 hover:to-indigo-500 text-white font-semibold text-xs shadow-lg shadow-cyan-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Routing through Dynamic Fallback Waterfall...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Send Request</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Right Column: Output & Code (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 flex flex-col h-full min-h-[480px] shadow-xl">
            {/* View Switcher & Telemetry Bar */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
                <button
                  onClick={() => setActiveView('preview')}
                  className={`px-3 py-1 rounded-lg transition-colors ${
                    activeView === 'preview' ? 'bg-slate-800 text-white font-medium' : 'text-slate-400'
                  }`}
                >
                  Output Preview
                </button>
                <button
                  onClick={() => setActiveView('json')}
                  className={`px-3 py-1 rounded-lg transition-colors ${
                    activeView === 'json' ? 'bg-slate-800 text-white font-medium' : 'text-slate-400'
                  }`}
                >
                  Raw JSON
                </button>
                <button
                  onClick={() => setActiveView('code')}
                  className={`px-3 py-1 rounded-lg transition-colors ${
                    activeView === 'code' ? 'bg-slate-800 text-white font-medium' : 'text-slate-400'
                  }`}
                >
                  OpenAI Client Code
                </button>
              </div>

              {/* Execution Stats Badge */}
              {executionStats && (
                <div className="flex items-center gap-2 text-[11px] font-mono text-emerald-400">
                  <span className="flex items-center gap-1 bg-emerald-950/70 border border-emerald-800/80 px-2 py-0.5 rounded-lg">
                    <Clock className="w-3 h-3" />
                    {executionStats.latency} ms
                  </span>
                  {executionStats.tokens && (
                    <span className="bg-slate-800 px-2 py-0.5 rounded-lg text-slate-300">
                      {executionStats.tokens} tokens ({executionStats.promptTokens} in / {executionStats.completionTokens} out)
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Error Message */}
            {errorMsg && (
              <div className="my-3 p-3 rounded-xl bg-rose-950/70 border border-rose-800 text-rose-300 text-xs">
                <strong>Gateway Error:</strong> {errorMsg}
              </div>
            )}

            {/* Output Panels */}
            <div className="flex-1 mt-3 overflow-y-auto">
              {activeView === 'preview' && (
                <div className="h-full">
                  {loading && !responseText ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-500 py-20 space-y-3">
                      <div className="w-8 h-8 rounded-full border-2 border-cyan-500 border-t-transparent animate-spin" />
                      <span className="text-xs">Cascading through models & generating completion...</span>
                    </div>
                  ) : responseText ? (
                    <div className="p-4 bg-slate-950 rounded-xl border border-slate-800/80 text-slate-100 text-sm leading-relaxed whitespace-pre-wrap font-sans">
                      {responseText}
                      {loading && (
                        <span className="inline-block w-2 h-4 bg-cyan-400 ml-1 animate-pulse align-middle" />
                      )}
                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-slate-500 py-20 text-center">
                      <Sparkles className="w-8 h-8 text-slate-600 mb-2 opacity-50" />
                      <p className="text-xs">No response yet. Click "Send Request" to test the Gateway.</p>
                    </div>
                  )}
                </div>
              )}

              {activeView === 'json' && (
                <pre className="p-4 bg-slate-950 rounded-xl border border-slate-800/80 text-xs font-mono text-cyan-300 overflow-x-auto h-full max-h-[400px]">
                  {rawResponse ? JSON.stringify(rawResponse, null, 2) : '// Send a request to inspect raw JSON'}
                </pre>
              )}

              {activeView === 'code' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">Client Code Integration with selected Key:</span>
                    <button
                      onClick={copyCode}
                      className="flex items-center gap-1 px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors"
                    >
                      {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedCode ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                  <pre className="p-4 bg-slate-950 rounded-xl border border-slate-800/80 text-xs font-mono text-slate-300 overflow-x-auto">
                    {codeSnippet}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
