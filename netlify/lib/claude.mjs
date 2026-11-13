// Chiamata all'API di Claude, condivisa dalle funzioni.

export async function askClaude({ system, messages, maxTokens = 2048 }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Manca ANTHROPIC_API_KEY nelle variabili di Netlify.");
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.CLAUDE_MODEL || "claude-sonnet-5-5",
      max_tokens: maxTokens,
      system,
      messages,
    }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error?.message || `Errore API Claude (${r.status})`);
  return (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim() || "(risposta vuota)";
}

// Ultimi messaggi, ruoli alternati, si parte sempre dall'utente.
export function tidy(list, keep = 30) {
  const out = [];
  for (const m of list.slice(-keep)) {
    if (!m?.content || (m.role !== "user" && m.role !== "assistant")) continue;
    const last = out[out.length - 1];
    if (last && last.role === m.role && typeof last.content === "string" && typeof m.content === "string") {
      last.content += "\n\n" + m.content;
    } else out.push({ role: m.role, content: m.content });
  }
  while (out.length && out[0].role !== "user") out.shift();
  return out;
}
