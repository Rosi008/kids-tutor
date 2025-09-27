// api/agent.js — Edge funkce pro živého „AI agenta“ (chat)
export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
  }
  try {
    if (!process.env.OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: 'Missing OPENAI_API_KEY' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    const { persona = "přátelský průvodce", message, history = [] } = await req.json() || {};
    if (!message) {
      return new Response(JSON.stringify({ error: 'Missing message' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // Sestavíme kontext a roli agenta
    const systemPrompt = `
Jsi laskavý, hravý a motivující učitel-protějšek pro 10leté české dítě.
Persona: ${persona} (styl drž lehký, vtipný, bezpečný a věkově vhodný – žádný strašidelný obsah).
Cíl: procvičovat 1) násobilku (0–12), 2) vyjmenovaná slova (B,L,M,P,S,V,Z), 3) základní anglická slovíčka.
Pravidla:
- Ptej se vždy jen na JEDNU krátkou otázku najednou (max 2–3 věty).
- Piš česky (u angličtiny můžeš přidat jednoduché EN věty).
- Když dítě odpoví, zhodnoť velmi laskavě, krátce vysvětli, nabídni nápovědu nebo lehčí/pokročilejší úlohu podle úspěchu.
- Neprozrazuj hned řešení; když požádá o nápovědu nebo odpoví dvakrát špatně, dej tip a potom řešení.
- Hodně chval a gamifikuj (pochvaly, bodíky, mini-výzvy).
- Drž bezpečný a pozitivní tón, žádné osobní údaje nevyžaduj.
`;

    // Převedeme "history" [{role:'user'|'assistant', content:'...'}] na zprávy pro API
    const msgs = [
      { role: 'system', content: systemPrompt.trim() },
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
      return new Response(JSON.stringify({ error: "Upstream error", detail: errText }), { status: r.status, headers: { 'Content-Type': 'application/json' } });
    }

    const data = await r.json();
    const reply = data?.choices?.[0]?.message?.content ?? "Promiň, něco se pokazilo. Zkus to ještě jednou.";
    return new Response(JSON.stringify({ reply }), { headers: { "Content-Type": "application/json" } });

  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
