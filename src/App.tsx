import React, { useState, useEffect, useCallback } from 'react';
import { Navbar } from './components/Navbar';
import { Overview } from './components/Overview';
import { ProvidersList } from './components/ProvidersList';
import { LogsViewer } from './components/LogsViewer';
import { Playground } from './components/Playground';
import { SettingsView } from './components/SettingsModal';
import { NextjsExportView } from './components/NextjsExportModal';
import { ChatConsole } from './components/ChatConsole';
import { ApiKeysView } from './components/ApiKeysView';
import { PipelineManager } from './components/PipelineManager';
import { AIProvider, ClientApiKey, GatewayLog, GatewaySettings } from './types/gateway';
import { fetchProviders, fetchLogs, fetchSettings, fetchClientKeys } from './services/api';
import { MessageSquareCode, Sparkles, ChevronUp, X, Key } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [providers, setProviders] = useState<AIProvider[]>([]);
  const [clientKeys, setClientKeys] = useState<ClientApiKey[]>([]);
  const [logs, setLogs] = useState<GatewayLog[]>([]);
  const [settings, setSettings] = useState<(GatewaySettings & { hasGeminiEnvKey?: boolean; activeClientKeysCount?: number }) | null>(null);
  const [selectedLog, setSelectedLog] = useState<GatewayLog | null>(null);
  const [activeApiKeyFilter, setActiveApiKeyFilter] = useState<string>('all');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Floating widget states
  const [isFloatingChatOpen, setIsFloatingChatOpen] = useState<boolean>(false);
  const [isFloatingChatMaximized, setIsFloatingChatMaximized] = useState<boolean>(false);

  const loadData = useCallback(async () => {
    try {
      const [provs, lgs, stgs, keys] = await Promise.all([
        fetchProviders(),
        fetchLogs('all', 'all', 'all', 200),
        fetchSettings(),
        fetchClientKeys(),
      ]);
      setProviders(provs);
      setLogs(lgs);
      setSettings(stgs);
      setClientKeys(keys);
      setError(null);
    } catch (err: any) {
      console.error('Failed to load gateway data:', err);
      setError(err?.message || 'Could not connect to gateway backend');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleInspectLog = (log: GatewayLog) => {
    setSelectedLog(log);
    setActiveTab('logs');
  };

  const handleFilterLogsByKey = (keyId: string) => {
    setActiveApiKeyFilter(keyId);
    setActiveTab('logs');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Top Navbar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        settings={settings}
        logsCount={logs.length}
        onOpenChatFloating={() => setIsFloatingChatOpen(true)}
        isFloatingChatOpen={isFloatingChatOpen}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="mb-6 p-4 rounded-2xl bg-rose-950/70 border border-rose-800 text-rose-300 text-xs flex items-center justify-between">
            <span>{error}</span>
            <button
              onClick={loadData}
              className="px-3 py-1 bg-rose-900/60 hover:bg-rose-800 text-white rounded-lg font-medium transition-colors"
            >
              Retry Connection
            </button>
          </div>
        )}

        {loading ? (
          <div className="min-h-[50vh] flex flex-col items-center justify-center space-y-4">
            <div className="w-10 h-10 rounded-full border-2 border-cyan-500 border-t-transparent animate-spin" />
            <p className="text-xs text-slate-400 font-mono tracking-wider">
              Initializing Unified AI Gateway runtime & cache...
            </p>
          </div>
        ) : (
          <>
            {activeTab === 'overview' && (
              <Overview
                providers={providers}
                logs={logs}
                settings={settings}
                onNavigate={setActiveTab}
                onInspectLog={handleInspectLog}
              />
            )}

            {activeTab === 'chat' && (
              <div className="space-y-4 animate-fadeIn">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                      <MessageSquareCode className="w-5 h-5 text-cyan-400" />
                      <span>Unified AI Chat & Parallel Benchmark Console</span>
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Prompt individual models, test the <code className="text-cyan-300">"all-models"</code> OpenRouter dynamic waterfall, or compare all providers concurrently.
                    </p>
                  </div>
                </div>
                <ChatConsole
                  providers={providers}
                  settings={settings}
                  onRefreshLogs={loadData}
                  isFloating={false}
                />
              </div>
            )}

            {activeTab === 'keys' && (
              <ApiKeysView
                clientKeys={clientKeys}
                onRefresh={loadData}
                onFilterLogsByKey={handleFilterLogsByKey}
              />
            )}

            {activeTab === 'providers' && (
              <ProvidersList
                providers={providers}
                onRefresh={loadData}
                hasGeminiEnvKey={settings?.hasGeminiEnvKey}
              />
            )}

            {activeTab === 'pipeline' && (
              <PipelineManager
                providers={providers}
                settings={settings}
                onRefreshGateway={loadData}
              />
            )}

            {activeTab === 'logs' && (
              <LogsViewer
                logs={logs}
                providers={providers}
                clientKeys={clientKeys}
                onRefresh={loadData}
                selectedLog={selectedLog}
                setSelectedLog={setSelectedLog}
                initialApiKeyFilter={activeApiKeyFilter}
              />
            )}

            {activeTab === 'playground' && (
              <Playground
                providers={providers}
                clientKeys={clientKeys}
                settings={settings}
                onRefreshLogs={loadData}
              />
            )}

            {activeTab === 'settings' && (
              <SettingsView
                settings={settings}
                onRefresh={loadData}
              />
            )}

            {activeTab === 'export' && (
              <NextjsExportView />
            )}
          </>
        )}
      </main>

      {/* Floating Chat Console Widget (Bottom-Right) */}
      {activeTab !== 'chat' && isFloatingChatOpen && (
        <ChatConsole
          providers={providers}
          settings={settings}
          onRefreshLogs={loadData}
          isFloating={true}
          isOpen={isFloatingChatOpen}
          onClose={() => setIsFloatingChatOpen(false)}
          onToggleMaximize={() => setIsFloatingChatMaximized(!isFloatingChatMaximized)}
          isMaximized={isFloatingChatMaximized}
        />
      )}

      {/* Floating Launcher Button (Bottom-Right) when console is closed */}
      {activeTab !== 'chat' && !isFloatingChatOpen && (
        <button
          onClick={() => setIsFloatingChatOpen(true)}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2.5 px-4 py-3 rounded-full bg-gradient-to-r from-cyan-500 via-indigo-600 to-violet-600 text-white font-semibold text-xs shadow-2xl shadow-cyan-500/30 hover:scale-105 active:scale-95 transition-all group border border-cyan-400/30"
          title="Open AI Chat Console"
        >
          <div className="relative">
            <MessageSquareCode className="w-4 h-4 text-white" />
            <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
          </div>
          <span>AI Chat Console</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/30 font-mono text-cyan-200">
            Compare
          </span>
        </button>
      )}

      {/* Modern Sleek Footer */}
      <footer className="border-t border-slate-900/90 bg-slate-950/80 py-6 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-slate-400 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block animate-pulse" />
              <span>Gateway Live:</span>
              <code className="text-cyan-400 font-mono">/api/v1/chat/completions</code>
              <span>•</span>
              <code className="text-cyan-400 font-mono">/api/v1/models</code>
            </div>
          </div>
          <div className="flex items-center gap-4 text-slate-400 text-xs">
            <span>Dynamic "all-models" Waterfall</span>
            <span>•</span>
            <span>Token Analytics & Key Quotas</span>
            <span>•</span>
            <button
              onClick={() => setActiveTab('export')}
              className="hover:text-cyan-300 transition-colors"
            >
              Next.js & Vercel Ready
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
