import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import {
  getGatewayData,
  saveGatewayData,
  cleanupLogsOlderThan7Days,
  resetToDefaultProviders,
  invalidateCache,
  getFallbackPipeline,
  updateFallbackPipeline,
} from './src/server/store';
import { processChatCompletion, getModelsDiscovery } from './src/server/gatewayEngine';
import { AIProvider, ClientApiKey } from './src/types/gateway';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  const isProd = process.env.NODE_ENV === 'production';

  app.use(express.json({ limit: '10mb' }));

  // Request logger in dev
  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) {
      const start = Date.now();
      res.on('finish', () => {
        const ms = Date.now() - start;
        console.log(`[API] ${req.method} ${req.path} -> ${res.statusCode} (${ms}ms)`);
      });
    }
    next();
  });

  // ========================================================
  // OpenAI Models Discovery Endpoint
  // Returns all active models + the virtual "all-models"
  // ========================================================
  const handleModelsDiscovery = async (req: express.Request, res: express.Response) => {
    try {
      const result = await getModelsDiscovery();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: { message: err?.message || 'Failed to discover models' } });
    }
  };

  app.get('/api/v1/models', handleModelsDiscovery);
  app.get('/v1/models', handleModelsDiscovery);

  // ========================================================
  // Core Gateway Chat Completions Route (OpenAI format)
  // Supports single models and "all-models" dynamic fallback
  // ========================================================
  app.post('/api/v1/chat/completions', async (req, res) => {
    try {
      await processChatCompletion(req, res);
    } catch (err: any) {
      console.error('[Gateway Fatal Error]:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: { message: err?.message || 'Internal gateway error' } });
      }
    }
  });

  app.post('/v1/chat/completions', async (req, res) => {
    try {
      await processChatCompletion(req, res);
    } catch (err: any) {
      console.error('[Gateway Fatal Error]:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: { message: err?.message || 'Internal gateway error' } });
      }
    }
  });

  // ========================================================
  // Client API Key Management & Token Usage
  // ========================================================
  app.get('/api/keys', async (req, res) => {
    const data = await getGatewayData();
    res.json(Object.values(data.clientKeys || {}));
  });

  app.post('/api/keys', async (req, res) => {
    try {
      const { name, customKey } = req.body;
      if (!name || !name.trim()) {
        return res.status(400).json({ error: 'Key name is required' });
      }

      const id = `key-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
      const generatedToken = customKey?.trim() || `gw-client-${crypto.randomBytes(12).toString('hex')}`;

      const newKey: ClientApiKey = {
        id,
        name: name.trim(),
        key: generatedToken,
        enabled: true,
        createdAt: Date.now(),
        totalRequests: 0,
        totalPromptTokens: 0,
        totalCompletionTokens: 0,
        totalTokens: 0,
      };

      await saveGatewayData((prev) => ({
        ...prev,
        clientKeys: {
          ...prev.clientKeys,
          [id]: newKey,
        },
      }));

      invalidateCache();
      res.json({ success: true, key: newKey });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/keys/:id', async (req, res) => {
    const { id } = req.params;
    await saveGatewayData((prev) => {
      const nextKeys = { ...prev.clientKeys };
      delete nextKeys[id];
      return {
        ...prev,
        clientKeys: nextKeys,
      };
    });
    invalidateCache();
    res.json({ success: true, deletedId: id });
  });

  app.patch('/api/keys/:id/toggle', async (req, res) => {
    const { id } = req.params;
    let newStatus = false;
    await saveGatewayData((prev) => {
      const k = prev.clientKeys[id];
      if (!k) return prev;
      newStatus = !k.enabled;
      return {
        ...prev,
        clientKeys: {
          ...prev.clientKeys,
          [id]: { ...k, enabled: newStatus },
        },
      };
    });
    invalidateCache();
    res.json({ success: true, id, enabled: newStatus });
  });

  app.post('/api/keys/:id/regenerate', async (req, res) => {
    const { id } = req.params;
    const newToken = `gw-client-${crypto.randomBytes(12).toString('hex')}`;
    let updatedKey: ClientApiKey | null = null;

    await saveGatewayData((prev) => {
      const k = prev.clientKeys[id];
      if (!k) return prev;
      updatedKey = { ...k, key: newToken };
      return {
        ...prev,
        clientKeys: {
          ...prev.clientKeys,
          [id]: updatedKey,
        },
      };
    });

    invalidateCache();
    res.json({ success: true, key: updatedKey });
  });

  // ========================================================
  // 7-Day Auto Log Cleanup Cron Handler
  // ========================================================
  const handleCleanup = async (req: express.Request, res: express.Response) => {
    try {
      const result = await cleanupLogsOlderThan7Days();
      res.json({
        success: true,
        message: `Successfully purged ${result.deletedCount} logs older than 7 days`,
        ...result,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Cleanup failed' });
    }
  };

  app.get('/api/cron/cleanup-logs', handleCleanup);
  app.post('/api/cron/cleanup-logs', handleCleanup);

  // ========================================================
  // Provider & Model Management API
  // ========================================================
  app.get('/api/providers', async (req, res) => {
    const data = await getGatewayData();
    res.json(Object.values(data.providers));
  });

  app.post('/api/providers', async (req, res) => {
    try {
      const provider: AIProvider = req.body;
      if (!provider.id || !provider.name || !provider.baseUrl) {
        return res.status(400).json({ error: 'Missing required provider fields (id, name, baseUrl)' });
      }

      await saveGatewayData((prev) => {
        const existing = prev.providers[provider.id];
        return {
          ...prev,
          providers: {
            ...prev.providers,
            [provider.id]: {
              ...provider,
              models: provider.models || existing?.models || [],
              createdAt: existing?.createdAt || Date.now(),
              updatedAt: Date.now(),
            },
          },
        };
      });

      invalidateCache();
      res.json({ success: true, provider });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/providers/:id', async (req, res) => {
    const { id } = req.params;
    await saveGatewayData((prev) => {
      const nextProviders = { ...prev.providers };
      delete nextProviders[id];
      return {
        ...prev,
        providers: nextProviders,
      };
    });
    invalidateCache();
    res.json({ success: true, deletedId: id });
  });

  app.patch('/api/providers/:id/toggle', async (req, res) => {
    const { id } = req.params;
    let newStatus = false;
    await saveGatewayData((prev) => {
      const p = prev.providers[id];
      if (!p) return prev;
      newStatus = !p.enabled;
      return {
        ...prev,
        providers: {
          ...prev.providers,
          [id]: { ...p, enabled: newStatus, updatedAt: Date.now() },
        },
      };
    });
    invalidateCache();
    res.json({ success: true, id, enabled: newStatus });
  });

  // Model management within provider
  app.post('/api/providers/:id/models', async (req, res) => {
    const { id } = req.params;
    const { modelId, name, priority = 1, contextWindow = 128000, notes = '' } = req.body;
    if (!modelId || !name) {
      return res.status(400).json({ error: 'modelId and name are required' });
    }

    await saveGatewayData((prev) => {
      const p = prev.providers[id];
      if (!p) return prev;
      const filtered = (p.models || []).filter((m) => m.id !== modelId);
      filtered.push({
        id: modelId,
        name,
        enabled: true,
        priority: Number(priority),
        contextWindow: Number(contextWindow),
        notes,
      });
      filtered.sort((a, b) => a.priority - b.priority);

      return {
        ...prev,
        providers: {
          ...prev.providers,
          [id]: { ...p, models: filtered, updatedAt: Date.now() },
        },
      };
    });
    invalidateCache();
    res.json({ success: true });
  });

  app.delete('/api/providers/:id/models/:modelId', async (req, res) => {
    const { id, modelId } = req.params;
    await saveGatewayData((prev) => {
      const p = prev.providers[id];
      if (!p) return prev;
      return {
        ...prev,
        providers: {
          ...prev.providers,
          [id]: {
            ...p,
            models: (p.models || []).filter((m) => m.id !== modelId),
            updatedAt: Date.now(),
          },
        },
      };
    });
    invalidateCache();
    res.json({ success: true });
  });

  app.patch('/api/providers/:id/models/:modelId/toggle', async (req, res) => {
    const { id, modelId } = req.params;
    let modelState = false;
    await saveGatewayData((prev) => {
      const p = prev.providers[id];
      if (!p) return prev;
      const models = (p.models || []).map((m) => {
        if (m.id === modelId) {
          modelState = !m.enabled;
          return { ...m, enabled: modelState };
        }
        return m;
      });
      return {
        ...prev,
        providers: {
          ...prev.providers,
          [id]: { ...p, models, updatedAt: Date.now() },
        },
      };
    });
    invalidateCache();
    res.json({ success: true, enabled: modelState });
  });

  app.patch('/api/providers/:id/models/:modelId/priority', async (req, res) => {
    const { id, modelId } = req.params;
    const { priority } = req.body;
    await saveGatewayData((prev) => {
      const p = prev.providers[id];
      if (!p) return prev;
      const models = (p.models || []).map((m) => (m.id === modelId ? { ...m, priority: Number(priority) } : m));
      models.sort((a, b) => a.priority - b.priority);
      return {
        ...prev,
        providers: {
          ...prev.providers,
          [id]: { ...p, models, updatedAt: Date.now() },
        },
      };
    });
    invalidateCache();
    res.json({ success: true });
  });

  // ========================================================
  // Fallback Pipeline Sequence API ("all-models")
  // ========================================================
  app.get('/api/pipeline', async (req, res) => {
    try {
      const pipeline = await getFallbackPipeline();
      res.json(pipeline);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to fetch fallback pipeline' });
    }
  });

  app.put('/api/pipeline', async (req, res) => {
    try {
      const { items } = req.body;
      if (!Array.isArray(items)) {
        return res.status(400).json({ error: 'items array is required' });
      }
      const updated = await updateFallbackPipeline(items);
      res.json({ success: true, pipeline: updated });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to update fallback pipeline' });
    }
  });

  // ========================================================
  // Logs & Analytics API
  // ========================================================
  app.get('/api/logs', async (req, res) => {
    const data = await getGatewayData();
    const logsList = Object.values(data.logs).sort((a, b) => b.timestamp - a.timestamp);
    const limit = parseInt(req.query.limit as string, 10) || 200;
    const status = req.query.status as string;
    const providerId = req.query.providerId as string;
    const apiKeyId = req.query.apiKeyId as string;

    let filtered = logsList;
    if (status && status !== 'all') {
      if (status === 'fallback') {
        filtered = filtered.filter((l) => l.wasFallback);
      } else {
        filtered = filtered.filter((l) => l.status === status);
      }
    }
    if (providerId && providerId !== 'all') {
      filtered = filtered.filter((l) => l.providerId === providerId);
    }
    if (apiKeyId && apiKeyId !== 'all') {
      filtered = filtered.filter((l) => l.apiKeyId === apiKeyId);
    }

    res.json(filtered.slice(0, limit));
  });

  app.delete('/api/logs', async (req, res) => {
    await saveGatewayData((prev) => ({
      ...prev,
      logs: {},
    }));
    res.json({ success: true, message: 'All logs cleared' });
  });

  // ========================================================
  // Gateway Settings & Firebase Sync
  // ========================================================
  app.get('/api/settings', async (req, res) => {
    const data = await getGatewayData();
    res.json({
      ...data.settings,
      hasGeminiEnvKey: Boolean(process.env.GEMINI_API_KEY),
      activeClientKeysCount: Object.values(data.clientKeys || {}).filter((k) => k && k.enabled).length,
    });
  });

  app.post('/api/settings', async (req, res) => {
    const newSettings = req.body;
    await saveGatewayData((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        ...newSettings,
      },
    }));
    invalidateCache();
    res.json({ success: true, settings: newSettings });
  });

  app.post('/api/settings/reset-defaults', async (req, res) => {
    const updated = await resetToDefaultProviders();
    invalidateCache();
    res.json({ success: true, providers: updated.providers, clientKeys: updated.clientKeys });
  });

  app.post('/api/firebase/test-connection', async (req, res) => {
    const { firebaseUrl, firebaseSecret } = req.body;
    if (!firebaseUrl) {
      return res.status(400).json({ success: false, error: 'Firebase URL is required' });
    }

    try {
      const cleanUrl = firebaseUrl.replace(/\/$/, '');
      const authQuery = firebaseSecret ? `?auth=${encodeURIComponent(firebaseSecret)}` : '';
      const testRes = await fetch(`${cleanUrl}/.json${authQuery}`, { cache: 'no-store' });
      if (!testRes.ok) {
        return res.status(testRes.status).json({
          success: false,
          error: `Firebase responded with status ${testRes.status}: ${testRes.statusText}`,
        });
      }
      const data = await testRes.json();
      res.json({
        success: true,
        message: 'Successfully connected to Firebase Realtime Database!',
        hasExistingData: Boolean(data && Object.keys(data).length > 0),
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || 'Connection failed' });
    }
  });

  // Test provider ping
  app.post('/api/providers/:id/test-ping', async (req, res) => {
    const { id } = req.params;
    const data = await getGatewayData();
    const provider = data.providers[id];
    if (!provider) return res.status(404).json({ error: 'Provider not found' });

    const start = Date.now();
    try {
      if (provider.protocol === 'gemini-native') {
        const apiKey = provider.apiKey || process.env.GEMINI_API_KEY || '';
        const firstModel = provider.models.find((m) => m.enabled) || provider.models[0];
        const isBearer = apiKey.startsWith('AQ.') || apiKey.startsWith('ya29.');
        let endpoint = `${provider.baseUrl.replace(/\/$/, '')}/models/${firstModel?.id || 'gemini-2.5-flash'}:generateContent`;
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (isBearer) {
          headers['Authorization'] = `Bearer ${apiKey}`;
        } else {
          endpoint += `?key=${encodeURIComponent(apiKey)}`;
          headers['x-goog-api-key'] = apiKey;
        }

        const testRes = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: 'Ping test. Reply with "pong".' }] }],
          }),
        });
        const latency = Date.now() - start;
        if (!testRes.ok) {
          const txt = await testRes.text();
          return res.status(testRes.status).json({ success: false, latency, error: txt.substring(0, 300) });
        }
        const json = await testRes.json();
        const text = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
        return res.json({ success: true, latency, responseText: text.trim(), model: firstModel?.id });
      } else {
        const apiKey = provider.apiKey;
        if (!apiKey) return res.status(400).json({ error: 'No API key configured for provider' });
        const firstModel = provider.models.find((m) => m.enabled) || provider.models[0];
        const targetUrl = `${provider.baseUrl.replace(/\/$/, '')}/chat/completions`;
        const testRes = await fetch(targetUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
            ...(provider.customHeaders || {}),
          },
          body: JSON.stringify({
            model: firstModel?.id || 'gpt-3.5-turbo',
            messages: [{ role: 'user', content: 'Ping test. Reply with "pong".' }],
            max_tokens: 10,
          }),
        });
        const latency = Date.now() - start;
        if (!testRes.ok) {
          const txt = await testRes.text();
          return res.status(testRes.status).json({ success: false, latency, error: txt.substring(0, 300) });
        }
        const json = await testRes.json();
        const text = json.choices?.[0]?.message?.content || '';
        return res.json({ success: true, latency, responseText: text.trim(), model: firstModel?.id });
      }
    } catch (err: any) {
      res.status(500).json({ success: false, latency: Date.now() - start, error: err.message });
    }
  });

  // Mount Vite development middlewares or serve static dist in production
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Unified AI Gateway server active on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
