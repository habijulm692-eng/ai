import React, { useState } from 'react';
import {
  Layers,
  Plus,
  Trash2,
  Edit2,
  Check,
  AlertCircle,
  ExternalLink,
  Zap,
  Globe,
  Key,
  RotateCcw,
  Sliders,
  ChevronDown,
  ChevronUp,
  Cpu,
  ArrowUpDown,
  Send,
  Loader2,
} from 'lucide-react';
import { AIProvider, ProviderModel, ProviderProtocol } from '../types/gateway';
import {
  saveProvider,
  deleteProvider,
  toggleProvider,
  toggleModel,
  addModel,
  deleteModel,
  updateModelPriority,
  testProviderPing,
  resetDefaults,
} from '../services/api';

interface ProvidersListProps {
  providers: AIProvider[];
  onRefresh: () => void;
  hasGeminiEnvKey?: boolean;
}

export const ProvidersList: React.FC<ProvidersListProps> = ({
  providers,
  onRefresh,
  hasGeminiEnvKey,
}) => {
  const [editingProvider, setEditingProvider] = useState<AIProvider | null>(null);
  const [isAddProviderOpen, setIsAddProviderOpen] = useState(false);
  const [addingModelToProviderId, setAddingModelToProviderId] = useState<string | null>(null);

  // Form states for Provider
  const [formId, setFormId] = useState('');
  const [formName, setFormName] = useState('');
  const [formBaseUrl, setFormBaseUrl] = useState('');
  const [formApiKey, setFormApiKey] = useState('');
  const [formProtocol, setFormProtocol] = useState<ProviderProtocol>('openai-compatible');
  const [formCustomHeaders, setFormCustomHeaders] = useState('{}');
  const [formError, setFormError] = useState<string | null>(null);

  // Form states for Model
  const [newModelId, setNewModelId] = useState('');
  const [newModelName, setNewModelName] = useState('');
  const [newModelPriority, setNewModelPriority] = useState(1);
  const [newModelContext, setNewModelContext] = useState(128000);
  const [newModelNotes, setNewModelNotes] = useState('');

  // Ping status state
  const [pingStatus, setPingStatus] = useState<Record<string, { loading: boolean; text?: string; latency?: number; error?: string }>>({});

  const handleOpenAdd = () => {
    setFormId(`custom-${Date.now().toString(36)}`);
    setFormName('');
    setFormBaseUrl('https://api.example.com/v1');
    setFormApiKey('');
    setFormProtocol('openai-compatible');
    setFormCustomHeaders('{}');
    setFormError(null);
    setEditingProvider(null);
    setIsAddProviderOpen(true);
  };

  const handleOpenEdit = (p: AIProvider) => {
    setFormId(p.id);
    setFormName(p.name);
    setFormBaseUrl(p.baseUrl);
    setFormApiKey(p.apiKey);
    setFormProtocol(p.protocol);
    setFormCustomHeaders(JSON.stringify(p.customHeaders || {}, null, 2));
    setFormError(null);
    setEditingProvider(p);
    setIsAddProviderOpen(true);
  };

  const handleSaveProvider = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    let parsedHeaders: Record<string, string> = {};
    try {
      if (formCustomHeaders.trim()) {
        parsedHeaders = JSON.parse(formCustomHeaders);
      }
    } catch (err) {
      setFormError('Custom Headers must be valid JSON (e.g. {"HTTP-Referer": "https://..."})');
      return;
    }

    const payload: AIProvider = {
      id: formId.trim() || `prov-${Date.now().toString(36)}`,
      name: formName.trim(),
      baseUrl: formBaseUrl.trim(),
      apiKey: formApiKey.trim(),
      protocol: formProtocol,
      enabled: editingProvider ? editingProvider.enabled : true,
      customHeaders: parsedHeaders,
      models: editingProvider ? editingProvider.models : [],
      createdAt: editingProvider ? editingProvider.createdAt : Date.now(),
      updatedAt: Date.now(),
    };

    try {
      await saveProvider(payload);
      setIsAddProviderOpen(false);
      onRefresh();
    } catch (err: any) {
      setFormError(err.message || 'Failed to save provider');
    }
  };

  const handleDeleteProvider = async (id: string, name: string) => {
    if (confirm(`Are you sure you want to delete "${name}"?`)) {
      await deleteProvider(id);
      onRefresh();
    }
  };

  const handleToggleProvider = async (id: string) => {
    await toggleProvider(id);
    onRefresh();
  };

  const handleToggleModel = async (providerId: string, modelId: string) => {
    await toggleModel(providerId, modelId);
    onRefresh();
  };

  const handleAddModel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addingModelToProviderId || !newModelId || !newModelName) return;

    await addModel(addingModelToProviderId, {
      modelId: newModelId.trim(),
      name: newModelName.trim(),
      priority: Number(newModelPriority),
      contextWindow: Number(newModelContext),
      notes: newModelNotes.trim(),
    });

    setAddingModelToProviderId(null);
    setNewModelId('');
    setNewModelName('');
    onRefresh();
  };

  const handleDeleteModel = async (providerId: string, modelId: string) => {
    await deleteModel(providerId, modelId);
    onRefresh();
  };

  const handlePriorityChange = async (providerId: string, modelId: string, currentPriority: number, delta: number) => {
    const next = Math.max(1, currentPriority + delta);
    await updateModelPriority(providerId, modelId, next);
    onRefresh();
  };

  const handlePingTest = async (providerId: string) => {
    setPingStatus((prev) => ({ ...prev, [providerId]: { loading: true } }));
    try {
      const res = await testProviderPing(providerId);
      if (res.success) {
        setPingStatus((prev) => ({
          ...prev,
          [providerId]: {
            loading: false,
            latency: res.latency,
            text: res.responseText || 'Pong received',
          },
        }));
      } else {
        setPingStatus((prev) => ({
          ...prev,
          [providerId]: {
            loading: false,
            latency: res.latency,
            error: res.error || 'Ping failed',
          },
        }));
      }
    } catch (err: any) {
      setPingStatus((prev) => ({
        ...prev,
        [providerId]: {
          loading: false,
          error: err.message || 'Connection test failed',
        },
      }));
    }
  };

  const handleResetDefaults = async () => {
    if (confirm('Reset providers to recommended defaults (Google Gemini, Groq, OpenRouter, xKiro)?')) {
      await resetDefaults();
      onRefresh();
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Layers className="w-5 h-5 text-cyan-400" />
            <span>AI Providers & Model Hierarchy</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Dynamic database-driven configurations. Toggle active state or adjust model priorities to control fallback routing.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleResetDefaults}
            className="flex items-center gap-1.5 px-3 py-2 text-xs rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-colors"
            title="Reset to recommended default configurations"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Defaults</span>
          </button>
          <button
            onClick={handleOpenAdd}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white shadow-md shadow-cyan-500/20 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Add Provider</span>
          </button>
        </div>
      </div>

      {/* Providers Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {providers.map((provider) => {
          const ping = pingStatus[provider.id];
          const isGemini = provider.protocol === 'gemini-native';
          const activeModels = (provider.models || []).filter((m) => m.enabled).length;

          return (
            <div
              key={provider.id}
              className={`rounded-2xl border transition-all ${
                provider.enabled
                  ? 'bg-slate-900/80 border-slate-800/90 shadow-lg shadow-black/20'
                  : 'bg-slate-950/40 border-slate-900/60 opacity-60'
              }`}
            >
              {/* Provider Card Top Bar */}
              <div className="p-5 border-b border-slate-800/70">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-white">{provider.name}</h3>
                      <span
                        className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full border ${
                          isGemini
                            ? 'bg-indigo-950/80 text-indigo-300 border-indigo-700/60'
                            : 'bg-cyan-950/80 text-cyan-300 border-cyan-700/60'
                        }`}
                      >
                        {isGemini ? 'Gemini Native' : 'OpenAI Compatible'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-400 font-mono truncate max-w-sm">
                      <Globe className="w-3 h-3 text-slate-500 shrink-0" />
                      <span className="truncate">{provider.baseUrl}</span>
                    </div>
                  </div>

                  {/* Toggle Switch */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggleProvider(provider.id)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        provider.enabled ? 'bg-cyan-500' : 'bg-slate-700'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                          provider.enabled ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {/* API Key info */}
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-1.5 text-slate-400">
                    <Key className="w-3.5 h-3.5 text-slate-500" />
                    <span>Key:</span>
                    <span className="font-mono text-slate-300">
                      {provider.apiKey ? (
                        `••••••••${provider.apiKey.slice(-4)}`
                      ) : isGemini && hasGeminiEnvKey ? (
                        <span className="text-emerald-400 font-medium">Auto-injected from env</span>
                      ) : (
                        <span className="text-rose-400 font-medium">Missing key</span>
                      )}
                    </span>
                  </div>

                  {/* Provider Actions */}
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handlePingTest(provider.id)}
                      disabled={ping?.loading}
                      className="flex items-center gap-1 px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition-colors border border-slate-700/60"
                      title="Test connection"
                    >
                      {ping?.loading ? (
                        <Loader2 className="w-3 h-3 animate-spin text-cyan-400" />
                      ) : (
                        <Send className="w-3 h-3 text-cyan-400" />
                      )}
                      <span>Ping</span>
                    </button>
                    <button
                      onClick={() => handleOpenEdit(provider)}
                      className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                      title="Edit Provider"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteProvider(provider.id, provider.name)}
                      className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-slate-800 transition-colors"
                      title="Delete Provider"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Ping Result Banner if active */}
                {ping && !ping.loading && (
                  <div
                    className={`mt-2.5 p-2 rounded-lg text-xs flex items-center justify-between ${
                      ping.error
                        ? 'bg-rose-950/60 border border-rose-800 text-rose-300'
                        : 'bg-emerald-950/60 border border-emerald-800 text-emerald-300'
                    }`}
                  >
                    <div className="truncate max-w-[280px]">
                      {ping.error ? `Error: ${ping.error}` : `Response: "${ping.text}"`}
                    </div>
                    {ping.latency && (
                      <span className="font-mono font-bold shrink-0 ml-2">{ping.latency} ms</span>
                    )}
                  </div>
                )}
              </div>

              {/* Models Section */}
              <div className="p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    <Cpu className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Models ({activeModels} active)</span>
                  </div>
                  <button
                    onClick={() => {
                      setAddingModelToProviderId(provider.id);
                      setNewModelId('');
                      setNewModelName('');
                      setNewModelPriority(provider.models.length + 1);
                      setNewModelContext(128000);
                      setNewModelNotes('');
                    }}
                    className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 font-medium"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Model</span>
                  </button>
                </div>

                {/* Models List */}
                <div className="space-y-2">
                  {provider.models.map((mod) => (
                    <div
                      key={mod.id}
                      className={`flex items-center justify-between p-2.5 rounded-xl border transition-all ${
                        mod.enabled
                          ? 'bg-slate-950/80 border-slate-800'
                          : 'bg-slate-950/30 border-slate-900 opacity-50'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {/* Priority Badge */}
                        <div
                          className="flex items-center gap-0.5 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-800 text-cyan-400 border border-slate-700"
                          title="Fallback Priority (1 = Highest)"
                        >
                          <span>P{mod.priority}</span>
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-white font-mono truncate">
                              {mod.id}
                            </span>
                            {mod.contextWindow && (
                              <span className="text-[10px] text-slate-500 font-mono">
                                {Math.round(mod.contextWindow / 1000)}k ctx
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400 truncate">
                            {mod.name}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {/* Priority Adjusters */}
                        <div className="flex items-center flex-col -space-y-1">
                          <button
                            onClick={() => handlePriorityChange(provider.id, mod.id, mod.priority, -1)}
                            className="p-0.5 text-slate-500 hover:text-cyan-400"
                            title="Increase Priority (lower number)"
                          >
                            <ChevronUp className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => handlePriorityChange(provider.id, mod.id, mod.priority, 1)}
                            className="p-0.5 text-slate-500 hover:text-cyan-400"
                            title="Decrease Priority (higher number)"
                          >
                            <ChevronDown className="w-3 h-3" />
                          </button>
                        </div>

                        {/* Enable/Disable toggle */}
                        <button
                          onClick={() => handleToggleModel(provider.id, mod.id)}
                          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                            mod.enabled ? 'bg-cyan-500' : 'bg-slate-800'
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                              mod.enabled ? 'translate-x-4' : 'translate-x-0'
                            }`}
                          />
                        </button>

                        {/* Delete Model */}
                        <button
                          onClick={() => handleDeleteModel(provider.id, mod.id)}
                          className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
                          title="Delete model"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}

                  {provider.models.length === 0 && (
                    <div className="text-center py-4 text-xs text-slate-500">
                      No models registered under this provider yet.
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add / Edit Provider Modal */}
      {isAddProviderOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-cyan-400" />
                <span>{editingProvider ? 'Edit AI Provider' : 'Add New AI Provider'}</span>
              </h3>
              <button
                onClick={() => setIsAddProviderOpen(false)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-300 text-xs">
                {formError}
              </div>
            )}

            <form onSubmit={handleSaveProvider} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Provider ID (slug)
                </label>
                <input
                  type="text"
                  required
                  value={formId}
                  onChange={(e) => setFormId(e.target.value)}
                  placeholder="e.g. groq, openrouter, custom-vllm"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Provider Name
                </label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Groq Cloud LPU"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Protocol Adapter
                  </label>
                  <select
                    value={formProtocol}
                    onChange={(e) => setFormProtocol(e.target.value as ProviderProtocol)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500"
                  >
                    <option value="openai-compatible">OpenAI-Compatible</option>
                    <option value="gemini-native">Gemini-Native (Google)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    API Key
                  </label>
                  <input
                    type="password"
                    value={formApiKey}
                    onChange={(e) => setFormApiKey(e.target.value)}
                    placeholder="sk-..."
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Base URL
                </label>
                <input
                  type="url"
                  required
                  value={formBaseUrl}
                  onChange={(e) => setFormBaseUrl(e.target.value)}
                  placeholder="https://api.groq.com/openai/v1 or https://generativelanguage.googleapis.com/v1beta"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Custom Headers (JSON)
                </label>
                <textarea
                  rows={3}
                  value={formCustomHeaders}
                  onChange={(e) => setFormCustomHeaders(e.target.value)}
                  placeholder={'{\n  "HTTP-Referer": "https://myapp.com",\n  "X-Title": "My Gateway"\n}'}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-300 font-mono focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddProviderOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold bg-gradient-to-r from-cyan-500 to-indigo-600 text-white rounded-xl shadow-md shadow-cyan-500/20"
                >
                  Save Provider
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Model Modal */}
      {addingModelToProviderId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Cpu className="w-4 h-4 text-cyan-400" />
                <span>Add Model to Provider</span>
              </h3>
              <button
                onClick={() => setAddingModelToProviderId(null)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddModel} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Model ID (exact upstream string)
                </label>
                <input
                  type="text"
                  required
                  value={newModelId}
                  onChange={(e) => setNewModelId(e.target.value)}
                  placeholder="e.g. llama-3.3-70b-versatile, gemini-2.5-flash"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Friendly Display Name
                </label>
                <input
                  type="text"
                  required
                  value={newModelName}
                  onChange={(e) => setNewModelName(e.target.value)}
                  placeholder="e.g. Llama 3.3 70B Fast"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Priority Rank (1 = Top)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={newModelPriority}
                    onChange={(e) => setNewModelPriority(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Context Window
                  </label>
                  <input
                    type="number"
                    value={newModelContext}
                    onChange={(e) => setNewModelContext(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Notes
                </label>
                <input
                  type="text"
                  value={newModelNotes}
                  onChange={(e) => setNewModelNotes(e.target.value)}
                  placeholder="Primary fallback on rate limits"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setAddingModelToProviderId(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold bg-gradient-to-r from-cyan-500 to-indigo-600 text-white rounded-xl shadow-md shadow-cyan-500/20"
                >
                  Add Model
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
