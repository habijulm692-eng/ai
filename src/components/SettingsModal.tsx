import React, { useState, useEffect } from 'react';
import {
  Settings,
  Database,
  Key,
  Shield,
  Zap,
  Check,
  AlertTriangle,
  RotateCcw,
  Download,
  Upload,
  ExternalLink,
  Loader2,
  Save,
} from 'lucide-react';
import { GatewaySettings } from '../types/gateway';
import { saveSettings, testFirebaseConnection } from '../services/api';

interface SettingsViewProps {
  settings: GatewaySettings | null;
  onRefresh: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ settings, onRefresh }) => {
  const [masterApiKey, setMasterApiKey] = useState('');
  const [firebaseUrl, setFirebaseUrl] = useState('');
  const [firebaseSecret, setFirebaseSecret] = useState('');
  const [cacheTtl, setCacheTtl] = useState(60);
  const [fallbackEnabled, setFallbackEnabled] = useState(true);
  const [maxRetries, setMaxRetries] = useState(3);
  const [requestTimeoutMs, setRequestTimeoutMs] = useState(30000);

  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [testResult, setTestResult] = useState<{ loading: boolean; success?: boolean; message?: string; error?: string } | null>(null);

  useEffect(() => {
    if (settings) {
      setMasterApiKey(settings.masterApiKey || '');
      setFirebaseUrl(settings.firebaseUrl || '');
      setFirebaseSecret(settings.firebaseSecret || '');
      setCacheTtl(settings.cacheTtlSeconds || 60);
      setFallbackEnabled(settings.fallbackEnabled ?? true);
      setMaxRetries(settings.maxRetries || 3);
      setRequestTimeoutMs(settings.requestTimeoutMs || 30000);
    }
  }, [settings]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveSuccess(false);

    try {
      await saveSettings({
        masterApiKey: masterApiKey.trim(),
        firebaseUrl: firebaseUrl.trim(),
        firebaseSecret: firebaseSecret.trim(),
        cacheTtlSeconds: Number(cacheTtl),
        fallbackEnabled,
        maxRetries: Number(maxRetries),
        requestTimeoutMs: Number(requestTimeoutMs),
      });
      setSaveSuccess(true);
      onRefresh();
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      alert('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleTestFirebase = async () => {
    if (!firebaseUrl.trim()) {
      alert('Please enter a Firebase Realtime Database URL first');
      return;
    }
    setTestResult({ loading: true });
    try {
      const res = await testFirebaseConnection(firebaseUrl.trim(), firebaseSecret.trim());
      setTestResult({
        loading: false,
        success: res.success,
        message: res.message,
        error: res.error,
      });
    } catch (err: any) {
      setTestResult({
        loading: false,
        success: false,
        error: err.message || 'Connection test failed',
      });
    }
  };

  const generateNewKey = () => {
    const randomHex = Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    setMasterApiKey(`gw-sk-${randomHex}`);
  };

  const downloadJsonSchema = () => {
    fetch('/firebase-database.json')
      .then((res) => res.blob())
      .then((blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'firebase-database.json';
        a.click();
      });
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto animate-fadeIn">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Settings className="w-5 h-5 text-cyan-400" />
          <span>Gateway Security & Firebase Configuration</span>
        </h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Configure authentication keys, in-memory cache TTL, and direct Firebase Realtime Database synchronization.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Master API Key Card */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-xl">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Shield className="w-4 h-4 text-cyan-400" />
                <span>Gateway Master API Key</span>
              </h3>
              <p className="text-xs text-slate-400 max-w-xl">
                Required in the <code className="text-cyan-300">Authorization: Bearer &lt;KEY&gt;</code> header for all incoming requests to <code className="text-cyan-300">/api/v1/chat/completions</code>.
              </p>
            </div>
            <button
              type="button"
              onClick={generateNewKey}
              className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl transition-colors font-medium border border-slate-700/60"
            >
              Generate Random Key
            </button>
          </div>

          <div>
            <input
              type="text"
              required
              value={masterApiKey}
              onChange={(e) => setMasterApiKey(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-cyan-400 focus:outline-none focus:border-cyan-500"
            />
          </div>
        </div>

        {/* In-Memory Cache & Fallback Card */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-xl">
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Zap className="w-4 h-4 text-indigo-400" />
              <span>In-Memory Serverless Cache & Fallback Engine</span>
            </h3>
            <p className="text-xs text-slate-400">
              Caches provider configs in memory to prevent polling Firebase on every single API call.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Cache TTL (Seconds)
              </label>
              <input
                type="number"
                min="5"
                max="600"
                value={cacheTtl}
                onChange={(e) => setCacheTtl(Number(e.target.value))}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-cyan-500"
              />
              <span className="text-[11px] text-slate-500 mt-1 block">
                Recommended: 60 seconds (prevents quota burn and delivers &lt;1ms cache hits)
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Automatic Failover on 429 & 5xx
              </label>
              <div className="flex items-center justify-between p-2.5 bg-slate-950 border border-slate-800 rounded-xl">
                <span className="text-xs text-slate-300">
                  {fallbackEnabled ? 'Enabled (Auto-reroute)' : 'Disabled'}
                </span>
                <button
                  type="button"
                  onClick={() => setFallbackEnabled(!fallbackEnabled)}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border border-transparent transition-colors duration-200 ease-in-out ${
                    fallbackEnabled ? 'bg-cyan-500' : 'bg-slate-800'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      fallbackEnabled ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* BUG FIX: Added missing Request Timeout field so it actually gets saved */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Max Retries
              </label>
              <input
                type="number"
                min="1"
                max="10"
                value={maxRetries}
                onChange={(e) => setMaxRetries(Number(e.target.value))}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-cyan-500"
              />
              <span className="text-[11px] text-slate-500 mt-1 block">
                Max fallback attempts before returning 502
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Request Timeout (ms)
              </label>
              <input
                type="number"
                min="5000"
                max="120000"
                step="1000"
                value={requestTimeoutMs}
                onChange={(e) => setRequestTimeoutMs(Number(e.target.value))}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-cyan-500"
              />
              <span className="text-[11px] text-slate-500 mt-1 block">
                Upstream request timeout before abort &amp; fallback (default: 30000ms)
              </span>
            </div>
          </div>
        </div>

        {/* Firebase Realtime Database Card */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-xl">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Database className="w-4 h-4 text-cyan-400" />
                <span>Firebase Realtime Database Integration</span>
              </h3>
              <p className="text-xs text-slate-400 max-w-xl">
                Store all providers, models, and real-time logs directly in Firebase Realtime Database. If left blank, the gateway uses local dynamic storage.
              </p>
            </div>
            <button
              type="button"
              onClick={downloadJsonSchema}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded-xl transition-colors font-medium border border-slate-700/60"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Schema JSON</span>
            </button>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Firebase Realtime Database URL
              </label>
              <input
                type="url"
                value={firebaseUrl}
                onChange={(e) => setFirebaseUrl(e.target.value)}
                placeholder="https://my-app-default-rtdb.firebaseio.com"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Database Secret or Auth Token (Optional if rules are open)
              </label>
              <input
                type="password"
                value={firebaseSecret}
                onChange={(e) => setFirebaseSecret(e.target.value)}
                placeholder="Firebase Database Secret or Service Account Token"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={handleTestFirebase}
                disabled={testResult?.loading || !firebaseUrl.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors disabled:opacity-40"
              >
                {testResult?.loading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                ) : (
                  <Zap className="w-3.5 h-3.5 text-cyan-400" />
                )}
                <span>Test Firebase Connection</span>
              </button>

              <a
                href="https://console.firebase.google.com"
                target="_blank"
                rel="noreferrer"
                className="text-xs text-slate-400 hover:text-cyan-400 flex items-center gap-1"
              >
                <span>Firebase Console</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            {testResult && !testResult.loading && (
              <div
                className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                  testResult.success
                    ? 'bg-emerald-950/70 border border-emerald-800 text-emerald-300'
                    : 'bg-rose-950/70 border border-rose-800 text-rose-300'
                }`}
              >
                {testResult.success ? (
                  <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                )}
                <span>{testResult.message || testResult.error}</span>
              </div>
            )}
          </div>
        </div>

        {/* Save Bar */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-800">
          <div>
            {saveSuccess && (
              <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1 animate-fadeIn">
                <Check className="w-4 h-4" />
                Settings saved & in-memory cache refreshed!
              </span>
            )}
          </div>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white font-semibold text-xs shadow-lg shadow-cyan-500/20 transition-all disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>Save Configuration</span>
          </button>
        </div>
      </form>
    </div>
  );
};
