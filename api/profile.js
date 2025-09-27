// api/profile.js — trvalá "paměť profilu" v Blob storage (Edge runtine)
export const config = { runtime: 'edge' };
import { put, list } from '@vercel/blob';

const TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const BUCKET_PREFIX = 'profiles/';

async function readJSON(path) {
  // najdeme přesný blob a stáhneme jeho public URL
  const { blobs } = await list({ prefix: path, token: TOKEN });
  const hit = blobs?.find(b => b.pathname === path);
  if (!hit) return null;
  const r = await fetch(hit.url);
  if (!r.ok) return null;
  return await r.json();
}

export default async function handler(req) {
  try {
    if (!TOKEN) {
      return new Response(JSON.stringify({ error: 'Missing BLOB_READ_WRITE_TOKEN' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    const url = new URL(req.url);
    if (req.method === 'GET') {
      const userId = url.searchParams.get('userId');
      if (!userId) return new Response(JSON.stringify({ error: 'Missing userId' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

      const path = `${BUCKET_PREFIX}${userId}.json`;
      const existing = await readJSON(path);
      const profile = existing ?? {
        userId,
        persona: 'Robot kamarád',
        likes: ['lego', 'fotbal'], // můžeš si později upravit
        goals: { dailyQuestions: 10 },
        notes: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      return new Response(JSON.stringify(profile), { headers: { 'Content-Type': 'application/json' } });
    }

    if (req.method === 'POST') {
      const body = await req.json();
      const { userId, patch } = body || {};
      if (!userId) return new Response(JSON.stringify({ error: 'Missing userId' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

      const path = `${BUCKET_PREFIX}${userId}.json`;
      const current = (await readJSON(path)) ?? {};
      const next = {
        ...current,
        ...patch,
        userId,
        updatedAt: new Date().toISOString(),
        createdAt: current.createdAt ?? new Date().toISOString()
      };

      await put(path, JSON.stringify(next, null, 2), {
        access: 'public',                    // jednoduché čtení (bez PII!)
        contentType: 'application/json',
        addRandomSuffix: false,
        token: TOKEN
      });

      return new Response(JSON.stringify(next), { headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
