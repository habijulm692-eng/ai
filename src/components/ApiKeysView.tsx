import React, { useState } from 'react';
import {
  Key,
  Plus,
  Trash2,
  Copy,
  Check,
  RefreshCw,
  Cpu,
  BarChart3,
  ShieldCheck,
  Zap,
  Terminal,
  Activity,
  Calendar,
  Layers,
  ArrowRight,
  Eye,
  EyeOff,
} from 'lucide-react';
import { ClientApiKey } from '../types/gateway';
import {
  createClientKey,
  deleteClientKey,
  toggleClientKey,
  regenerateClientKey,
} from '../services/api';

interface ApiKeysViewProps {
  clientKeys: ClientApiKey[];
  onRefresh: () => void;
  onFilterLogsByKey: (keyId: string) => void;
}

export const ApiKeysView: React.FC<ApiKeysViewProps> = ({
  clientKeys,
  onRefresh,
  onFilterLogsByKey,
}) => {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [customKeyString, setCustomKeyString] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);
  const [revealedKeys, setRevealedKeys] = useState<Record<string, boolean>>({});
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<ClientApiKey | null>(null);

  // Compute aggregate token analytics
  const totalTokensAll = clientKeys.reduce((acc, k) => acc + (k.totalTokens || 0), 0);
  const totalPromptTokens = clientKeys.reduce((acc, k) => acc + (k.totalPromptTokens || 0), 0);
  const totalCompletionTokens = clientKeys.reduce((acc, k) => acc + (k.totalCompletionTokens || 0), 0);
  const totalRequestsAll = clientKeys.reduce((acc, k) => acc + (k.totalRequests || 0), 0);
  const activeKeysCount = clientKeys.filter((k) => k.enabled).length;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;

    setErrorMsg(null);
    try {
      const created = await createClientKey(newKeyName.trim(), customKeyString.trim() || undefined);
      setNewlyCreatedKey(created);
      setNewKeyName('');
      setCustomKeyString('');
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to create API key');
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (confirm(`Revoke and delete API key "${name}"? Client apps using this key will immediately be rejected.`)) {
      await deleteClientKey(id);
      onRefresh();
    }
  };

  const handleToggle = async (id: string) => {
    await toggleClientKey(id);
    onRefresh();
  };

  const handleRegenerate = async (id: string, name: string) => {
    if (confirm(`Regenerate token for "${name}"? The previous key will be immediately invalidated.`)) {
      await regenerateClientKey(id);
      onRefresh();
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKeyId(id);
    setTimeout(() => setCopiedKeyId(null), 2000);
  };

  const toggleReveal = (id: string) => {
    setRevealedKeys((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Key className="w-5 h-5 text-cyan-400" />
            <span>Client API Keys & Token Usage Analytics</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Issue distinct API keys for external applications. Track prompt, completion, and total token consumption per client with OpenRouter-style dynamic fallback.
          </p>
        </div>
        <button
          onClick={() => {
            setIsCreateOpen(true);
            setNewlyCreatedKey(null);
            setErrorMsg(null);
          }}
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white shadow-md shadow-cyan-500/20 transition-all shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Generate Client Key</span>
        </button>
      </div>

      {/* Aggregate Token Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Total Tokens Tracked</span>
            <BarChart3 className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-extrabold text-white font-mono">
            {totalTokensAll.toLocaleString()}
          </div>
          <div className="mt-1 text-xs text-slate-400 flex items-center gap-2">
            <span className="text-cyan-400">{totalPromptTokens.toLocaleString()} in</span>
            <span>•</span>
            <span className="text-indigo-400">{totalCompletionTokens.toLocaleString()} out</span>
          </div>
        </div>

        <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Client Requests</span>
            <Activity className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-extrabold text-white font-mono">
            {totalRequestsAll.toLocaleString()}
          </div>
          <div className="mt-1 text-xs text-slate-400">Routed across all client keys</div>
        </div>

        <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Active Keys</span>
            <ShieldCheck className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-extrabold text-white font-mono">
            {activeKeysCount} <span className="text-sm font-normal text-slate-400">/ {clientKeys.length}</span>
          </div>
          <div className="mt-1 text-xs text-emerald-400">Scoped Bearer credentials</div>
        </div>

        <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Virtual Routing</span>
            <Zap className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-base font-bold text-white font-mono truncate">
            "all-models"
          </div>
          <div className="mt-1 text-xs text-amber-400/90">
            OpenRouter-style waterfall active
          </div>
        </div>
      </div>

      {/* Keys Table */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-4 border-b border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Key className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-bold text-white">Configured Client API Keys</h3>
          </div>
          <span className="text-xs text-slate-400">{clientKeys.length} registered</span>
        </div>

        {clientKeys.length === 0 ? (
          <div className="text-center py-12 text-slate-500 text-sm">
            No client API keys created yet. Click "Generate Client Key" to issue a key for an app.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800 font-semibold">
                <tr>
                  <th className="py-3 px-4">Name & Client App</th>
                  <th className="py-3 px-4">API Key Token</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Token Consumption</th>
                  <th className="py-3 px-4">Requests</th>
                  <th className="py-3 px-4">Last Used</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {clientKeys.map((k) => {
                  const isRevealed = revealedKeys[k.id];
                  const isCopied = copiedKeyId === k.id;

                  return (
                    <tr key={k.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3.5 px-4 font-sans">
                        <div className="font-semibold text-white">{k.name}</div>
                        <div className="text-[10px] text-slate-500 font-mono">{k.id}</div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800 max-w-[240px]">
                          <span className="truncate text-slate-300 font-mono text-[11px]">
                            {isRevealed ? k.key : `••••••••••••${k.key.slice(-4)}`}
                          </span>
                          <button
                            onClick={() => toggleReveal(k.id)}
                            className="text-slate-500 hover:text-slate-300 p-0.5 ml-auto"
                            title={isRevealed ? 'Hide' : 'Reveal'}
                          >
                            {isRevealed ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                          </button>
                          <button
                            onClick={() => copyToClipboard(k.key, k.id)}
                            className="text-slate-500 hover:text-cyan-400 p-0.5"
                            title="Copy key"
                          >
                            {isCopied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          </button>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 font-sans">
                        <button
                          onClick={() => handleToggle(k.id)}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${
                            k.enabled
                              ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/60'
                              : 'bg-slate-800 text-slate-400 border border-slate-700'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${k.enabled ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                          {k.enabled ? 'Active' : 'Disabled'}
                        </button>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="text-cyan-300 font-bold">
                          {(k.totalTokens || 0).toLocaleString()} <span className="text-[10px] text-slate-500 font-normal">tok</span>
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {(k.totalPromptTokens || 0).toLocaleString()} in / {(k.totalCompletionTokens || 0).toLocaleString()} out
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-slate-300">
                        {k.totalRequests || 0}
                      </td>

                      <td className="py-3.5 px-4 font-sans text-slate-400 text-[11px]">
                        {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleDateString() : 'Never'}
                      </td>

                      <td className="py-3.5 px-4 text-right font-sans">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => onFilterLogsByKey(k.id)}
                            className="px-2 py-1 text-[11px] rounded bg-slate-800 hover:bg-slate-700 text-cyan-400 hover:text-cyan-300 transition-colors"
                            title="Inspect logs for this key"
                          >
                            Logs
                          </button>
                          <button
                            onClick={() => handleRegenerate(k.id, k.name)}
                            className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors"
                            title="Regenerate Token"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(k.id, k.name)}
                            className="p-1.5 text-slate-400 hover:text-rose-400 rounded hover:bg-slate-800 transition-colors"
                            title="Revoke / Delete Key"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Client Integration Code Snippet */}
      <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold text-white uppercase tracking-wider">
            <Terminal className="w-3.5 h-3.5 text-cyan-400" />
            <span>Client Integration with "all-models" Waterfall</span>
          </div>
          <span className="text-[11px] text-slate-400">OpenAI SDK Compatible</span>
        </div>
        <p className="text-xs text-slate-400">
          Client applications authenticate with their distinct client key and specify <code className="text-cyan-300">model: "all-models"</code> to automatically route through the prioritized dynamic fallback chain.
        </p>
        <pre className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-slate-300 overflow-x-auto">
{`import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "${typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'}/api/v1",
  apiKey: "${clientKeys[0]?.key || 'gw-client-your-token'}",
});

// "all-models" triggers automatic OpenRouter-style Priority 1 -> Priority 2 waterfall
const response = await client.chat.completions.create({
  model: "all-models",
  messages: [{ role: "user", content: "Hello from client app!" }],
  stream: true,
});`}
        </pre>
      </div>

      {/* Create Key Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Key className="w-4 h-4 text-cyan-400" />
                <span>Generate New Client API Key</span>
              </h3>
              <button
                onClick={() => setIsCreateOpen(false)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-300 text-xs">
                {errorMsg}
              </div>
            )}

            {newlyCreatedKey ? (
              <div className="space-y-4 py-2">
                <div className="p-4 bg-emerald-950/60 border border-emerald-800 rounded-xl space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-emerald-300">
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span>API Key Generated Successfully!</span>
                  </div>
                  <p className="text-xs text-slate-300">
                    Copy this key now. Client applications can use it immediately in the Authorization Bearer header:
                  </p>
                  <div className="flex items-center justify-between bg-slate-950 p-2.5 rounded-lg border border-slate-800 font-mono text-xs text-cyan-300 break-all">
                    <span>{newlyCreatedKey.key}</span>
                    <button
                      onClick={() => copyToClipboard(newlyCreatedKey.key, 'newly-created')}
                      className="ml-2 p-1 text-slate-400 hover:text-white shrink-0"
                    >
                      {copiedKeyId === 'newly-created' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    onClick={() => {
                      setIsCreateOpen(false);
                      setNewlyCreatedKey(null);
                    }}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Client App Name / Identifier
                  </label>
                  <input
                    type="text"
                    required
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    placeholder="e.g. Mobile iOS App, Production Worker, Slack Bot"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Custom Key Secret (Optional)
                  </label>
                  <input
                    type="text"
                    value={customKeyString}
                    onChange={(e) => setCustomKeyString(e.target.value)}
                    placeholder="Leave blank to auto-generate a secure random token"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-cyan-500"
                  />
                  <span className="text-[11px] text-slate-500 mt-1 block">
                    Defaults to <code className="text-cyan-400">gw-client-&lt;hex&gt;</code>
                  </span>
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsCreateOpen(false)}
                    className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-xs font-semibold bg-gradient-to-r from-cyan-500 to-indigo-600 text-white rounded-xl shadow-md shadow-cyan-500/20"
                  >
                    Create Key
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
