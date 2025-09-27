// api/generate.js
export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
  }
  try {
    const { mode, prompt } = await req.json();
    if (!process.env.OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: 'Missing OPENAI_API_KEY' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
    if (!prompt) {
      return new Response(JSON.stringify({ error: 'Missing prompt' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const sys = "You are a kind primary-school tutor for a 10-year-old Czech kid. Keep answers short, clear, and age-appropriate. Czech UI, simple CEFR A1-A2 English.";
    const user = mode === 'en-vocab'
      ? `Vytvoř JSON se 5 položkami: [{"cz":"...", "en":"...", "example":"krátká anglická věta s tímto slovem, A1-A2", "distractors":["...","..."]}]. Téma: ${prompt}.`
      : prompt;

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.3,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user }
        ]
      })
    });

    if (!r.ok) {
      const errText = await r.text();
      return new Response(JSON.stringify({ error: "Upstream error", detail: errText }), { status: r.status, headers: { 'Content-Type': 'application/json' } });
    }
    const data = await r.json();
    const text = data?.choices?.[0]?.message?.content ?? "";
    return new Response(JSON.stringify({ text }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
