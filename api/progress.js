// api/progress.js — jednoduché uložení pokroku (totály + per mód) do Vercel Blob
export const config = { runtime: 'edge' };
import { put, list } from '@vercel/blob';

const TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const PREFIX = 'progress/';

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
  return d.toISOString().slice(0,10); // YYYY-MM-DD
}

export default async function handler(req) {
  if (!TOKEN) {
    return new Response(JSON.stringify({ error: 'Missing BLOB_READ_WRITE_TOKEN' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    const url = new URL(req.url);
    if (req.method === 'GET') {
      const userId = url.searchParams.get('userId');
      if (!userId) return new Response(JSON.stringify({ error: 'Missing userId' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

      const path = `${PREFIX}${userId}.json`;
      const data = (await readJSON(path)) ?? {
        userId,
        totals: { seen: 0, ok: 0 },
        perMode: { tables:{seen:0,ok:0,streak:0}, vyjmenovana:{seen:0,ok:0,streak:0}, en:{seen:0,ok:0,streak:0} },
        daily: {}, // { YYYY-MM-DD: { seen, ok } }
        lastItems: [] // posledních pár úloh {mode,item,ok,ts}
      };
      return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
    }

    if (req.method === 'POST') {
      const body = await req.json();
      const { userId, mode, correct, item } = body || {};
      if (!userId || !mode || typeof correct !== 'boolean') {
        return new Response(JSON.stringify({ error: 'Missing fields: userId, mode, correct' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }

      const path = `${PREFIX}${userId}.json`;
      const curr = (await readJSON(path)) ?? {
        userId,
        totals: { seen: 0, ok: 0 },
        perMode: { tables:{seen:0,ok:0,streak:0}, vyjmenovana:{seen:0,ok:0,streak:0}, en:{seen:0,ok:0,streak:0} },
        daily: {},
        lastItems: []
      };

      // update totals
      curr.totals.seen += 1;
      if (correct) curr.totals.ok += 1;

      // update per mode
      const m = curr.perMode[mode] || (curr.perMode[mode] = { seen:0, ok:0, streak:0 });
      m.seen += 1;
      if (correct) { m.ok += 1; m.streak += 1; } else { m.streak = 0; }

      // update daily
      const d = today();
      const day = curr.daily[d] || (curr.daily[d] = { seen:0, ok:0 });
      day.seen += 1; if (correct) day.ok += 1;

      // ring buffer posledních 20 položek
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

      return new Response(JSON.stringify(curr), { headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
