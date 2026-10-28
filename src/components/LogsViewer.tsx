import React, { useState, useEffect } from 'react';
import {
  ScrollText,
  Filter,
  Search,
  Trash2,
  RefreshCw,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Repeat,
  Sparkles,
  Info,
  Calendar,
  Layers,
  ArrowRight,
  Key,
  ShieldCheck,
  Zap,
  GitBranch,
} from 'lucide-react';
import { AIProvider, ClientApiKey, GatewayLog } from '../types/gateway';
import { clearAllLogs, trigger7DayCleanup } from '../services/api';

interface LogsViewerProps {
  logs: GatewayLog[];
  providers: AIProvider[];
  clientKeys?: ClientApiKey[];
  onRefresh: () => void;
  selectedLog: GatewayLog | null;
  setSelectedLog: (log: GatewayLog | null) => void;
  initialApiKeyFilter?: string;
}

export const LogsViewer: React.FC<LogsViewerProps> = ({
  logs,
  providers,
  clientKeys = [],
  onRefresh,
  selectedLog,
  setSelectedLog,
  initialApiKeyFilter = 'all',
}) => {
  const [statusFilter, setStatusFilter] = useState('all');
  const [providerFilter, setProviderFilter] = useState('all');
  const [apiKeyFilter, setApiKeyFilter] = useState(initialApiKeyFilter);
  const [searchQuery, setSearchQuery] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [isCleaning, setIsCleaning] = useState(false);
  const [cleanupMessage, setCleanupMessage] = useState<string | null>(null);

  // Sync initialApiKeyFilter if changed externally
  useEffect(() => {
    if (initialApiKeyFilter) {
      setApiKeyFilter(initialApiKeyFilter);
    }
  }, [initialApiKeyFilter]);

  // Auto-refresh interval
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      onRefresh();
    }, 4000);
    return () => clearInterval(interval);
  }, [autoRefresh, onRefresh]);

  const handleClear = async () => {
    if (confirm('Clear all gateway logs?')) {
      await clearAllLogs();
      onRefresh();
    }
  };

  const handleTriggerCleanup = async () => {
    setIsCleaning(true);
    setCleanupMessage(null);
    try {
      const res = await trigger7DayCleanup();
      setCleanupMessage(res.message);
      onRefresh();
      setTimeout(() => setCleanupMessage(null), 5000);
    } catch (err: any) {
      setCleanupMessage(`Cleanup failed: ${err.message}`);
    } finally {
      setIsCleaning(false);
    }
  };

  // Filter logs
  const filteredLogs = logs.filter((log) => {
    if (statusFilter === 'success' && log.status !== 'success') return false;
    if (statusFilter === 'failure' && log.status !== 'failure') return false;
    if (statusFilter === '429' && log.statusCode !== 429) return false;
    if (statusFilter === 'fallback' && !log.wasFallback) return false;
    if (providerFilter !== 'all' && log.providerId !== providerFilter) return false;
    if (apiKeyFilter !== 'all') {
      if (apiKeyFilter === 'master' && log.apiKeyId !== 'master') return false;
      if (apiKeyFilter !== 'master' && log.apiKeyId !== apiKeyFilter) return false;
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const matchModel = log.model?.toLowerCase().includes(query);
      const matchProvider = log.providerName?.toLowerCase().includes(query);
      const matchError = log.errorMessage?.toLowerCase().includes(query);
      const matchKey = log.apiKeyName?.toLowerCase().includes(query);
      if (!matchModel && !matchProvider && !matchError && !matchKey) return false;
    }

    return true;
  });

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <ScrollText className="w-5 h-5 text-cyan-400" />
            <span>Gateway Traffic & Telemetry Logs</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-time streaming inspection with latency profiling, token metrics, OpenRouter-style fallback chains, and 7-day auto cleanup.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-xl border transition-colors ${
              autoRefresh
                ? 'bg-emerald-950/70 border-emerald-800 text-emerald-300'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            <RefreshCw className={`w-3 h-3 ${autoRefresh ? 'animate-spin' : ''}`} />
            <span>{autoRefresh ? 'Live (4s)' : 'Paused'}</span>
          </button>

          <button
            onClick={handleTriggerCleanup}
            disabled={isCleaning}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-colors"
            title="Purge logs older than 7 days from Firebase Realtime DB"
          >
            <Calendar className="w-3.5 h-3.5 text-amber-400" />
            <span>{isCleaning ? 'Cleaning...' : 'Run 7-Day Purge'}</span>
          </button>

          <button
            onClick={handleClear}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-xl bg-slate-900 hover:bg-rose-950/60 text-slate-400 hover:text-rose-300 border border-slate-800 hover:border-rose-900 transition-colors"
            title="Clear all logs"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear</span>
          </button>
        </div>
      </div>

      {cleanupMessage && (
        <div className="p-3 bg-cyan-950/60 border border-cyan-800 text-cyan-300 rounded-xl text-xs flex items-center justify-between">
          <span>{cleanupMessage}</span>
          <button onClick={() => setCleanupMessage(null)} className="text-slate-400 hover:text-white">✕</button>
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Status Filter */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
            {['all', 'success', 'failure', '429', 'fallback'].map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-2.5 py-1 rounded-lg capitalize transition-colors ${
                  statusFilter === s
                    ? 'bg-slate-800 text-white font-medium shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {s === '429' ? 'Rate Limit (429)' : s}
              </button>
            ))}
          </div>

          {/* Provider Filter */}
          <select
            value={providerFilter}
            onChange={(e) => setProviderFilter(e.target.value)}
            className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500"
          >
            <option value="all">All Providers</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          {/* API Key Filter */}
          <select
            value={apiKeyFilter}
            onChange={(e) => setApiKeyFilter(e.target.value)}
            className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500"
          >
            <option value="all">All Client Keys</option>
            <option value="master">Master Key</option>
            {clientKeys.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name}
              </option>
            ))}
          </select>
        </div>

        {/* Search */}
        <div className="relative w-full md:w-64">
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search model, error, key..."
            className="w-full pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500"
          />
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-slate-900/70 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        {filteredLogs.length === 0 ? (
          <div className="text-center py-16 text-slate-500 text-sm">
            <ScrollText className="w-8 h-8 mx-auto text-slate-600 mb-2 opacity-50" />
            No logs matching the current filter criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800 font-semibold">
                <tr>
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">Client Key</th>
                  <th className="py-3 px-4">Target / Model</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Latency</th>
                  <th className="py-3 px-4">Routing & Fallback</th>
                  <th className="py-3 px-4">Tokens</th>
                  <th className="py-3 px-4 text-right">Inspect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {filteredLogs.map((log) => (
                  <tr
                    key={log.id}
                    onClick={() => setSelectedLog(log)}
                    className="hover:bg-slate-800/50 cursor-pointer transition-colors"
                  >
                    <td className="py-3 px-4 text-slate-400">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </td>

                    <td className="py-3 px-4 font-sans">
                      <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 truncate max-w-[140px]">
                        <Key className="w-3 h-3 text-cyan-400 shrink-0" />
                        <span className="truncate">{log.apiKeyName || 'Master Key'}</span>
                      </span>
                    </td>

                    <td className="py-3 px-4">
                      <div className="text-cyan-400 font-semibold truncate max-w-[160px]">
                        {log.model}
                      </div>
                      <div className="text-[10px] text-slate-500 font-sans truncate">
                        {log.providerName}
                      </div>
                    </td>

                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
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

                    <td className="py-3 px-4">
                      <span
                        className={`font-semibold ${
                          log.latencyMs < 600
                            ? 'text-emerald-400'
                            : log.latencyMs < 1500
                            ? 'text-amber-400'
                            : 'text-orange-400'
                        }`}
                      >
                        {log.latencyMs} ms
                      </span>
                    </td>

                    <td className="py-3 px-4 font-sans">
                      {log.fallbackSequenceUsed && log.fallbackSequenceUsed.length > 0 ? (
                        <div className="space-y-1">
                          <div className="flex items-center gap-1">
                            <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-cyan-950/90 text-cyan-300 border border-cyan-800">
                              <GitBranch className="w-2.5 h-2.5" />
                              <span>Dynamic Pipeline</span>
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              ({log.fallbackSequenceUsed.length} steps)
                            </span>
                          </div>
                          <div className="flex items-center gap-1 flex-wrap max-w-xs">
                            {log.fallbackSequenceUsed.map((step, sIdx) => {
                              const isSuccess = step.includes('success: 200') || step.includes('success');
                              return (
                                <React.Fragment key={sIdx}>
                                  <span
                                    className={`text-[9px] px-1.5 py-0.5 rounded font-mono truncate max-w-[130px] border ${
                                      isSuccess
                                        ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800'
                                        : 'bg-rose-950/80 text-rose-300 border-rose-800'
                                    }`}
                                    title={step}
                                  >
                                    {step}
                                  </span>
                                  {sIdx < (log.fallbackSequenceUsed?.length || 0) - 1 && (
                                    <span className="text-slate-600 text-[10px]">→</span>
                                  )}
                                </React.Fragment>
                              );
                            })}
                          </div>
                        </div>
                      ) : log.wasFallback ? (
                        <div className="flex items-center gap-1">
                          <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-amber-950/70 text-amber-300 border border-amber-800">
                            <Repeat className="w-2.5 h-2.5" />
                            <span>Waterfall Fallback</span>
                          </span>
                          {log.fallbackChain && log.fallbackChain.length > 0 && (
                            <span className="text-[10px] text-amber-400 font-mono">
                              ({log.fallbackChain.length} retried)
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-500 text-[11px]">Direct P1</span>
                      )}
                    </td>

                    <td className="py-3 px-4 text-slate-400">
                      {log.totalTokens ? (
                        <div>
                          <span className="text-white font-semibold">{log.totalTokens}</span>
                          <span className="text-[10px] text-slate-500 block">
                            {log.promptTokens || 0} in / {log.completionTokens || 0} out
                          </span>
                        </div>
                      ) : log.stream ? (
                        'SSE stream'
                      ) : (
                        '—'
                      )}
                    </td>

                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedLog(log);
                        }}
                        className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Inspect Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl p-6 space-y-4 shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Info className="w-5 h-5 text-cyan-400" />
                <h3 className="text-base font-bold text-white">Log Diagnostic & Fallback Trace Inspector</h3>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            {/* Quick Summary Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                <span className="text-slate-500 block">Status Code</span>
                <span className="font-mono font-bold text-white text-sm">
                  {selectedLog.statusCode} ({selectedLog.status})
                </span>
              </div>
              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                <span className="text-slate-500 block">Roundtrip Latency</span>
                <span className="font-mono font-bold text-cyan-400 text-sm">
                  {selectedLog.latencyMs} ms
                </span>
              </div>
              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                <span className="text-slate-500 block">Resolved Model</span>
                <span className="font-bold text-white truncate block">
                  {selectedLog.model}
                </span>
              </div>
              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                <span className="text-slate-500 block">Authenticated Key</span>
                <span className="font-bold text-cyan-300 truncate block">
                  {selectedLog.apiKeyName || 'Master Key'}
                </span>
              </div>
            </div>

            {/* Exact Dynamic Fallback Sequence Traversed */}
            {selectedLog.fallbackSequenceUsed && selectedLog.fallbackSequenceUsed.length > 0 && (
              <div className="p-4 bg-slate-950/90 border border-cyan-800/80 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-cyan-300">
                    <GitBranch className="w-4 h-4 text-cyan-400" />
                    <span>Dynamic Fallback Sequence Executed (`fallbackSequenceUsed`)</span>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
                    {selectedLog.fallbackSequenceUsed.length} Steps Traversed
                  </span>
                </div>
                <div className="space-y-1.5 pt-1">
                  {selectedLog.fallbackSequenceUsed.map((step, idx) => {
                    const isSuccess = step.includes('success: 200') || step.includes('success');
                    return (
                      <div
                        key={idx}
                        className={`p-2 rounded-lg border text-xs font-mono flex items-center justify-between ${
                          isSuccess
                            ? 'bg-emerald-950/60 border-emerald-800 text-emerald-200'
                            : 'bg-rose-950/60 border-rose-900/80 text-rose-300'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-slate-400 font-bold">Step #{idx + 1}:</span>
                          <span className="font-semibold">{step}</span>
                        </div>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                            isSuccess
                              ? 'bg-emerald-900/80 text-emerald-300 border border-emerald-700'
                              : 'bg-rose-900/80 text-rose-300 border border-rose-800'
                          }`}
                        >
                          {isSuccess ? 'HTTP 200 SUCCESS' : 'FAILED / SKIPPED'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Traversed Fallback Waterfall Chain */}
            {selectedLog.fallbackChain && selectedLog.fallbackChain.length > 0 && (
              <div className="p-4 bg-amber-950/40 border border-amber-800/80 rounded-xl space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300">
                  <Repeat className="w-4 h-4 text-amber-400" />
                  <span>OpenRouter-Style Waterfall Fallback Chain Traversed ({selectedLog.fallbackChain.length} retries)</span>
                </div>
                <div className="space-y-1.5 pt-1">
                  {selectedLog.fallbackChain.map((att, idx) => (
                    <div
                      key={idx}
                      className="p-2 rounded-lg bg-slate-950/80 border border-amber-900/60 text-xs flex items-center justify-between"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-400 font-mono font-bold">Step {idx + 1}:</span>
                          <span className="text-white font-mono">{att.modelId}</span>
                          <span className="text-slate-400 text-[11px]">({att.providerName})</span>
                        </div>
                        {att.error && (
                          <div className="text-[11px] text-rose-300 font-mono truncate max-w-md">
                            {att.error}
                          </div>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-950 text-rose-300 border border-rose-800">
                          {att.status} Failed
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono block mt-0.5">
                          {att.latencyMs} ms
                        </span>
                      </div>
                    </div>
                  ))}

                  {/* Succeeded step */}
                  {selectedLog.status === 'success' && (
                    <div className="p-2 rounded-lg bg-emerald-950/60 border border-emerald-800 text-xs flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span className="text-emerald-300 font-mono font-bold">
                          Step {selectedLog.fallbackChain.length + 1}: {selectedLog.model} ({selectedLog.providerName})
                        </span>
                        <span className="text-emerald-400 text-[10px] font-semibold">SUCCESS</span>
                      </div>
                      <span className="font-mono text-emerald-400 font-bold">
                        {selectedLog.latencyMs} ms
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Error Message banner if failed */}
            {selectedLog.errorMessage && (
              <div className="p-3 bg-rose-950/70 border border-rose-800 rounded-xl space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-bold text-rose-300">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>Failure Reason / Upstream Rejection</span>
                </div>
                <div className="text-xs font-mono text-rose-200 break-all">
                  {selectedLog.errorMessage}
                </div>
              </div>
            )}

            {/* Token Analytics Details */}
            {selectedLog.totalTokens ? (
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs space-y-1">
                <div className="font-semibold text-slate-300 text-[11px] uppercase tracking-wider">
                  Token Breakdown
                </div>
                <div className="flex items-center gap-4 text-slate-300 font-mono">
                  <span>Prompt: <strong className="text-cyan-400">{selectedLog.promptTokens || 0}</strong></span>
                  <span>Completion: <strong className="text-indigo-400">{selectedLog.completionTokens || 0}</strong></span>
                  <span>Total: <strong className="text-white">{selectedLog.totalTokens}</strong></span>
                </div>
              </div>
            ) : null}

            {/* Metadata & Raw Details */}
            <div className="space-y-2 text-xs">
              <div className="font-semibold text-slate-300 uppercase tracking-wider text-[11px]">
                Raw Telemetry Payload
              </div>
              <pre className="p-3 bg-slate-950 border border-slate-800 rounded-xl font-mono text-slate-300 text-xs overflow-x-auto max-h-60">
                {JSON.stringify(selectedLog, null, 2)}
              </pre>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-medium"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
