// api/progress.js — Postgres (Neon) verze
export const config = { runtime: 'nodejs' };
import { getProgress, updateProgress } from './db.js';

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
      const prog = await getProgress(userId);
      return res.status(200).json(prog);
    }

    if (req.method === 'POST') {
      const { userId, mode, correct, item = null } = await readBody(req);
      if (!userId || !mode || typeof correct !== 'boolean') {
        return res.status(400).json({ error: 'Missing fields: userId, mode, correct' });
      }
      await updateProgress({ userId, mode, correct, item });
      const prog = await getProgress(userId); // vrátíme aktuální snapshot
      return res.status(200).json(prog);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}
