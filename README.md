# Il mio Assistente (con Claude)

Il tuo assistente personale con Claude, in due versioni che girano sullo stesso sito Netlify:

- **Bot Telegram**: lo usi come un contatto, dal telefono o dal PC. Ricorda la conversazione, legge le foto e prepara i resoconti per Grok.
- **App web** (facoltativa): la chat nel browser, installabile sul tablet.

## Cosa c'è dentro

```
netlify/functions/telegram.mjs        il bot: riceve i messaggi da Telegram e risponde con Claude
netlify/functions/telegram-setup.mjs  pagina da aprire una volta per collegare il bot al sito
netlify/functions/chat.mjs            la parte server dell'app web
netlify/lib/profilo.mjs               ← CHI SEI e come deve rispondere (modificalo pure)
netlify/lib/telegram.mjs, claude.mjs  codice di servizio
public/                               l'app web
package.json, netlify.toml            configurazione per Netlify
```

## Messa online (circa 15 minuti)

### 1. Crea il bot su Telegram
1. In Telegram cerca **@BotFather** (quello con la spunta blu) e scrivigli `/newbot`.
2. Scegli un nome (es. *Il mio assistente*) e uno username che finisca in `bot` (es. `stefano_assistente_bot`).
3. BotFather ti dà un **token** tipo `123456789:AAH...`. Tienilo segreto, è la chiave del bot.

### 2. Chiave API di Claude
Vai su <https://console.anthropic.com>, aggiungi un po' di credito (5 $ bastano per tantissimi messaggi) e crea una chiave in *API Keys* (`sk-ant-…`).
È a consumo e separata dall'abbonamento a Claude.

### 3. GitHub + Netlify
1. Crea un repository (es. `mio-assistente`) e caricaci **tutti** i file di questa cartella, mantenendo le sottocartelle.
2. Su Netlify: *Add new project → Import an existing project → GitHub* → scegli il repository. Le impostazioni di build le legge da solo.

### 4. Variabili segrete
Netlify → *Project configuration → Environment variables*:

| Nome | Valore |
|---|---|
| `TELEGRAM_BOT_TOKEN` | il token di BotFather |
| `ANTHROPIC_API_KEY` | la chiave `sk-ant-…` |
| `BOT_PASSWORD` | una password a tua scelta |
| `CLAUDE_MODEL` | *(facoltativa)* se non la metti usa `claude-sonnet-5-5` |

Poi **Deploys → Trigger deploy → Deploy project**.

### 5. Collega il bot
Apri nel browser (con il nome del tuo sito e la tua password):

```
https://TUO-SITO.netlify.app/api/telegram-setup?password=LA_TUA_BOT_PASSWORD
```

Se vedi **✅ Bot collegato!** hai finito questa parte.

### 6. Rendilo solo tuo
1. Scrivi qualcosa al bot: ti risponde con il tuo **ID Telegram** (un numero).
2. Aggiungi su Netlify la variabile `TELEGRAM_ALLOWED_IDS` con quel numero e rifai il deploy.

Da qui in poi risponde solo a te. Chiunque altro riceve "🔒 assistente privato" e non consuma il tuo credito.

## Come si usa

Scrivi normalmente o manda una **foto** (una bolla, una pianta, una schermata…).

| Comando | Cosa fa |
|---|---|
| `/nuova` | ricomincia la conversazione |
| `/ricorda testo` | salva una cosa per sempre (es. `/ricorda Comit consegna il martedì`) |
| `/memoria` | mostra cosa ricorda |
| `/dimentica 2` / `/dimentica tutto` | cancella un ricordo, o tutti |
| `/resoconto` | riassunto da mandare a Grok o Cursor |
| `/aiuto` | elenco comandi |

Ricorda gli ultimi 40 messaggi. Le cose salvate con `/ricorda` restano anche dopo `/nuova`.

## Parlare con Grok (o altri bot)

Su Telegram i bot non possono leggersi tra loro, nemmeno in un gruppo: il passaggio lo fai tu, ma con un tocco.

- **Da Grok al tuo assistente**: tieni premuto il messaggio di Grok → *Inoltra* → scegli il tuo assistente. Lui capisce che arriva da un altro bot e lo valuta. Se Grok è in un'altra app, copia il testo e incollalo scrivendo prima "Grok dice:".
- **Dal tuo assistente a Grok**: scrivi `/resoconto` → inoltra o copia il messaggio che ti prepara.

## Cambiare chi sei e come risponde

Modifica `netlify/lib/profilo.mjs` su GitHub (matita ✏️ → *Commit*). Netlify ripubblica da solo.

## App web (facoltativa)

È all'indirizzo principale del sito. Al primo avvio chiede la password (`BOT_PASSWORD`). Per averla come app: menu del browser → *Aggiungi a schermata Home*.

## Se qualcosa non va

- **Il bot non risponde**: riapri la pagina del punto 5 e guarda se dà un errore.
- **"⚠️ …credit balance…"**: è finito il credito sulla console Anthropic.
- **Errori nel dettaglio**: Netlify → *Logs → Functions → telegram*.

## Costi

Telegram, GitHub e Netlify sono gratis per un uso personale. Paghi solo Claude a consumo: pochi centesimi per una chiacchierata, un po' di più con le foto.

## Prossimi passi possibili

- Messaggi vocali (trascritti e poi capiti da Claude)
- Promemoria programmati ("ricordami domani alle 9…")
- PDF e documenti
