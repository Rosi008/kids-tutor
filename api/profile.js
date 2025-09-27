// api/profile.js — trvalá "paměť profilu" přes Vercel Blob (Node runtime)
export const config = { runtime: 'nodejs' };
import { put, list } from '@vercel/blob';

const TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const BUCKET_PREFIX = 'profiles/';

async function readJSON(path) {
  const { blobs } = await list({ prefix: path, token: TOKEN });
  const hit = blobs?.find((b) => b.pathname === path);
  if (!hit) return null;
  const r = await fetch(hit.url);
  if (!r.ok) return null;
  return await r.json();
}

function defaultProfile(userId) {
  return {
    userId,
    persona: 'Robot kamarád',
    likes: ['lego', 'fotbal'],
    goals: { dailyQuestions: 10 },
    notes: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// Bezpečné načtení JSON těla v Node runtime
async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const str = Buffer.concat(chunks).toString();
  try { return JSON.parse(str || '{}'); } catch { return {}; }
}

export default async function handler(req, res) {
  try {
    if (!TOKEN) return res.status(500).json({ error: 'Missing BLOB_READ_WRITE_TOKEN' });

    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === 'GET') {
      const userId = url.searchParams.get('userId');
      if (!userId) return res.status(400).json({ error: 'Missing userId' });

      const path = `${BUCKET_PREFIX}${userId}.json`;
      const existing = await readJSON(path);
      const profile = existing ?? defaultProfile(userId);
      return res.status(200).json(profile);
    }

    if (req.method === 'POST') {
      const body = await readBody(req);
      const { userId, patch } = body || {};
      if (!userId) return res.status(400).json({ error: 'Missing userId' });

      const path = `${BUCKET_PREFIX}${userId}.json`;
      const current = (await readJSON(path)) ?? defaultProfile(userId);
      const next = {
        ...current,
        ...patch,
        userId,
        updatedAt: new Date().toISOString(),
        createdAt: current.createdAt ?? new Date().toISOString(),
      };

      await put(path, JSON.stringify(next, null, 2), {
        access: 'public',
        contentType: 'application/json',
        addRandomSuffix: false,
        token: TOKEN,
      });

      return res.status(200).json(next);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}
