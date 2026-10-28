import React, { useState } from 'react';
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Layers,
  Cpu,
  Copy,
  Check,
  ArrowRight,
  Shield,
  Zap,
  Repeat,
  Terminal,
  GitBranch,
} from 'lucide-react';
import { AIProvider, GatewayLog, GatewaySettings } from '../types/gateway';

interface OverviewProps {
  providers: AIProvider[];
  logs: GatewayLog[];
  settings: GatewaySettings | null;
  onNavigate: (tab: string) => void;
  onInspectLog: (log: GatewayLog) => void;
}

export const Overview: React.FC<OverviewProps> = ({
  providers,
  logs,
  settings,
  onNavigate,
  onInspectLog,
}) => {
  const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null);

  const totalRequests = logs.length;
  const successfulRequests = logs.filter((l) => l.status === 'success').length;
  const failedRequests = logs.filter((l) => l.status === 'failure').length;
  const fallbackRequests = logs.filter((l) => l.wasFallback).length;

  const successRate = totalRequests > 0 ? Math.round((successfulRequests / totalRequests) * 100) : 100;
  const fallbackRate = totalRequests > 0 ? Math.round((fallbackRequests / totalRequests) * 100) : 0;

  const totalLatency = logs.reduce((acc, curr) => acc + (curr.latencyMs || 0), 0);
  const avgLatency = totalRequests > 0 ? Math.round(totalLatency / totalRequests) : 0;

  const activeProvidersCount = providers.filter((p) => p.enabled).length;
  const totalModelsCount = providers.reduce(
    (acc, p) => acc + (p.models?.filter((m) => m.enabled)?.length || 0),
    0
  );

  const masterKey = settings?.masterApiKey || 'gw-sk-master-live-2026';
  const host = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';

  const curlExample = `curl -X POST "${host}/api/v1/chat/completions" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${masterKey}" \\
  -d '{
    "model": "all-models",
    "messages": [
      {"role": "user", "content": "Explain quantum computing in one sentence."}
    ],
    "temperature": 0.7
  }'

# Or discover all models:
# curl "${host}/api/v1/models" -H "Authorization: Bearer ${masterKey}"`;

  const pythonExample = `from openai import OpenAI

client = OpenAI(
    base_url="${host}/api/v1",
    api_key="${masterKey}" # Or any client-specific key!
)

# "all-models" runs OpenRouter waterfall across P1, P2, P3...
response = client.chat.completions.create(
    model="all-models",
    messages=[{"role": "user", "content": "Hello via OpenRouter-style Dynamic Fallback!"}]
)
print(response.choices[0].message.content)`;

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSnippet(id);
    setTimeout(() => setCopiedSnippet(null), 2000);
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Top Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950/60 to-slate-900 border border-slate-800 p-6 md:p-8">
        <div className="absolute top-0 right-0 -mt-12 -mr-12 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-cyan-950/70 border border-cyan-800/60 text-cyan-300 text-xs font-semibold">
              <Zap className="w-3.5 h-3.5 text-cyan-400" />
              Dynamic In-Memory Cache (TTL: {settings?.cacheTtlSeconds || 60}s) & Auto-Fallback
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
              Unified Multi-Provider AI Gateway
            </h1>
            <p className="text-slate-300 text-sm leading-relaxed">
              Standardized OpenAI client interface routing across Google AI Studio (Gemini Native), Groq, OpenRouter, and xKiro. Pure dynamic database architecture with zero file edits, automatic 429 rate limit failover, and real-time health logging.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => onNavigate('playground')}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white font-semibold text-sm shadow-lg shadow-cyan-500/25 transition-all"
            >
              <Terminal className="w-4 h-4" />
              <span>Open Playground</span>
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => onNavigate('pipeline')}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 font-medium text-sm transition-all"
            >
              <GitBranch className="w-4 h-4 text-cyan-400" />
              <span>Fallback Pipeline</span>
            </button>
            <button
              onClick={() => onNavigate('providers')}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 font-medium text-sm transition-all"
            >
              <Layers className="w-4 h-4 text-slate-400" />
              <span>Manage Providers</span>
            </button>
          </div>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Total Requests */}
        <div className="bg-slate-900/70 border border-slate-800/80 rounded-xl p-4">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Total Requests</span>
            <Activity className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-extrabold text-white font-mono">{totalRequests}</div>
          <div className="mt-1 text-xs text-slate-400 flex items-center gap-1.5">
            <span className="text-emerald-400 font-medium">{successfulRequests} ok</span>
            <span>•</span>
            <span className="text-rose-400 font-medium">{failedRequests} err</span>
          </div>
        </div>

        {/* Success Rate */}
        <div className="bg-slate-900/70 border border-slate-800/80 rounded-xl p-4">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Success Rate</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-extrabold text-white font-mono">{successRate}%</div>
          <div className="mt-1.5 w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-emerald-500 h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${successRate}%` }}
            />
          </div>
        </div>

        {/* Average Latency */}
        <div className="bg-slate-900/70 border border-slate-800/80 rounded-xl p-4">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Avg Latency</span>
            <Clock className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-extrabold text-white font-mono">
            {avgLatency} <span className="text-sm font-normal text-slate-400">ms</span>
          </div>
          <div className="mt-1 text-xs text-slate-400">
            {avgLatency < 800 ? '⚡ Ultra-fast response' : 'Standard roundtrip'}
          </div>
        </div>

        {/* Fallback Engine */}
        <div className="bg-slate-900/70 border border-slate-800/80 rounded-xl p-4">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Fallbacks Handled</span>
            <Repeat className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-extrabold text-white font-mono">{fallbackRequests}</div>
          <div className="mt-1 text-xs text-amber-400/90 font-medium">
            {fallbackRate}% recovered seamlessly
          </div>
        </div>

        {/* Active Capacity */}
        <div className="bg-slate-900/70 border border-slate-800/80 rounded-xl p-4">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Active Capacity</span>
            <Cpu className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-extrabold text-white font-mono">
            {activeProvidersCount} <span className="text-xs text-slate-400">prov</span> / {totalModelsCount} <span className="text-xs text-slate-400">mod</span>
          </div>
          <div className="mt-1 text-xs text-emerald-400 font-medium">
            Dynamic load-ready
          </div>
        </div>
      </div>

      {/* Visual Gateway Architecture Card */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6">
        <h2 className="text-base font-bold text-white mb-4 flex items-center gap-2">
          <Shield className="w-4 h-4 text-cyan-400" />
          <span>Gateway Architecture & Fallback Mechanics</span>
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 relative">
          {/* Step 1 */}
          <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-4 relative">
            <div className="text-[11px] font-semibold text-cyan-400 uppercase tracking-wider mb-1">
              Step 1: Ingestion
            </div>
            <div className="text-sm font-bold text-white mb-1">OpenAI Client Request</div>
            <p className="text-xs text-slate-400">
              Accepts standard OpenAI format at <code className="text-cyan-300">/api/v1/chat/completions</code> with Master Bearer Auth.
            </p>
          </div>

          {/* Step 2 */}
          <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-4 relative">
            <div className="text-[11px] font-semibold text-indigo-400 uppercase tracking-wider mb-1">
              Step 2: Dynamic Resolution
            </div>
            <div className="text-sm font-bold text-white mb-1">In-Memory Cache (TTL 60s)</div>
            <p className="text-xs text-slate-400">
              Retrieves providers & active models without hitting Firebase on every request, ensuring 0ms DB overhead.
            </p>
          </div>

          {/* Step 3 */}
          <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-4 relative">
            <div className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider mb-1">
              Step 3: Protocol & Fallback
            </div>
            <div className="text-sm font-bold text-white mb-1">Auto-Failover Engine</div>
            <p className="text-xs text-slate-400">
              Translates to Gemini Native or OpenAI. If 429 (rate-limit) or 5xx occurs, automatically jumps to Priority 2.
            </p>
          </div>

          {/* Step 4 */}
          <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-4 relative">
            <div className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider mb-1">
              Step 4: Real-time Telemetry
            </div>
            <div className="text-sm font-bold text-white mb-1">7-Day Auto Purge Logs</div>
            <p className="text-xs text-slate-400">
              Persists latency, tokens, status to Firebase RTDB. Cron purges logs older than 7 days automatically.
            </p>
          </div>
        </div>
      </div>

      {/* Code Snippets & Quick Integration */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* cURL Request */}
        <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                cURL CLI Request
              </span>
              <button
                onClick={() => copyToClipboard(curlExample, 'curl')}
                className="flex items-center gap-1 px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md transition-colors"
              >
                {copiedSnippet === 'curl' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>
            <pre className="p-3 bg-slate-950 rounded-xl text-xs text-slate-300 font-mono overflow-x-auto border border-slate-800/80">
              {curlExample}
            </pre>
          </div>
          <div className="mt-3 text-[11px] text-slate-400 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            Works with any OpenAI-compatible client, LangChain, LlamaIndex, or Cursor!
          </div>
        </div>

        {/* Python / Node SDK */}
        <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                <Cpu className="w-3.5 h-3.5 text-indigo-400" />
                Official OpenAI SDK (Python / Node.js)
              </span>
              <button
                onClick={() => copyToClipboard(pythonExample, 'python')}
                className="flex items-center gap-1 px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md transition-colors"
              >
                {copiedSnippet === 'python' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>
            <pre className="p-3 bg-slate-950 rounded-xl text-xs text-slate-300 font-mono overflow-x-auto border border-slate-800/80">
              {pythonExample}
            </pre>
          </div>
          <div className="mt-3 text-[11px] text-slate-400 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-indigo-400" />
            Just point <code className="text-cyan-300">base_url</code> to your Gateway endpoint.
          </div>
        </div>
      </div>

      {/* Recent Activity Table Preview */}
      <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-cyan-400" />
              <span>Recent Gateway Activity</span>
            </h2>
            <p className="text-xs text-slate-400">Live feed of requests routed through the gateway</p>
          </div>
          <button
            onClick={() => onNavigate('logs')}
            className="text-xs text-cyan-400 hover:text-cyan-300 font-medium flex items-center gap-1"
          >
            <span>View All Logs</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {logs.length === 0 ? (
          <div className="text-center py-10 text-slate-500 text-sm">
            No requests logged yet. Open the Playground to send your first test prompt!
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/60 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-3 font-semibold">Time</th>
                  <th className="py-2.5 px-3 font-semibold">Provider</th>
                  <th className="py-2.5 px-3 font-semibold">Model</th>
                  <th className="py-2.5 px-3 font-semibold">Status</th>
                  <th className="py-2.5 px-3 font-semibold">Latency</th>
                  <th className="py-2.5 px-3 font-semibold">Type</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Inspect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {logs.slice(0, 5).map((log) => (
                  <tr key={log.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-2.5 px-3 font-mono text-slate-400">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </td>
                    <td className="py-2.5 px-3 font-medium text-slate-200">
                      {log.providerName}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-cyan-400">
                      {log.model}
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold ${
                          log.status === 'success'
                            ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/60'
                            : log.statusCode === 429
                            ? 'bg-amber-950/80 text-amber-300 border border-amber-800/60'
                            : 'bg-rose-950/80 text-rose-300 border border-rose-800/60'
                        }`}
                      >
                        {log.statusCode} {log.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-300">
                      {log.latencyMs} ms
                    </td>
                    <td className="py-2.5 px-3">
                      {log.wasFallback ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-900/50 text-amber-300 border border-amber-700/50">
                          Fallback Triggered
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-500">Direct</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <button
                        onClick={() => onInspectLog(log)}
                        className="text-slate-400 hover:text-white px-2 py-1 rounded bg-slate-800/80 hover:bg-slate-700 transition-colors"
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
