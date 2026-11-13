// Piccolo client per la Bot API di Telegram.

const api = (method) => `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`;

export async function tg(method, payload = {}) {
  const r = await fetch(api(method), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await r.json().catch(() => ({ ok: false, description: `HTTP ${r.status}` }));
  if (!data.ok) throw new Error(`Telegram ${method}: ${data.description}`);
  return data.result;
}

// Segreto per il webhook ricavato dal token: così non serve un'altra variabile.
export async function webhookSecret() {
  const bytes = new TextEncoder().encode("assistente:" + process.env.TELEGRAM_BOT_TOKEN);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 48);
}

// Scarica un file (es. una foto) e lo restituisce in base64.
export async function downloadFile(fileId) {
  const f = await tg("getFile", { file_id: fileId });
  const r = await fetch(`https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${f.file_path}`);
  if (!r.ok) throw new Error("Download foto non riuscito");
  const buf = Buffer.from(await r.arrayBuffer());
  const ext = (f.file_path.split(".").pop() || "").toLowerCase();
  const type = { png: "image/png", webp: "image/webp", gif: "image/gif" }[ext] || "image/jpeg";
  return { data: buf.toString("base64"), type };
}

// Mantiene "sta scrivendo…" attivo finché Claude lavora.
export function keepTyping(chatId) {
  const send = () => tg("sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => {});
  send();
  const t = setInterval(send, 4500);
  return () => clearInterval(t);
}

/* ---------- Markdown di Claude -> HTML di Telegram ---------- */

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function inline(s) {
  const codes = [];
  s = s.replace(/`([^`\n]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`);
  s = esc(s)
    .replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>")
    .replace(/__([^_\n]+)__/g, "<b>$1</b>")
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,;:!?]|$)/g, "$1<i>$2</i>")
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, t, u) => `<a href="${u.replace(/"/g, "&quot;")}">${t}</a>`);
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${esc(codes[i])}</code>`);
}

export function toTelegramHtml(md) {
  const parts = md.split(/```[\w+-]*\n?([\s\S]*?)```/g);
  return parts
    .map((part, i) => {
      if (i % 2) return `<pre>${esc(part.replace(/\n$/, ""))}</pre>`;
      return part
        .split("\n")
        .map((line) => {
          let m;
          if ((m = line.match(/^#{1,6}\s+(.*)/))) return `<b>${inline(m[1])}</b>`;
          if ((m = line.match(/^(\s*)[-*•]\s+(.*)/))) return `${m[1]}• ${inline(m[2])}`;
          if (/^\s*([-*_])\1{2,}\s*$/.test(line)) return "";
          return inline(line);
        })
        .join("\n");
    })
    .join("");
}

// Divide i testi lunghi (Telegram accetta max 4096 caratteri) senza spezzare i blocchi di codice.
export function splitMessage(text, max = 3500) {
  const chunks = [];
  let rest = text.trim();
  while (rest.length > max) {
    let cut = rest.lastIndexOf("\n\n", max);
    if (cut < max * 0.4) cut = rest.lastIndexOf("\n", max);
    if (cut < max * 0.4) cut = rest.lastIndexOf(" ", max);
    if (cut <= 0) cut = max;
    let piece = rest.slice(0, cut);
    // se il pezzo lascia un blocco ``` aperto, lo chiude e lo riapre nel pezzo dopo
    const open = (piece.match(/```/g) || []).length % 2 === 1;
    rest = rest.slice(cut).trim();
    if (open) { piece += "\n```"; rest = "```\n" + rest; }
    chunks.push(piece);
  }
  if (rest) chunks.push(rest);
  return chunks;
}

export async function sendLong(chatId, markdown, extra = {}) {
  for (const piece of splitMessage(markdown)) {
    try {
      await tg("sendMessage", { chat_id: chatId, text: toTelegramHtml(piece), parse_mode: "HTML", link_preview_options: { is_disabled: true }, ...extra });
    } catch {
      // se l'HTML non piace a Telegram, manda il testo semplice
      await tg("sendMessage", { chat_id: chatId, text: piece, link_preview_options: { is_disabled: true }, ...extra });
    }
  }
}
