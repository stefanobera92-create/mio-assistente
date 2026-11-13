// Funzione serverless: riceve la chat dal sito e la inoltra a Claude.
// La chiave API resta qui sul server (variabile d'ambiente su Netlify), mai nel browser.

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Metodo non consentito" }, 405);

  const password = process.env.BOT_PASSWORD;
  if (password && req.headers.get("x-bot-password") !== password) {
    return json({ error: "Password errata. Controlla le Impostazioni." }, 401);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return json({ error: "Manca ANTHROPIC_API_KEY nelle variabili di Netlify." }, 500);

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Richiesta non valida" }, 400);
  }

  const messages = cleanMessages(body.messages);
  if (!messages.length) return json({ error: "Nessun messaggio da inviare" }, 400);

  const system = String(body.system || "").slice(0, 8000);
  const model = process.env.CLAUDE_MODEL || "claude-sonnet-5-5";

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({ model, max_tokens: 2048, system, messages }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return json({ error: data?.error?.message || `Errore API (${r.status})` }, r.status);

    const text = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    return json({ text: text || "(risposta vuota)", usage: data.usage });
  } catch (e) {
    return json({ error: "Impossibile contattare Claude: " + e.message }, 502);
  }
};

export const config = { path: "/api/chat" };

// Tiene solo gli ultimi messaggi, unisce i turni consecutivi dello stesso ruolo
// e fa sì che la conversazione inizi sempre con l'utente.
function cleanMessages(list) {
  const out = [];
  for (const m of Array.isArray(list) ? list.slice(-40) : []) {
    const role = m?.role === "assistant" ? "assistant" : m?.role === "user" ? "user" : null;
    const content = typeof m?.content === "string" ? m.content.slice(0, 20000).trim() : "";
    if (!role || !content) continue;
    const last = out[out.length - 1];
    if (last && last.role === role) last.content += "\n\n" + content;
    else out.push({ role, content });
  }
  while (out.length && out[0].role !== "user") out.shift();
  return out;
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
