// Collega il bot Telegram a questo sito. Si apre una volta dal browser:
//   https://TUO-SITO.netlify.app/api/telegram-setup?password=LA_TUA_BOT_PASSWORD

import { tg, webhookSecret } from "../lib/telegram.mjs";

export default async (req) => {
  const url = new URL(req.url);
  const password = process.env.BOT_PASSWORD;
  if (!password) return page("⚠️ Manca BOT_PASSWORD", "Aggiungi la variabile BOT_PASSWORD su Netlify e rifai il deploy.");
  if (url.searchParams.get("password") !== password) {
    return page("🔒 Password mancante o errata", "Apri questo indirizzo aggiungendo <code>?password=LA_TUA_BOT_PASSWORD</code> alla fine.", 401);
  }
  if (!process.env.TELEGRAM_BOT_TOKEN) return page("⚠️ Manca TELEGRAM_BOT_TOKEN", "Aggiungi il token che ti ha dato @BotFather su Netlify e rifai il deploy.");

  try {
    const me = await tg("getMe");
    const hook = `${url.origin}/api/telegram`;
    await tg("setWebhook", {
      url: hook,
      secret_token: await webhookSecret(),
      allowed_updates: ["message"],
      drop_pending_updates: true,
    });
    await tg("setMyCommands", {
      commands: [
        { command: "nuova", description: "Ricomincia la conversazione" },
        { command: "ricorda", description: "Salva una cosa da ricordare" },
        { command: "memoria", description: "Cosa ricordo" },
        { command: "dimentica", description: "Cancella un ricordo" },
        { command: "resoconto", description: "Riassunto per Grok o Cursor" },
        { command: "aiuto", description: "Come funziono" },
      ],
    });
    const ids = (process.env.TELEGRAM_ALLOWED_IDS || "").trim();
    return page(
      "✅ Bot collegato!",
      `<p>Il bot <b>@${me.username}</b> ora riceve i messaggi su <code>${hook}</code>.</p>
       <p><a class="btn" href="https://t.me/${me.username}">Apri @${me.username} su Telegram</a></p>
       ${ids ? `<p>Utenti autorizzati: <code>${ids}</code></p>`
             : `<p><b>Ultimo passo:</b> scrivi al bot, ti risponderà con il tuo ID. Mettilo in <code>TELEGRAM_ALLOWED_IDS</code> su Netlify e rifai il deploy.</p>`}`
    );
  } catch (e) {
    return page("⚠️ Qualcosa non va", `<p>${String(e.message).replace(/</g, "&lt;")}</p><p>Controlla che il token di @BotFather sia giusto.</p>`, 500);
  }
};

export const config = { path: "/api/telegram-setup" };

function page(title, body, status = 200) {
  return new Response(
    `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Setup bot</title><style>
body{font:17px/1.5 system-ui,sans-serif;background:#14110f;color:#f3ece4;margin:0;padding:32px 16px}
main{max-width:520px;margin:auto;background:#1d1916;border:1px solid #3a332d;border-radius:18px;padding:24px}
h1{font-size:22px;margin-top:0}code{background:#0e0c0b;padding:2px 6px;border-radius:6px}
.btn{display:inline-block;background:#e8743b;color:#1a120c;padding:10px 16px;border-radius:12px;text-decoration:none;font-weight:600}
</style></head><body><main><h1>${title}</h1>${body}</main></body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8" } }
  );
}
