// api/agent.js — AI agent s externí konfigurací a Chroma pamětí (Node runtime)
export const config = { runtime: 'nodejs' };

async function readBody(req){ const chunks=[]; for await (const c of req) chunks.push(c); const s=Buffer.concat(chunks).toString(); try{return JSON.parse(s||'{}')}catch{return{}} }
async function getJSON(url, init){ try{ const r=await fetch(url,init); if(!r.ok) return null; return await r.json(); }catch{return null} }

function fillTemplate(md, ctx){
  return md
    .replace(/{{\s*persona\s*}}/g, ctx.persona||'Tutor')
    .replace(/{{\s*likes\s*}}/g, (ctx.likes||[]).join(', ') || 'spoustu věcí')
    .replace(/{{\s*dailyGoal\s*}}/g, String(ctx.dailyGoal||10));
}
const pct=(ok,seen)=>seen?Math.round(100*ok/seen):0;

export default async function handler(req, res){
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});

  try{
    const body = await readBody(req);
    const { persona, message, history=[], userId='anon' } = body || {};
    if(!message) return res.status(400).json({error:'Missing message'});

    const origin = new URL(req.url, `https://${req.headers.host}`).origin;

    // 1) Config (agent.md/json)
    const cfg = await getJSON(`${origin}/api/config`);
    const agentMd = cfg?.md || '';
    const agentJs = cfg?.json || { model:'gpt-4o-mini', temperature:0.7 };

    // 2) Profil & pokrok
    const profile = await getJSON(`${origin}/api/profile?userId=${encodeURIComponent(userId)}`) || {};
    const progress = await getJSON(`${origin}/api/progress?userId=${encodeURIComponent(userId)}`) || {};
    const tables = progress?.perMode?.tables || { seen:0, ok:0, streak:0 };
    const vyjm   = progress?.perMode?.vyjmenovana || { seen:0, ok:0, streak:0 };
    const en     = progress?.perMode?.en || { seen:0, ok:0, streak:0 };

    const sysFromMd = fillTemplate(agentMd, {
      persona: persona || profile.persona || 'Robot kamarád',
      likes: profile.likes || [],
      dailyGoal: profile?.goals?.dailyQuestions || 10
    });

    const memorySnapshot = [
      `Úspěšnost: násobilka ${pct(tables.ok,tables.seen)}% (streak ${tables.streak}),`,
      `vyjmenovaná ${pct(vyjm.ok,vyjm.seen)}% (streak ${vyjm.streak}),`,
      `angličtina ${pct(en.ok,en.seen)}% (streak ${en.streak}).`
    ].join(' ');

    // 3) Chroma – dotaz na „vzpomínky“ k aktuálnímu vstupu
    let chroma = null;
    try{
      const r = await fetch(`${origin}/api/memory?action=query`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ text: message, n: 5 })
      });
      chroma = await r.json();
    }catch{}

    const relevant = (chroma?.results||[]).map((r,i)=>`#${i+1}: ${r.document} [${r.metadata?.namespace||''}]`).join('\n');

    const sys = [
      sysFromMd,
      '',
      '--- Kontext paměti ---',
      memorySnapshot,
      relevant ? `\nRelevantní vzpomínky:\n${relevant}` : ''
    ].join('\n');

    const msgs = [
      { role:'system', content: sys },
      ...history.map(h=>({ role:h.role, content:h.content })),
      { role:'user', content: message }
    ];

    const resp = await fetch('https://api.openai.com/v1/chat/completions',{
      method:'POST',
      headers:{ 'Authorization':`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json' },
      body: JSON.stringify({ model: agentJs.model || 'gpt-4o-mini', temperature: agentJs.temperature ?? 0.7, messages: msgs })
    });

    if(!resp.ok){
      const errText = await resp.text();
      return res.status(resp.status).json({ error:'Upstream error', detail: errText });
    }
    const data = await resp.json();
    const reply = data?.choices?.[0]?.message?.content ?? 'Promiň, něco se pokazilo.';
    return res.status(200).json({ reply });
  }catch(e){
    return res.status(500).json({ error: String(e) });
  }
}
