// api/config.js — správa config/agent.md a config/agent.json (Node runtime + Vercel Blob)
export const config = { runtime: 'nodejs' };
import { put, list } from '@vercel/blob';

const TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const PATH_MD = 'config/agent.md';
const PATH_JSON = 'config/agent.json';

const DEFAULT_MD = `Jsi laskavý a hravý tutor pro 10leté dítě.
Mluv česky, osobnost: {{persona}}. Má rád: {{likes}}.
Denní cíl: {{dailyGoal}} otázek.
Pravidla: ptej se po jedné věci; chval; po 2 chybách nápověda.`;

const DEFAULT_JSON = {
  model: "gpt-4o-mini",
  temperature: 0.7,
  evaluation: { enableMeta: true, modes: ["tables","vyjmenovana","en"] },
  specializations: ["násobilka","vyjmenovaná slova","angličtina (A1–A2)"]
};

async function getBlobUrl(path) {
  const { blobs } = await list({ prefix: path, token: TOKEN });
  return blobs?.find(b => b.pathname === path)?.url || null;
}
async function readText(path, fallback) {
  const url = await getBlobUrl(path); if (!url) return fallback;
  const r = await fetch(url); return r.ok ? await r.text() : fallback;
}
async function readJSON(path, fallback) {
  const url = await getBlobUrl(path); if (!url) return fallback;
  const r = await fetch(url); if (!r.ok) return fallback;
  try { return await r.json(); } catch { return fallback; }
}
async function readBody(req) {
  const chunks=[]; for await (const c of req) chunks.push(c);
  const s = Buffer.concat(chunks).toString();
  try { return JSON.parse(s || '{}'); } catch { return {}; }
}
function isAdmin(req){
  const t = req.headers['x-admin-token'] || req.headers['X-Admin-Token'];
  return process.env.ADMIN_TOKEN && t === process.env.ADMIN_TOKEN;
}

export default async function handler(req, res) {
  if (!TOKEN) return res.status(500).json({ error: 'Missing BLOB_READ_WRITE_TOKEN' });

  if (req.method === 'GET') {
    const md = await readText(PATH_MD, DEFAULT_MD);
    const js = await readJSON(PATH_JSON, DEFAULT_JSON);
    return res.status(200).json({ md, json: js });
  }

  if (req.method === 'POST') {
    if (!isAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });
    const { md, json } = await readBody(req);
    if (typeof md === 'string') {
      await put(PATH_MD, md, { access:'public', contentType:'text/markdown', addRandomSuffix:false, token: TOKEN });
    }
    if (json && typeof json === 'object') {
      await put(PATH_JSON, JSON.stringify(json, null, 2), { access:'public', contentType:'application/json', addRandomSuffix:false, token: TOKEN });
    }
    const outMd = await readText(PATH_MD, DEFAULT_MD);
    const outJs = await readJSON(PATH_JSON, DEFAULT_JSON);
    return res.status(200).json({ md: outMd, json: outJs });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
