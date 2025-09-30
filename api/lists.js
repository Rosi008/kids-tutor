// api/lists.js — čtení/psaní data/vyjmenovana.json a data/english_words.json
export const config = { runtime: 'nodejs' };
import { put, list } from '@vercel/blob';
const TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

const PATH_VYJM = 'data/vyjmenovana.json';
const PATH_EN = 'data/english_words.json';

const DEFAULT_VYJM = {
  "B":["být","bydlet","byt","přibýt","ubýt","nábytek","obyvatel","kobyla","babyka","bytost","bylinka"],
  "L":["lyže","lyžovat","pelyněk","plyn","plýtvat","slyšet","lysý","lyra","literatura"],
  "M":["my","mýt","mýlit se","hmyz","myš","myčka","mykat","dumy","mýdlo"],
  "P":["pytel","pysk","pyl","pýcha","netopýr","pýřit se","kopyto","slipy","pýr","pylový"],
  "S":["syn","sytý","sýr","syrový","syčet","sysel","sypat","osyka","kyselina"],
  "V":["vysoký","výlet","vyžle","výskat","vyvíjet","vyjít","vyjmenovat","výjimka","vyžít"],
  "Z":["brzy","jazyk","pozor","ozývat se","nazývat","různý","cizí","rezivět","nezvyk"]
};
const DEFAULT_EN = { id: "default", title: "English words (admin edits)", words: ["apple","banana","school","book","friend"] };

async function getBlobUrl(path){ const {blobs}=await list({prefix:path,token:TOKEN}); return blobs?.find(b=>b.pathname===path)?.url||null; }
async function readJSON(path,fallback){ const u=await getBlobUrl(path); if(!u) return fallback; const r=await fetch(u); if(!r.ok) return fallback; try{ return await r.json(); }catch{ return fallback; } }
async function readBody(req){ const chunks=[]; for await (const c of req) chunks.push(c); const s=Buffer.concat(chunks).toString(); try{ return JSON.parse(s||'{}'); }catch{ return {}; } }
function isAdmin(req){ const t=req.headers['x-admin-token']||req.headers['X-Admin-Token']; return process.env.ADMIN_TOKEN && t===process.env.ADMIN_TOKEN; }

export default async function handler(req,res){
  if(!TOKEN) return res.status(500).json({error:'Missing BLOB_READ_WRITE_TOKEN'});

  const url = new URL(req.url, `https://${req.headers.host}`);
  if(req.method==='GET'){
    const type = url.searchParams.get('type') || 'vyjmenovana';
    if(type==='vyjmenovana'){ const data = await readJSON(PATH_VYJM, DEFAULT_VYJM); return res.status(200).json(data); }
    if(type==='english_words'){ const data = await readJSON(PATH_EN, DEFAULT_EN); return res.status(200).json(data); }
    return res.status(400).json({error:'Unknown type'});
  }

  if(req.method==='POST'){
    if(!isAdmin(req)) return res.status(401).json({error:'Unauthorized'});
    const body = await readBody(req);
    const { type, data } = body || {};
    if(type==='vyjmenovana'){
      await put(PATH_VYJM, JSON.stringify(data ?? DEFAULT_VYJM, null, 2), { access:'public', contentType:'application/json', addRandomSuffix:false, token:TOKEN });
      const out = await readJSON(PATH_VYJM, DEFAULT_VYJM);
      return res.status(200).json(out);
    }
    if(type==='english_words'){
      await put(PATH_EN, JSON.stringify(data ?? DEFAULT_EN, null, 2), { access:'public', contentType:'application/json', addRandomSuffix:false, token:TOKEN });
      const out = await readJSON(PATH_EN, DEFAULT_EN);
      return res.status(200).json(out);
    }
    return res.status(400).json({error:'Unknown type'});
  }

  return res.status(405).json({error:'Method not allowed'});
}
