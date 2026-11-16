// Webhook del bot Telegram: riceve i messaggi, chiede a Claude e risponde.
// Risponde subito "ok" a Telegram e lavora dopo (context.waitUntil), così Telegram non rimanda i messaggi.

import { getStore } from "@netlify/blobs";
import { tg, webhookSecret, downloadFile, keepTyping, sendLong } from "../lib/telegram.mjs";
import { askClaude, tidy } from "../lib/claude.mjs";
import { PROFILO, STILE_TELEGRAM } from "../lib/profilo.mjs";

const MAX_STORICO = 40;

export default async (req, context) => {
  if (req.method !== "POST") return new Response("Bot attivo ✓");
  if (req.headers.get("x-telegram-bot-api-secret-token") !== (await webhookSecret())) {
    return new Response("Non autorizzato", { status: 401 });
  }
  const update = await req.json().catch(() => null);
  if (!update) return new Response("ok");

  const job = handleUpdate(update).catch((e) => console.error("Errore bot:", e));
  if (context?.waitUntil) context.waitUntil(job);
  else await job;
  return new Response("ok");
};

export const config = { path: "/api/telegram" };

/* ---------------------------------------------------------------- */

const store = () => getStore({ name: "assistente", consistency: "strong" });
const vuoto = () => ({ messages: [], notes: [] });

async function load(chatId) {
  return Object.assign(vuoto(), (await store().get(`chat-${chatId}`, { type: "json" })) || {});
}
async function save(chatId, state) {
  state.messages = state.messages.slice(-MAX_STORICO);
  await store().setJSON(`chat-${chatId}`, state);
}

function allowedIds() {
  return (process.env.TELEGRAM_ALLOWED_IDS || "").split(/[\s,;]+/).filter(Boolean);
}

async function handleUpdate(update) {
  const msg = update.message;
  if (!msg || !msg.chat || msg.from?.is_bot) return;
  const chatId = msg.chat.id;
  const userId = String(msg.from?.id ?? chatId);

  // --- Accesso: solo tu puoi usare il bot (e il tuo credito) ---
  const allowed = allowedIds();
  if (!allowed.length) {
    return tg("sendMessage", {
      chat_id: chatId,
      parse_mode: "HTML",
      text: `👋 Ciao, sono Sky!\n\nIl tuo ID Telegram è <code>${userId}</code>.\n\nPer attivarlo vai su Netlify → <b>Environment variables</b>, aggiungi <code>TELEGRAM_ALLOWED_IDS</code> con questo numero e rifai il deploy.`,
    });
  }
  if (!allowed.includes(userId)) {
    return tg("sendMessage", { chat_id: chatId, text: "🔒 Questo è un assistente privato." });
  }

  const text = (msg.text || msg.caption || "").trim();
  const state = await load(chatId);

  // --- Comandi ---
  const cmd = text.match(/^\/(\w+)(?:@\w+)?\s*([\s\S]*)$/);
  if (cmd) {
    const [, name, arg] = cmd;
    switch (name.toLowerCase()) {
      case "start":
      case "aiuto":
      case "help":
        return sendLong(chatId, AIUTO);
      case "nuova":
        state.messages = [];
        await save(chatId, state);
        return tg("sendMessage", { chat_id: chatId, text: "🧹 Nuova conversazione. Le cose che ti ho chiesto di ricordare restano." });
      case "ricorda":
        if (!arg.trim()) return tg("sendMessage", { chat_id: chatId, text: "Scrivi cosa ricordare, es: /ricorda il fornitore Comit consegna il martedì" });
        state.notes.push(arg.trim().slice(0, 500));
        await save(chatId, state);
        return tg("sendMessage", { chat_id: chatId, text: `🧠 Ricordato (${state.notes.length}).` });
      case "memoria":
        return sendLong(chatId, state.notes.length
          ? "🧠 **Cose che ricordo:**\n" + state.notes.map((n, i) => `${i + 1}. ${n}`).join("\n") + "\n\nPer toglierne una: /dimentica numero"
          : "Non ho ancora niente in memoria. Usa /ricorda seguito da qualcosa.");
      case "dimentica": {
        const a = arg.trim().toLowerCase();
        if (a === "tutto") state.notes = [];
        else {
          const n = parseInt(a, 10);
          if (!(n >= 1 && n <= state.notes.length)) return tg("sendMessage", { chat_id: chatId, text: "Usa /dimentica seguito dal numero (vedi /memoria) oppure /dimentica tutto" });
          state.notes.splice(n - 1, 1);
        }
        await save(chatId, state);
        return tg("sendMessage", { chat_id: chatId, text: "🗑️ Fatto." });
      }
      case "resoconto":
        return resoconto(chatId, state, arg.trim());
      case "id":
        return tg("sendMessage", { chat_id: chatId, parse_mode: "HTML", text: `Il tuo ID: <code>${userId}</code>` });
      default:
        return tg("sendMessage", { chat_id: chatId, text: "Comando sconosciuto. Scrivi /aiuto per la lista." });
    }
  }

  // --- Messaggio normale (testo, foto, inoltro da altro bot) ---
  const origin = forwardLabel(msg);
  const photo = msg.photo?.at(-1) || (msg.document?.mime_type?.startsWith("image/") ? msg.document : null);
  if (!text && !photo) {
    return tg("sendMessage", { chat_id: chatId, text: "Per ora capisco testo e foto. Messaggi vocali e altri file arriveranno più avanti." });
  }

  let testo = text || "Guarda questa foto e dimmi cosa ne pensi.";
  if (origin) testo = `[Messaggio inoltrato da ${origin}]\n"""\n${text}\n"""\nValutalo e dimmi cosa ne pensi, integrandolo con quello che sai.`;

  const stop = keepTyping(chatId);
  try {
    let content = testo;
    if (photo) {
      if ((photo.file_size || 0) > 5_000_000) throw new Error("La foto è troppo grande (max 5 MB).");
      const img = await downloadFile(photo.file_id);
      content = [
        { type: "image", source: { type: "base64", media_type: img.type, data: img.data } },
        { type: "text", text: testo },
      ];
    }
    const history = tidy(state.messages);
    const reply = await askClaude({ system: systemPrompt(state), messages: tidy([...history, { role: "user", content }]) });
    stop();
    await sendLong(chatId, reply);

    // nello storico la foto diventa una nota testuale, per non riempire la memoria
    state.messages.push({ role: "user", content: photo ? `[Foto] ${testo}` : testo });
    state.messages.push({ role: "assistant", content: reply });
    await save(chatId, state);
  } catch (e) {
    stop();
    await tg("sendMessage", { chat_id: chatId, text: "⚠️ " + e.message }).catch(() => {});
  }
}

