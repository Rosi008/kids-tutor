// api/profile.js — Postgres (Neon) verze
export const config = { runtime: 'nodejs' };
import { getProfile, upsertProfile } from './db.js';

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const s = Buffer.concat(chunks).toString();
  try { return JSON.parse(s || '{}'); } catch { return {}; }
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const url = new URL(req.url, `https://${req.headers.host}`);
      const userId = url.searchParams.get('userId');
      if (!userId) return res.status(400).json({ error: 'Missing userId' });
      const profile = await getProfile(userId);
      return res.status(200).json(profile);
    }

    if (req.method === 'POST') {
      const { userId, patch } = await readBody(req);
      if (!userId) return res.status(400).json({ error: 'Missing userId' });
      const next = await upsertProfile(userId, patch || {});
      return res.status(200).json(next);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}
