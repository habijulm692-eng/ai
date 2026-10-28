import React, { useState } from 'react';
import {
  Server,
  Layers,
  ScrollText,
  Terminal,
  Settings,
  Code2,
  Copy,
  Check,
  Zap,
  Database,
  ShieldCheck,
  MessageSquareCode,
  GitBranch,
  Key,
} from 'lucide-react';
import { GatewaySettings } from '../types/gateway';

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  settings: GatewaySettings | null;
  logsCount: number;
  onOpenChatFloating?: () => void;
  isFloatingChatOpen?: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  settings,
  logsCount,
  onOpenChatFloating,
  isFloatingChatOpen,
}) => {
  const [copiedKey, setCopiedKey] = useState(false);

  const copyKey = () => {
    if (settings?.masterApiKey) {
      navigator.clipboard.writeText(settings.masterApiKey);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    }
  };

  const navItems = [
    { id: 'overview', label: 'Overview', icon: Zap },
    { id: 'chat', label: 'Chat & Compare', icon: MessageSquareCode },
    { id: 'keys', label: 'API Keys & Usage', icon: Key },
    { id: 'providers', label: 'Providers & Models', icon: Layers },
    { id: 'pipeline', label: 'Fallback Pipeline', icon: GitBranch },
    { id: 'logs', label: 'Real-time Logs', icon: ScrollText, badge: logsCount },
    { id: 'playground', label: 'Playground', icon: Terminal },
    { id: 'settings', label: 'Settings & Firebase', icon: Settings },
    { id: 'export', label: 'Next.js Export', icon: Code2 },
  ];

  const isFirebaseConnected = Boolean(settings?.firebaseUrl);

  return (
    <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-950/85 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Brand */}
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 via-indigo-600 to-violet-600 shadow-lg shadow-cyan-500/20 text-white font-bold">
              <Server className="w-5 h-5 text-white" />
              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-slate-950 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-base tracking-tight text-white">
                  Unified AI Gateway
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-cyan-950/80 text-cyan-400 border border-cyan-800/60">
                  v1.0
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span className="flex items-center gap-1 text-[11px] text-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block animate-ping" />
                  Cache TTL: {settings?.cacheTtlSeconds || 60}s
                </span>
                <span>•</span>
                <span className="flex items-center gap-1 text-[11px] text-slate-400">
                  <Database className="w-3 h-3 text-cyan-400" />
                  {isFirebaseConnected ? 'Firebase RTDB Sync' : 'Dynamic Local Store'}
                </span>
              </div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="hidden md:flex items-center gap-1 bg-slate-900/60 p-1 rounded-xl border border-slate-800/60 overflow-x-auto no-scrollbar">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                    isActive
                      ? 'bg-gradient-to-r from-cyan-600 to-indigo-600 text-white shadow-sm shadow-cyan-600/30'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{item.label}</span>
                  {typeof item.badge === 'number' && item.badge > 0 && (
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                        isActive
                          ? 'bg-white/20 text-white'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Quick Master Key Pill */}
          <div className="flex items-center gap-2">
            <button
              onClick={copyKey}
              title="Click to copy Master API Key"
              className="flex items-center gap-2 px-3 py-1.5 text-xs bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg border border-slate-800 transition-colors group"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
              <span className="font-mono text-[11px] max-w-[90px] sm:max-w-[130px] truncate">
                {settings?.masterApiKey ? `••••••••${settings.masterApiKey.slice(-4)}` : 'No Key'}
              </span>
              {copiedKey ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-300" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile Navigation bar */}
        <div className="flex md:hidden overflow-x-auto py-2 gap-1 border-t border-slate-800/60 no-scrollbar">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors ${
                  isActive
                    ? 'bg-cyan-600 text-white'
                    : 'text-slate-400 hover:bg-slate-900'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
};
