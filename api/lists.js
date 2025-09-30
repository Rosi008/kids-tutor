
// /api/lists.js — zjednodušený POST: uloží vyjmenovaná a english, doplní chybějící cs a (volitelně) upsert do Chroma.
// GET vrací aktuální listy z Blobu.

import { put, list } from '@vercel/blob';
import OpenAI from 'openai';

const BLOB_RW = process.env.BLOB_READ_WRITE_TOKEN;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
const CHROMA_URL = process.env.CHROMA_URL || '';
const CHROMA_COLLECTION = process.env.CHROMA_COLLECTION || 'kids-tutor-memory';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const data = await readListsFromBlob();
      return res.status(200).json(data);
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

    if (!ADMIN_TOKEN) return res.status(500).json({ error: 'missing_ADMIN_TOKEN' });
    const token = req.headers['x-admin-token'];
    if (token !== ADMIN_TOKEN) return res.status(403).json({ error: 'forbidden' });

    const body = await readJson(req);
    const vyjmenovana = Array.isArray(body.vyjmenovana) ? body.vyjmenovana.map(String) : [];
    const englishIn = Array.isArray(body.english) ? body.english : [];

    // 1) Enrichment: doplň cs, pokud chybí
    const needEnrichment = englishIn.some(x => !x || !x.cs);
    const english = needEnrichment ? await enrichEnglish(englishIn) : englishIn;

    // 2) Ulož do Blobu (fixní cesty)
    await saveJsonToBlob('data/vyjmenovana.json', vyjmenovana);
    await saveJsonToBlob('data/english_words.json', english);

    // 3) Volitelně: push do Chroma (best-effort)
    let chromaUpserted = 0;
    if (CHROMA_URL) {
      try { chromaUpserted = await upsertEnglishToChroma(english); } catch (e) { console.warn('Chroma upsert failed:', e.message); }
    }

    return res.status(200).json({ ok: true, counts: { vyjmenovana: vyjmenovana.length, english: english.length }, enriched: needEnrichment, chromaUpserted });
  } catch (e) {
    console.error('lists handler error', e);
    return res.status(500).json({ error: 'internal_error', message: e.message });
  }
}

async function readJson(req) {
  const chunks = [];
  for await (const ch of req) chunks.push(ch);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

async function readListsFromBlob() {
  // Najdi poslední verze souborů, když neexistují, vrať default
  try {
    const files = await list({ token: BLOB_RW, prefix: 'data/' });
    const vyj = files.blobs?.find(b => b.pathname.endsWith('vyjmenovana.json'));
    const en  = files.blobs?.find(b => b.pathname.endsWith('english_words.json'));
    const vyjData = vyj ? await (await fetch(vyj.url)).json() : ["být","bydlet","myslivec","obyvatel"];
    const enData  = en  ? await (await fetch(en.url)).json()  : [{ en: 'cat', cs: 'kočka' }, { en: 'dog', cs: 'pes' }];
    return { vyjmenovana: vyjData, english: enData };
  } catch {
    return { vyjmenovana: ["být","bydlet","myslivec","obyvatel"], english: [{ en: 'cat', cs: 'kočka' }, { en: 'dog', cs: 'pes' }] };
  }
}

async function saveJsonToBlob(pathname, obj) {
  if (!BLOB_RW) throw new Error('Missing BLOB_READ_WRITE_TOKEN');
  const json = JSON.stringify(obj, null, 2);
  await put(pathname, json, { access: 'public', contentType: 'application/json', token: BLOB_RW, addRandomSuffix: false });
}

async function enrichEnglish(list) {
  if (!OPENAI_API_KEY) return list; // bez klíče neobohacujeme
  const client = new OpenAI({ apiKey: OPENAI_API_KEY });
  const out = [];
  for (const item of list) {
    const en = (item && item.en) ? String(item.en) : '';
    if (!en) continue;
    if (item.cs) { out.push({ en, cs: String(item.cs) }); continue; }
    const prompt = `Přelož anglické slovo do češtiny, jedním slovem nebo nejkratším možným výrazem. Slovo: "${en}". Vrať jen holý překlad bez poznámek.`;
    try {
      const resp = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'system', content: 'Jsi překladač EN→CS. Odpovídej jedním slovem nebo nejkratším výrazem.' }, { role: 'user', content: prompt }],
        temperature: 0
      });
      const cs = (resp.choices?.[0]?.message?.content || '').trim();
      out.push({ en, cs: cs || en });
    } catch (e) {
      console.warn('translate fail', en, e.message);
      out.push({ en, cs: item.cs || en });
    }
  }
  return out;
}

async function upsertEnglishToChroma(list) {
  if (!OPENAI_API_KEY || !CHROMA_URL) return 0;
  // 1) embeddings
  const client = new OpenAI({ apiKey: OPENAI_API_KEY });
  const texts = list.map(w => w.en);
  const emb = await client.embeddings.create({ model: 'text-embedding-3-small', input: texts });
  const vectors = emb.data.map(d => d.embedding);

  // 2) get/create collection
  const col = await getOrCreateChromaCollection(CHROMA_COLLECTION);
  const ids = list.map(w => `en:${w.en}`);
  const documents = list.map(w => w.en);
  const metadatas = list.map(w => ({ cs: w.cs || null, source: 'lists' }));

  // 3) upsert
  const upsertUrl = `${CHROMA_URL.replace(/\/$/,'')}/api/v1/collections/${encodeURIComponent(col.id)}/upsert`;
  const r = await fetch(upsertUrl, { method: 'POST', headers: { 'content-type':'application/json' }, body: JSON.stringify({ ids, embeddings: vectors, documents, metadatas }) });
  if (!r.ok) throw new Error('Chroma upsert HTTP '+r.status);
  return ids.length;
}

async function getOrCreateChromaCollection(name) {
  const base = CHROMA_URL.replace(/\/$/,'') + '/api/v1/collections';
  // try get
  const g = await fetch(base + '/' + encodeURIComponent(name));
  if (g.ok) return await g.json();
  // create
  const c = await fetch(base, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ name }) });
  if (!c.ok) throw new Error('Chroma create HTTP '+c.status);
  return await c.json();
}

