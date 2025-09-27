// api/progress.js — Node runtime (Vercel Blob pro uložení pokroku)
export const config = { runtime: 'nodejs' };
import { put, list } from '@vercel/blob';

const TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const PREFIX = 'progress/';

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const str = Buffer.concat(chunks).toString();
  try { return JSON.parse(str || '{}'); } catch { return {}; }
}

async function readJSON(path) {
  const { blobs } = await list({ prefix: path, token: TOKEN });
  const hit = blobs?.find(b => b.pathname === path);
  if (!hit) return null;
  const r = await fetch(hit.url);
  if (!r.ok) return null;
  return await r.json();
}

function today() {
  const d = new Date();
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

export default async function handler(req, res) {
  if (!TOKEN) return res.status(500).json({ error: 'Missing BLOB_READ_WRITE_TOKEN' });

  try {
    const url = new URL(req.url, `https://${req.headers.host}`);

    if (req.method === 'GET') {
      const userId = url.searchParams.get('userId');
      if (!userId) return res.status(400).json({ error: 'Missing userId' });

      const path = `${PREFIX}${userId}.json`;
      const data = (await readJSON(path)) ?? {
        userId,
        totals: { seen: 0, ok: 0 },
        perMode: { tables:{seen:0,ok:0,streak:0}, vyjmenovana:{seen:0,ok:0,streak:0}, en:{seen:0,ok:0,streak:0} },
        daily: {},
        lastItems: []
      };
      return res.status(200).json(data);
    }

    if (req.method === 'POST') {
      const body = await readBody(req);
      const { userId, mode, correct, item } = body || {};
      if (!userId || !mode || typeof correct !== 'boolean') {
        return res.status(400).json({ error: 'Missing fields: userId, mode, correct' });
      }

      const path = `${PREFIX}${userId}.json`;
      const curr = (await readJSON(path)) ?? {
        userId,
        totals: { seen: 0, ok: 0 },
        perMode: { tables:{seen:0,ok:0,streak:0}, vyjmenovana:{seen:0,ok:0,streak:0}, en:{seen:0,ok:0,streak:0} },
        daily: {},
        lastItems: []
      };

      // totals
      curr.totals.seen += 1;
      if (correct) curr.totals.ok += 1;

      // per mode
      const m = curr.perMode[mode] || (curr.perMode[mode] = { seen:0, ok:0, streak:0 });
      m.seen += 1;
      if (correct) { m.ok += 1; m.streak += 1; } else { m.streak = 0; }

      // daily
      const d = today();
      const day = curr.daily[d] || (curr.daily[d] = { seen:0, ok:0 });
      day.seen += 1; if (correct) day.ok += 1;

      // ring buffer posledních 20
      curr.lastItems.push({ mode, item: item ?? null, ok: correct, ts: Date.now() });
      if (curr.lastItems.length > 20) curr.lastItems.shift();

      curr.updatedAt = new Date().toISOString();
      if (!curr.createdAt) curr.createdAt = curr.updatedAt;

      await put(path, JSON.stringify(curr, null, 2), {
        access: 'public',
        contentType: 'application/json',
        addRandomSuffix: false,
        token: TOKEN
      });

      return res.status(200).json(curr);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}
