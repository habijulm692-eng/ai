import React, { useState } from 'react';
import {
  Code2,
  Copy,
  Check,
  Download,
  FileCode,
  ExternalLink,
  Layers,
  Database,
  Calendar,
} from 'lucide-react';

export const NextjsExportView: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<string>('route');
  const [copied, setCopied] = useState(false);

  const files: Record<string, { title: string; path: string; language: string; content: string }> = {
    route: {
      title: 'Gateway Route Handler',
      path: 'app/api/v1/chat/completions/route.ts',
      language: 'typescript',
      content: `import { NextRequest, NextResponse } from 'next/server';

// In-Memory Cache (TTL: 60s) for Serverless Runtime
const memoryCache = { providers: {}, settings: {}, lastFetched: 0 };
const CACHE_TTL_MS = 60 * 1000;

async function getCachedConfig() {
  const now = Date.now();
  if (now - memoryCache.lastFetched < CACHE_TTL_MS && Object.keys(memoryCache.providers).length > 0) {
    return { providers: memoryCache.providers, settings: memoryCache.settings };
  }

  const firebaseUrl = process.env.FIREBASE_DATABASE_URL || '';
  const firebaseSecret = process.env.FIREBASE_DATABASE_SECRET || '';

  if (firebaseUrl) {
    const cleanUrl = firebaseUrl.replace(/\\/$/, '');
    const authParam = firebaseSecret ? \`?auth=\${encodeURIComponent(firebaseSecret)}\` : '';
    const [pRes, sRes] = await Promise.all([
      fetch(\`\${cleanUrl}/providers.json\${authParam}\`, { cache: 'no-store' }),
      fetch(\`\${cleanUrl}/settings.json\${authParam}\`, { cache: 'no-store' }),
    ]);
    if (pRes.ok) memoryCache.providers = (await pRes.json()) || {};
    if (sRes.ok) memoryCache.settings = (await sRes.json()) || {};
    memoryCache.lastFetched = now;
  }
  return { providers: memoryCache.providers, settings: memoryCache.settings };
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.replace(/^Bearer\\s+/i, '').trim();
  const body = await req.json();

  const { providers, settings } = await getCachedConfig();
  const masterKey = settings?.masterApiKey || process.env.GATEWAY_MASTER_KEY;

  if (masterKey && token !== masterKey) {
    return NextResponse.json({ error: { message: 'Unauthorized Gateway Key' } }, { status: 401 });
  }

  // Build fallback candidate queue ordered by priority
  const candidates = [];
  for (const prov of Object.values(providers || {})) {
    if (!prov?.enabled) continue;
    for (const mod of prov.models || []) {
      if (mod?.enabled) candidates.push({ provider: prov, model: mod });
    }
  }
  candidates.sort((a, b) => (a.model.priority || 99) - (b.model.priority || 99));

  // Automatic Fallback Loop on 429 or 5xx
  for (const { provider, model } of candidates) {
    try {
      if (provider.protocol === 'gemini-native') {
        const apiKey = provider.apiKey || process.env.GEMINI_API_KEY;
        const url = \`\${provider.baseUrl}/models/\${model.id}:generateContent?key=\${apiKey}\`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: body.messages.map(m => ({
              role: m.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: m.content }]
            }))
          })
        });
        if (!res.ok && (res.status === 429 || res.status >= 500)) continue;
        const data = await res.json();
        return NextResponse.json({
          id: \`chatcmpl-\${Date.now()}\`,
          object: 'chat.completion',
          choices: [{ message: { role: 'assistant', content: data.candidates?.[0]?.content?.parts?.[0]?.text || '' } }]
        });
      } else {
        const res = await fetch(\`\${provider.baseUrl}/chat/completions\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: \`Bearer \${provider.apiKey}\` },
          body: JSON.stringify({ ...body, model: model.id })
        });
        if (!res.ok && (res.status === 429 || res.status >= 500)) continue;
        return NextResponse.json(await res.json());
      }
    } catch (e) {
      continue;
    }
  }

  return NextResponse.json({ error: { message: 'All fallback providers exhausted' } }, { status: 502 });
}`,
    },
    cleanup: {
      title: '7-Day Log Purge Cron Route',
      path: 'app/api/cron/cleanup-logs/route.ts',
      language: 'typescript',
      content: `import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const firebaseUrl = process.env.FIREBASE_DATABASE_URL || '';
  const firebaseSecret = process.env.FIREBASE_DATABASE_SECRET || '';

  if (!firebaseUrl) return NextResponse.json({ error: 'No Firebase URL' }, { status: 400 });

  const cleanUrl = firebaseUrl.replace(/\\/$/, '');
  const authParam = firebaseSecret ? \`?auth=\${encodeURIComponent(firebaseSecret)}\` : '';
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - SEVEN_DAYS_MS;

  const logsRes = await fetch(\`\${cleanUrl}/logs.json\${authParam}\`, { cache: 'no-store' });
  const logs = (await logsRes.json()) || {};

  let deletedCount = 0;
  const deletePromises = [];

  for (const [key, log] of Object.entries(logs)) {
    if (log && typeof log.timestamp === 'number' && log.timestamp < cutoff) {
      deletedCount++;
      deletePromises.push(
        fetch(\`\${cleanUrl}/logs/\${key}.json\${authParam}\`, { method: 'DELETE' })
      );
    }
  }

  await Promise.all(deletePromises);
  return NextResponse.json({ success: true, deletedCount, cutoffDate: new Date(cutoff).toISOString() });
}

export async function POST(req: NextRequest) {
  return GET(req);
}`,
    },
    models: {
      title: 'Models Discovery Route',
      path: 'app/api/v1/models/route.ts',
      language: 'typescript',
      content: `import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const firebaseUrl = process.env.FIREBASE_DATABASE_URL || '';
  const firebaseSecret = process.env.FIREBASE_DATABASE_SECRET || '';

  let providers: Record<string, any> = {};
  if (firebaseUrl) {
    const cleanUrl = firebaseUrl.replace(/\\/$/, '');
    const authParam = firebaseSecret ? \`?auth=\${encodeURIComponent(firebaseSecret)}\` : '';
    const res = await fetch(\`\${cleanUrl}/providers.json\${authParam}\`, { cache: 'no-store' });
    if (res.ok) providers = (await res.json()) || {};
  }

  const modelsList = [
    {
      id: 'all-models',
      object: 'model',
      created: 1729584000,
      owned_by: 'gateway-dynamic-fallback',
      metadata: { isVirtual: true, priority: 0 }
    }
  ];

  for (const prov of Object.values(providers || {})) {
    if (!prov?.enabled) continue;
    for (const mod of prov.models || []) {
      if (mod?.enabled) {
        modelsList.push({
          id: mod.id,
          object: 'model',
          created: 1729584000,
          owned_by: prov.name,
          metadata: { priority: mod.priority, providerId: prov.id }
        });
      }
    }
  }

  return NextResponse.json({ object: 'list', data: modelsList });
}`,
    },
    vercel: {
      title: 'Vercel Deployment & Cron Config',
      path: 'vercel.json',
      language: 'json',
      content: `{
  "crons": [
    {
      "path": "/api/cron/cleanup-logs",
      "schedule": "0 0 * * *"
    }
  ]
}`,
    },
    schema: {
      title: 'Firebase Realtime DB Initial Schema',
      path: 'firebase-database.json',
      language: 'json',
      content: `{
  "settings": {
    "masterApiKey": "gw-sk-master-live-2026",
    "cacheTtlSeconds": 60,
    "fallbackEnabled": true
  },
  "providers": {
    "google-ai-studio": {
      "id": "google-ai-studio",
      "name": "Google AI Studio",
      "enabled": true,
      "protocol": "gemini-native",
      "baseUrl": "https://generativelanguage.googleapis.com/v1beta",
      "apiKey": "",
      "models": [
        { "id": "gemini-2.5-flash", "name": "Gemini 2.5 Flash", "enabled": true, "priority": 1 },
        { "id": "gemini-1.5-flash", "name": "Gemini 1.5 Flash", "enabled": true, "priority": 2 }
      ]
    },
    "groq": {
      "id": "groq",
      "name": "Groq Cloud",
      "enabled": true,
      "protocol": "openai-compatible",
      "baseUrl": "https://api.groq.com/openai/v1",
      "apiKey": "",
      "models": [
        { "id": "llama-3.3-70b-versatile", "name": "Llama 3.3 70B", "enabled": true, "priority": 1 }
      ]
    }
  },
  "logs": {}
}`,
    },
  };

  const currentFile = files[selectedFile];

  const handleCopy = () => {
    navigator.clipboard.writeText(currentFile.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-fadeIn">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Code2 className="w-5 h-5 text-cyan-400" />
          <span>Next.js App Router & Vercel Export</span>
        </h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Standalone production files ready to copy directly into a Next.js App Router project deployed on Vercel Hobby/Free tier.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* File Navigator */}
        <div className="space-y-2">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block px-1">
            Deliverable Files
          </span>
          {Object.entries(files).map(([key, f]) => (
            <button
              key={key}
              onClick={() => setSelectedFile(key)}
              className={`w-full text-left p-3 rounded-xl border text-xs transition-all ${
                selectedFile === key
                  ? 'bg-slate-900 border-cyan-500/80 text-white shadow-md shadow-cyan-500/10'
                  : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
              }`}
            >
              <div className="font-semibold">{f.title}</div>
              <div className="font-mono text-[10px] text-cyan-400/90 truncate mt-0.5">
                {f.path}
              </div>
            </button>
          ))}
        </div>

        {/* Code Preview */}
        <div className="md:col-span-3 bg-slate-900/80 border border-slate-800 rounded-2xl p-5 flex flex-col shadow-xl">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <FileCode className="w-4 h-4 text-cyan-400" />
              <span className="font-mono text-xs text-white font-semibold">
                {currentFile.path}
              </span>
            </div>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl transition-colors font-medium border border-slate-700"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied to Clipboard' : 'Copy Code'}</span>
            </button>
          </div>

          <pre className="mt-3 p-4 bg-slate-950 rounded-xl border border-slate-800/80 text-xs font-mono text-slate-300 overflow-x-auto max-h-[500px]">
            {currentFile.content}
          </pre>
        </div>
      </div>
    </div>
  );
};
