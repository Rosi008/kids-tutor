// api/generate.js — Node runtime (AI pomocník pro slovíčka)
export const config = { runtime: 'nodejs' };

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const str = Buffer.concat(chunks).toString();
  try { return JSON.parse(str || '{}'); } catch { return {}; }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const body = await readBody(req);
    const { mode, prompt, words } = body || {};
    if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error: 'Missing OPENAI_API_KEY' });

    const sys = "You are a kind primary-school tutor for a 10-year-old Czech kid. Keep answers short, clear, and age-appropriate. Czech UI, simple CEFR A1-A2 English.";

    let user;
    if (Array.isArray(words) && words.length) {
      user = `Vytvoř JSON pole položek pro TATO přesná anglická slova (NEPŘIDÁVEJ jiná): ${words.join(", ")}. Každá položka má tvar {"cz":"...", "en":"...", "example":"krátká anglická věta s tímto slovem (A1-A2)", "distractors":["...","..."]}. Odpověz pouze JSONem bez textu navíc.`;
    } else if (mode === 'en-vocab') {
      user = `Vytvoř JSON se 5 položkami: [{"cz":"...", "en":"...", "example":"krátká anglická věta s tímto slovem, A1-A2", "distractors":["...","..."]}]. Téma: ${prompt||'basic'}. Bez textu navíc.`;
    } else {
      user = prompt || 'Vytvoř jednoduchá cvičení.';
    }

    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.3,
        messages: [{ role: 'system', content: sys }, { role: 'user', content: user }]
      })
    });

    if (!r.ok) {
      const errText = await r.text();
      return res.status(r.status).json({ error: 'Upstream error', detail: errText });
    }
    const data = await r.json();
    const text = data?.choices?.[0]?.message?.content ?? '';
    return res.status(200).json({ text });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}
