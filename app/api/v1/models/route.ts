import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const firebaseUrl = process.env.FIREBASE_DATABASE_URL || '';
  const firebaseSecret = process.env.FIREBASE_DATABASE_SECRET || '';

  let providers: Record<string, any> = {};

  if (firebaseUrl) {
    try {
      const cleanUrl = firebaseUrl.replace(/\/$/, '');
      const authParam = firebaseSecret ? `?auth=${encodeURIComponent(firebaseSecret)}` : '';
      const pRes = await fetch(`${cleanUrl}/providers.json${authParam}`, { cache: 'no-store' });
      if (pRes.ok) providers = (await pRes.json()) || {};
    } catch (e) {
      console.error('Failed to fetch providers for models discovery:', e);
    }
  }

  const modelsList: any[] = [];

  // Virtual model "all-models"
  modelsList.push({
    id: 'all-models',
    object: 'model',
    created: 1729584000,
    owned_by: 'gateway-dynamic-fallback',
    permission: [],
    root: 'all-models',
    parent: null,
    metadata: {
      providerId: 'gateway',
      providerName: 'Unified Gateway Dynamic Fallback',
      priority: 0,
      isVirtual: true,
      contextWindow: 2097152,
    },
  });

  for (const prov of Object.values(providers || {})) {
    if (!prov?.enabled) continue;
    for (const mod of prov.models || []) {
      if (mod?.enabled) {
        modelsList.push({
          id: mod.id,
          object: 'model',
          created: prov.createdAt || 1729584000,
          owned_by: prov.name,
          permission: [],
          root: mod.id,
          parent: null,
          metadata: {
            providerId: prov.id,
            providerName: prov.name,
            priority: mod.priority,
            isVirtual: false,
            contextWindow: mod.contextWindow || 128000,
            protocol: prov.protocol,
          },
        });
      }
    }
  }

  return NextResponse.json({
    object: 'list',
    data: modelsList,
  });
}