function forwardLabel(msg) {
  const o = msg.forward_origin;
  if (!o) return null;
  if (o.type === "user") return [o.sender_user?.first_name, o.sender_user?.last_name].filter(Boolean).join(" ") + (o.sender_user?.is_bot ? " (bot)" : "");
  if (o.type === "hidden_user") return o.sender_user_name || "un utente";
  if (o.type === "chat" || o.type === "channel") return o.chat?.title || "un canale";
  return "un altro bot";
}

function systemPrompt(state) {
  const oggi = new Date().toLocaleString("it-IT", { timeZone: "Atlantic/Canary", weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
  let s = `${PROFILO}\n\n${STILE_TELEGRAM}\n\nAdesso è ${oggi} (ora delle Canarie).`;
  if (state.notes.length) s += `\n\nCose che mi hai chiesto di ricordare:\n${state.notes.map((n) => "- " + n).join("\n")}`;
  return s;
}

async function resoconto(chatId, state, perChi) {
  if (!state.messages.length) return tg("sendMessage", { chat_id: chatId, text: "La conversazione è vuota: non c'è niente da riassumere." });
  const stop = keepTyping(chatId);
  try {
    const trascrizione = state.messages.map((m) => `${m.role === "user" ? "Io" : "Assistente"}: ${m.content}`).join("\n\n").slice(-60000);
    const testo = await askClaude({
      system: PROFILO,
      messages: [{
        role: "user",
        content: `Ecco una conversazione tra me e te:\n"""\n${trascrizione}\n"""\n\nScrivi un RESOCONTO da incollare a un altro assistente AI${perChi ? ` (${perChi})` : " (Grok o Cursor)"} che non ha visto questa chat.\nUsa queste sezioni, brevi: Contesto / Cosa abbiamo deciso / Punti aperti / Cosa chiedo a te.\nScrivi in italiano, testo semplice senza markdown, senza preamboli.`,
      }],
    });
    stop();
    await tg("sendMessage", { chat_id: chatId, text: "📋 Resoconto pronto: tieni premuto il messaggio qui sotto → Inoltra o Copia, e mandalo all'altro bot." });
    for (const piece of testo.match(/[\s\S]{1,4000}/g)) await tg("sendMessage", { chat_id: chatId, text: piece });
  } catch (e) {
    stop();
    await tg("sendMessage", { chat_id: chatId, text: "⚠️ " + e.message }).catch(() => {});
  }
}

const AIUTO = `Ciao! Sono Sky, il tuo assistente 🤖

Scrivimi quello che vuoi, oppure mandami una **foto** (bolla, pianta, schermata…).

**Comandi**
- /nuova — ricomincia la conversazione
- /ricorda testo — salva una cosa per sempre
- /memoria — cosa ricordo
- /dimentica numero — cancella un ricordo
- /resoconto — riassunto da mandare a Grok o Cursor
- /id — il tuo ID Telegram

**Con Grok o altri bot**
Inoltrami un loro messaggio (tieni premuto → Inoltra): lo valuto e lo unisco a quello che sappiamo. Con /resoconto preparo io il messaggio da mandare a loro.`;
