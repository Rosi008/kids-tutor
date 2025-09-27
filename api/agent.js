// api/agent.js — AI agent s osobností a "pamětí" přes /api/profile a /api/progress (Node runtime)
export const config = { runtime: 'nodejs' };

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const str = Buffer.concat(chunks).toString();
  try { return JSON.parse(str || '{}'); } catch { return {}; }
}

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
const pct = (ok, seen) => (seen ? Math.round((100 * ok) / seen) : 0);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = await readBody(req);
    const { persona, message, history = [], userId = 'anon' } = body || {};
    if (!message) return res.status(400).json({ error: 'Missing message' });

    const origin = new URL(req.url, `https://${req.headers.host}`).origin;

    // 1) Profil (osobnost, preference)
    const profile = (await getJSON(`${origin}/api/profile?userId=${encodeURIComponent(userId)}`)) || defaultProfile(userId);

    // 2) Pokrok (úspěšnost/streaky) – volitelné
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
      return res.status(r.status).json({ error: "Upstream error", detail: errText });
    }

    const data = await r.json();
    const reply = data?.choices?.[0]?.message?.content ?? "Promiň, něco se pokazilo. Zkus to ještě jednou.";
    return res.status(200).json({ reply });

  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}
