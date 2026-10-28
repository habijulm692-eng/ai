import React, { useState, useEffect, useCallback } from 'react';
import {
  GitBranch,
  ArrowUp,
  ArrowDown,
  CheckCircle2,
  XCircle,
  Save,
  RotateCcw,
  Sparkles,
  Layers,
  AlertTriangle,
  Play,
  Check,
  RefreshCw,
  Sliders,
  Info,
  ChevronRight,
  ShieldCheck,
  Eye,
  Zap,
} from 'lucide-react';
import { PipelineItem, AIProvider, GatewaySettings } from '../types/gateway';
import { fetchPipeline, savePipeline } from '../services/api';

interface PipelineManagerProps {
  providers: AIProvider[];
  settings: GatewaySettings | null;
  onRefreshGateway?: () => void;
  onTestInConsole?: (model: string) => void;
}

export const PipelineManager: React.FC<PipelineManagerProps> = ({
  providers,
  settings,
  onRefreshGateway,
  onTestInConsole,
}) => {
  const [pipeline, setPipeline] = useState<PipelineItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [hasChanges, setHasChanges] = useState<boolean>(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [filterProvider, setFilterProvider] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [testResult, setTestResult] = useState<{
    running: boolean;
    success?: boolean;
    resolvedModel?: string;
    chain?: string[];
    latencyMs?: number;
    error?: string;
  } | null>(null);

  const loadPipelineData = useCallback(async () => {
    setLoading(true);
    try {
      const items = await fetchPipeline();
      setPipeline(items);
      setHasChanges(false);
      setErrorMessage(null);
    } catch (err: any) {
      console.error('Failed to load pipeline:', err);
      setErrorMessage(err?.message || 'Failed to fetch fallback pipeline');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPipelineData();
  }, [loadPipelineData]);

  // Reorder item up (closer to rank 1)
  const moveUp = (index: number) => {
    if (index <= 0) return;
    const newItems = [...pipeline];
    const temp = newItems[index - 1];
    newItems[index - 1] = newItems[index];
    newItems[index] = temp;

    // Recalculate pipelineOrder sequentially
    const reindexed = newItems.map((item, idx) => ({
      ...item,
      pipelineOrder: idx + 1,
    }));

    setPipeline(reindexed);
    setHasChanges(true);
    setSaveSuccessMessage(null);
  };

  // Reorder item down (further down the waterfall)
  const moveDown = (index: number) => {
    if (index >= pipeline.length - 1) return;
    const newItems = [...pipeline];
    const temp = newItems[index + 1];
    newItems[index + 1] = newItems[index];
    newItems[index] = temp;

    // Recalculate pipelineOrder sequentially
    const reindexed = newItems.map((item, idx) => ({
      ...item,
      pipelineOrder: idx + 1,
    }));

    setPipeline(reindexed);
    setHasChanges(true);
    setSaveSuccessMessage(null);
  };

  // Move directly to top (Rank #1)
  const moveToTop = (index: number) => {
    if (index === 0) return;
    const item = pipeline[index];
    const filtered = pipeline.filter((_, idx) => idx !== index);
    const newItems = [item, ...filtered].map((it, idx) => ({
      ...it,
      pipelineOrder: idx + 1,
    }));
    setPipeline(newItems);
    setHasChanges(true);
    setSaveSuccessMessage(null);
  };

  // Toggle in-pool participation
  const toggleInPool = (index: number) => {
    const updated = [...pipeline];
    updated[index] = {
      ...updated[index],
      inAllModelsPool: !updated[index].inAllModelsPool,
    };
    setPipeline(updated);
    setHasChanges(true);
    setSaveSuccessMessage(null);
  };

  // Save changes to database
  const handleSave = async () => {
    setSaving(true);
    setErrorMessage(null);
    try {
      const payload = pipeline.map((item, idx) => ({
        providerId: item.providerId,
        modelId: item.modelId,
        pipelineOrder: idx + 1,
        inAllModelsPool: item.inAllModelsPool,
      }));

      const saved = await savePipeline(payload);
      setPipeline(saved);
      setHasChanges(false);
      setSaveSuccessMessage('Fallback routing sequence saved & persisted to database!');
      if (onRefreshGateway) onRefreshGateway();
      setTimeout(() => setSaveSuccessMessage(null), 4000);
    } catch (err: any) {
      console.error('Failed to save pipeline:', err);
      setErrorMessage(err?.message || 'Failed to save pipeline');
    } finally {
      setSaving(false);
    }
  };

  // Reset order based on provider priorities
  const handleReset = () => {
    const sorted = [...pipeline].sort((a, b) => {
      // Find parent provider priority
      const provA = providers.find((p) => p.id === a.providerId);
      const provB = providers.find((p) => p.id === b.providerId);
      const aName = a.providerName || '';
      const bName = b.providerName || '';
      return aName.localeCompare(bName);
    });

    const reindexed = sorted.map((item, idx) => ({
      ...item,
      pipelineOrder: idx + 1,
      inAllModelsPool: true,
    }));

    setPipeline(reindexed);
    setHasChanges(true);
    setSaveSuccessMessage(null);
  };

  // Run a live test of all-models waterfall
  const handleTestWaterfall = async () => {
    if (!settings?.masterApiKey) {
      setErrorMessage('Master API Key is required to test waterfall.');
      return;
    }

    setTestResult({ running: true });
    setErrorMessage(null);
    const start = Date.now();

    try {
      const res = await fetch('/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${settings.masterApiKey}`,
        },
        body: JSON.stringify({
          model: 'all-models',
          messages: [
            {
              role: 'user',
              content: 'Say "Pipeline Test OK" in 4 words.',
            },
          ],
          stream: false,
        }),
      });

      const latencyMs = Date.now() - start;
      const data = await res.json();

      if (res.ok) {
        setTestResult({
          running: false,
          success: true,
          resolvedModel: data.model || 'unknown',
          latencyMs,
          chain: data.fallbackSequenceUsed || [
            `${data.model} (success: 200)`,
          ],
        });
        if (onRefreshGateway) onRefreshGateway();
      } else {
        setTestResult({
          running: false,
          success: false,
          latencyMs,
          error: data?.error?.message || `HTTP ${res.status}`,
          chain: data?.error?.details?.fallbackSequenceUsed || [],
        });
      }
    } catch (err: any) {
      setTestResult({
        running: false,
        success: false,
        latencyMs: Date.now() - start,
        error: err?.message || 'Network request failed',
      });
    }
  };

  const activePoolItems = pipeline.filter(
    (item) => item.inAllModelsPool && item.providerEnabled && item.modelEnabled
  );

  const excludedItems = pipeline.filter(
    (item) => !item.inAllModelsPool || !item.providerEnabled || !item.modelEnabled
  );

  const filteredItems = pipeline.filter((item) => {
    if (filterProvider !== 'all' && item.providerId !== filterProvider) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        item.modelId.toLowerCase().includes(q) ||
        item.modelName.toLowerCase().includes(q) ||
        item.providerName.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-cyan-950/80 border border-cyan-800 text-cyan-400">
              <GitBranch className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <span>Fallback Routing Sequence</span>
                <code className="text-xs px-2 py-0.5 rounded bg-cyan-950/90 text-cyan-300 border border-cyan-800 font-mono">
                  model: "all-models"
                </code>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Configure the dynamic waterfall sequence when clients request the virtual <code className="text-cyan-300">"all-models"</code> router. Reorder priority and toggle participation.
              </p>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={loadPipelineData}
            disabled={loading || saving}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-colors"
            title="Reload sequence from database"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Reload</span>
          </button>

          <button
            onClick={handleReset}
            disabled={loading || saving}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-colors"
            title="Reset ordering alphabetically by provider"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
            <span>Reset Default</span>
          </button>

          <button
            onClick={handleTestWaterfall}
            disabled={loading || saving || (testResult?.running ?? false)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs rounded-xl bg-indigo-950/80 hover:bg-indigo-900 text-indigo-200 border border-indigo-700/80 transition-colors font-medium"
            title="Simulate an 'all-models' request through the live pipeline"
          >
            <Play className={`w-3.5 h-3.5 text-indigo-400 ${testResult?.running ? 'animate-pulse' : ''}`} />
            <span>{testResult?.running ? 'Testing Waterfall...' : 'Test Waterfall'}</span>
          </button>

          <button
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className={`flex items-center gap-2 px-4 py-1.5 text-xs font-semibold rounded-xl transition-all shadow-md ${
              hasChanges
                ? 'bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white shadow-cyan-500/25 animate-pulse'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
            }`}
          >
            <Save className="w-3.5 h-3.5" />
            <span>{saving ? 'Persisting...' : 'Save Sequence Order'}</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {saveSuccessMessage && (
        <div className="p-3 bg-emerald-950/80 border border-emerald-800 text-emerald-300 rounded-xl text-xs flex items-center justify-between animate-fadeIn">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{saveSuccessMessage}</span>
          </div>
          <button onClick={() => setSaveSuccessMessage(null)} className="text-emerald-400 hover:text-white">✕</button>
        </div>
      )}

      {errorMessage && (
        <div className="p-3 bg-rose-950/80 border border-rose-800 text-rose-300 rounded-xl text-xs flex items-center justify-between animate-fadeIn">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-rose-400 hover:text-white">✕</button>
        </div>
      )}

      {/* Live Waterfall Test Execution Card */}
      {testResult && (
        <div className="p-4 bg-slate-900 border border-indigo-900/60 rounded-2xl space-y-3 animate-fadeIn">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-indigo-400" />
              <span className="text-xs font-bold text-white">Live Waterfall Simulation Result</span>
            </div>
            <button
              onClick={() => setTestResult(null)}
              className="text-slate-400 hover:text-white text-xs"
            >
              ✕
            </button>
          </div>

          {testResult.running ? (
            <div className="flex items-center gap-3 text-xs text-indigo-300 py-2">
              <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
              <span>Cascading through active models in user-configured sequence order...</span>
            </div>
          ) : (
            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-4 flex-wrap">
                <span className="text-slate-400">
                  Resolved Model: <strong className="text-white font-mono">{testResult.resolvedModel || 'None'}</strong>
                </span>
                <span className="text-slate-400">
                  Roundtrip Latency: <strong className="text-cyan-400 font-mono">{testResult.latencyMs} ms</strong>
                </span>
                <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                  testResult.success
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                    : 'bg-rose-950 text-rose-300 border border-rose-800'
                }`}>
                  {testResult.success ? 'HTTP 200 SUCCESS' : 'WATERFALL FAILED'}
                </span>
              </div>

              {testResult.error && (
                <div className="text-xs text-rose-300 font-mono bg-rose-950/40 p-2 rounded-lg border border-rose-900/60">
                  {testResult.error}
                </div>
              )}

              {testResult.chain && testResult.chain.length > 0 && (
                <div className="pt-1">
                  <span className="text-[11px] text-slate-400 block mb-1 font-semibold uppercase tracking-wider">
                    Execution Path Traversed (`fallbackSequenceUsed`):
                  </span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {testResult.chain.map((step, idx) => {
                      const isSuccess = step.includes('success: 200') || step.includes('success');
                      return (
                        <React.Fragment key={idx}>
                          <span
                            className={`px-2 py-1 rounded text-xs font-mono border ${
                              isSuccess
                                ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700 font-bold'
                                : 'bg-rose-950/80 text-rose-300 border-rose-800'
                            }`}
                          >
                            {step}
                          </span>
                          {idx < testResult.chain!.length - 1 && (
                            <span className="text-slate-500 font-bold">➔</span>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Visual Waterfall Pipeline Flow Diagram */}
      <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-cyan-400" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Live Cascade Architecture Preview
            </h3>
          </div>
          <span className="text-xs text-slate-400">
            <strong className="text-cyan-400">{activePoolItems.length}</strong> active in pool •{' '}
            <strong className="text-slate-500">{excludedItems.length}</strong> excluded/disabled
          </span>
        </div>

        {activePoolItems.length === 0 ? (
          <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-900/60 text-xs text-amber-300 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>No models are currently enabled in the "all-models" pool. Include at least one active model below.</span>
          </div>
        ) : (
          <div className="overflow-x-auto pb-2 no-scrollbar">
            <div className="flex items-center gap-2 min-w-max py-2">
              <div className="flex flex-col items-center justify-center px-3 py-2 bg-slate-950 border border-cyan-800/80 rounded-xl text-center">
                <span className="text-[10px] text-cyan-400 uppercase font-mono font-bold">Request</span>
                <span className="text-xs font-semibold text-white">"all-models"</span>
              </div>

              <ChevronRight className="w-4 h-4 text-slate-600 shrink-0" />

              {activePoolItems.map((item, idx) => (
                <React.Fragment key={`${item.providerId}-${item.modelId}`}>
                  <div className="relative group flex flex-col p-2.5 bg-slate-950 border border-slate-800 hover:border-cyan-700/80 rounded-xl text-xs min-w-[170px] transition-all">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-cyan-950 text-cyan-300 font-bold border border-cyan-900">
                        Rank #{idx + 1}
                      </span>
                      <span className="text-[10px] text-slate-400 truncate max-w-[80px]">
                        {item.providerName}
                      </span>
                    </div>
                    <span className="font-mono font-semibold text-white text-xs truncate" title={item.modelId}>
                      {item.modelId}
                    </span>
                    <div className="flex items-center justify-between mt-1 pt-1 border-t border-slate-900 text-[10px] text-slate-500">
                      <span>{item.providerProtocol === 'gemini-native' ? 'Gemini Native' : 'OpenAI'}</span>
                      <span className="text-emerald-400">P{item.pipelineOrder}</span>
                    </div>
                  </div>

                  {idx < activePoolItems.length - 1 && (
                    <div className="flex flex-col items-center shrink-0 px-1">
                      <ChevronRight className="w-4 h-4 text-slate-600" />
                      <span className="text-[9px] text-slate-600 font-mono -mt-1">429/5xx</span>
                    </div>
                  )}
                </React.Fragment>
              ))}

              <ChevronRight className="w-4 h-4 text-slate-600 shrink-0" />

              <div className="flex flex-col items-center justify-center px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-center">
                <span className="text-[10px] text-emerald-400 uppercase font-mono font-bold">Return</span>
                <span className="text-xs font-semibold text-white">Client 200</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-semibold text-white">Filter:</span>
          </div>

          <select
            value={filterProvider}
            onChange={(e) => setFilterProvider(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-cyan-500"
          >
            <option value="all">All Providers</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.models?.length || 0} models)
              </option>
            ))}
          </select>
        </div>

        <div className="w-full md:w-72">
          <input
            type="text"
            placeholder="Search models or providers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
          />
        </div>
      </div>

      {/* Main Ordered Pipeline Sequence Table / Cards */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-4 border-b border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-white">
              Sequence Priority Queue ({filteredItems.length} models)
            </h3>
            {hasChanges && (
              <span className="text-[11px] px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800 font-semibold">
                Unsaved Changes
              </span>
            )}
          </div>
          <span className="text-xs text-slate-400">
            Rank #1 is evaluated first. On 429/5xx, auto-cascades to Rank #2, #3, etc.
          </span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-400 text-xs font-mono">
            Loading sequence configuration...
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs">
            No models found matching query.
          </div>
        ) : (
          <div className="divide-y divide-slate-800/60">
            {filteredItems.map((item, originalIndex) => {
              // Find index in master pipeline for reordering
              const masterIndex = pipeline.findIndex(
                (p) => p.providerId === item.providerId && p.modelId === item.modelId
              );
              const isFirst = masterIndex === 0;
              const isLast = masterIndex === pipeline.length - 1;
              const isAvailable = item.providerEnabled && item.modelEnabled;
              const inPool = item.inAllModelsPool && isAvailable;

              return (
                <div
                  key={`${item.providerId}-${item.modelId}`}
                  className={`p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-colors ${
                    !item.inAllModelsPool
                      ? 'bg-slate-950/40 opacity-70'
                      : !isAvailable
                      ? 'bg-rose-950/10 opacity-60'
                      : 'hover:bg-slate-800/40 bg-slate-900/40'
                  }`}
                >
                  {/* Left: Rank Badge + Reorder buttons + Info */}
                  <div className="flex items-center gap-3.5 min-w-0">
                    {/* Rank Badge */}
                    <div
                      className={`flex flex-col items-center justify-center w-10 h-10 rounded-xl font-mono font-bold text-xs shrink-0 border ${
                        inPool
                          ? 'bg-gradient-to-br from-cyan-950 to-slate-900 text-cyan-300 border-cyan-800/80 shadow-sm'
                          : 'bg-slate-950 text-slate-600 border-slate-800'
                      }`}
                    >
                      <span className="text-[9px] uppercase tracking-tighter text-slate-500 font-sans">Rank</span>
                      <span>#{item.pipelineOrder}</span>
                    </div>

                    {/* Up / Down Controls */}
                    <div className="flex flex-col gap-1 shrink-0">
                      <button
                        onClick={() => moveUp(masterIndex)}
                        disabled={isFirst}
                        title="Move Up in Waterfall Sequence"
                        className={`p-1 rounded-md border transition-colors ${
                          isFirst
                            ? 'text-slate-700 border-slate-800/40 cursor-not-allowed'
                            : 'text-slate-300 hover:text-white bg-slate-950 hover:bg-slate-800 border-slate-800'
                        }`}
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => moveDown(masterIndex)}
                        disabled={isLast}
                        title="Move Down in Waterfall Sequence"
                        className={`p-1 rounded-md border transition-colors ${
                          isLast
                            ? 'text-slate-700 border-slate-800/40 cursor-not-allowed'
                            : 'text-slate-300 hover:text-white bg-slate-950 hover:bg-slate-800 border-slate-800'
                        }`}
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Model & Provider Details */}
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-sm text-white truncate max-w-xs sm:max-w-md">
                          {item.modelId}
                        </span>
                        <span className="text-xs text-slate-400">({item.modelName})</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 font-medium">
                          {item.providerName}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-950 text-cyan-400 border border-slate-800 font-mono">
                          {item.providerProtocol === 'gemini-native' ? 'Gemini Native' : 'OpenAI-compat'}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 text-xs text-slate-500">
                        <span>Context: {item.contextWindow ? `${(item.contextWindow / 1000).toFixed(0)}k tokens` : 'Standard'}</span>
                        <span>•</span>
                        <span>
                          Parent Provider:{' '}
                          <strong className={item.providerEnabled ? 'text-emerald-400' : 'text-rose-400'}>
                            {item.providerEnabled ? 'Enabled' : 'Disabled'}
                          </strong>
                        </span>
                        <span>•</span>
                        <span>
                          Model Status:{' '}
                          <strong className={item.modelEnabled ? 'text-emerald-400' : 'text-rose-400'}>
                            {item.modelEnabled ? 'Active' : 'Inactive'}
                          </strong>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Inclusion Switch & Direct Jump */}
                  <div className="flex items-center gap-4 shrink-0 w-full sm:w-auto justify-between sm:justify-end border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-800">
                    {!isFirst && inPool && (
                      <button
                        onClick={() => moveToTop(masterIndex)}
                        className="text-[11px] text-cyan-400 hover:text-cyan-300 underline font-medium"
                        title="Make this model Rank #1"
                      >
                        Jump to #1
                      </button>
                    )}

                    {/* In "all-models" Pool Toggle */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400 font-medium hidden sm:inline">
                        In Fallback Pool:
                      </span>
                      <button
                        onClick={() => toggleInPool(masterIndex)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                          item.inAllModelsPool
                            ? 'bg-cyan-950 text-cyan-300 border-cyan-800 hover:bg-cyan-900'
                            : 'bg-slate-950 text-slate-500 border-slate-800 hover:text-slate-300'
                        }`}
                      >
                        {item.inAllModelsPool ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" />
                            <span>Included</span>
                          </>
                        ) : (
                          <>
                            <XCircle className="w-3.5 h-3.5 text-slate-500" />
                            <span>Excluded</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Informational Guidance Box */}
      <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-2xl text-xs text-slate-400 space-y-2">
        <div className="flex items-center gap-2 text-white font-semibold">
          <Info className="w-4 h-4 text-cyan-400" />
          <span>How the Dynamic Fallback Engine Handles Requests</span>
        </div>
        <ul className="list-disc list-inside space-y-1 text-slate-400 pl-1">
          <li>
            When client sends <code className="text-cyan-300">model: "all-models"</code>, the gateway strictly executes through the ordered sequence above.
          </li>
          <li>
            If Model #1 succeeds with HTTP 200, its streaming or JSON response returns immediately with sub-500ms latency.
          </li>
          <li>
            If Model #1 encounters an HTTP 429 (rate-limit), 503, 500, or upstream timeout, the engine catches the failure, records the step, and instantly cascades to Model #2 without aborting the client connection.
          </li>
          <li>
            The complete traversed path is recorded in Firebase logs under <code className="text-cyan-300">fallbackSequenceUsed</code> (e.g. <span className="font-mono text-slate-300">["gemini-1.5-flash (failed: 503)", "llama-3.3-70b-versatile (success: 200)"]</span>).
          </li>
          <li>
            Models marked as <em>Excluded</em> or belonging to disabled providers are automatically bypassed.
          </li>
        </ul>
      </div>
    </div>
  );
};
