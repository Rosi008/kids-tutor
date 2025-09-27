// api/agent.js — AI agent s osobností a "pamětí" přes /api/profile a /api/progress
export const config = { runtime: 'edge' };

async function getJSON(url, init) {
  try {
    const r = await fetch(url, init);
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

function defaultProfile(userId) {
  return {
    userId,
    persona: 'Robot kamarád',
    likes: ['lego', 'fotbal'],
    goals: { dailyQuestions: 10 },
    notes: ''
  };
}

function pct(ok, seen) { return seen ? Math.round((100 * ok) / seen) : 0; }

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const { persona, message, history = [], userId = 'anon' } = (await req.json()) || {};
    if (!message) {
      return new Response(JSON.stringify({ error: 'Missing message' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }

    const origin = new URL(req.url).origin;

    // 1) Načti profil (osobnost, co má rád, cíle)
    const profile = (await getJSON(`${origin}/api/profile?userId=${encodeURIComponent(userId)}`)) || defaultProfile(userId);

    // 2) Načti pokrok (úspěšnost/streaky) – volitelné
    const progress = await getJSON(`${origin}/api/progress?userId=${encodeURIComponent(userId)}`);

    const tables = progress?.perMode?.tables || { seen: 0, ok: 0, streak: 0 };
    const vyjm   = progress?.perMode?.vyjmenovana || { seen: 0, ok: 0, streak: 0 };
    const en     = progress?.perMode?.en || { seen: 0, ok: 0, streak: 0 };

    const memoryLines = [];
    memoryLines.push(`Uživatel: ${userId}`);
    if (profile.likes?.length) memoryLines.push(`Co má rád: ${profile.likes.join(', ')}`);
    if (profile.goals?.dailyQuestions) memoryLines.push(`Denní cíl: ${profile.goals.dailyQuestions} otázek.`);
    memoryLines.push(`Úspěšnost: násobilka ${pct(tables.ok, tables.seen)}% (streak ${tables.streak}), vyjmenovaná ${pct(vyjm.ok, vyjm.seen)}% (streak ${vyjm.streak}), angličtina ${pct(en.ok, en.seen)}% (streak ${en.streak}).`);

    const systemPrompt = `
Jsi laskavý, hravý a motivující učitel-protějšek pro 10leté české dítě.
Persona: ${persona || profile.persona || 'Robot kamarád'} (drž lehký, pozitivní, bezpečný tón; žádný děsivý obsah).
Použij "Memory snapshot" níže k personalizaci (témata, co ho baví; denní cíl; obtížnost).
Pravidla:
- Ptej se vždy jen na JEDNU krátkou věc (max 2–3 věty).
- Piš česky; u angličtiny přidej jednoduché EN věty (A1–A2).
- Neprozrazuj hned řešení. Po 2 chybách dej nápovědu a pak vysvětli.
- Hodně chval; navrhuj další krok podle pokroku; připomeň denní cíl stručně.
`.trim();

    const memory = `Memory snapshot:\n${memoryLines.join('\n')}`;

    const msgs = [
      { role: 'system', content: systemPrompt },
      { role: 'system', content: memory },
      ...history.map(h => ({ role: h.role, content: h.content })),
      { role: 'user', content: message }
    ];

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.7,
        messages: msgs
      })
    });

    if (!r.ok) {
      const errText = await r.text();
      return new Response(JSON.stringify({ error: "Upstream error", detail: errText }), {
        status: r.status, headers: { 'Content-Type': 'application/json' }
      });
    }

    const data = await r.json();
    const reply = data?.choices?.[0]?.message?.content ?? "Promiň, něco se pokazilo. Zkus to ještě jednou.";

    // (Pozn.: aktualizaci /api/progress necháme na frontend, až bude jasné, zda odpověď byla správně/špatně.)
    return new Response(JSON.stringify({ reply }), { headers: { "Content-Type": "application/json" } });

  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
}
