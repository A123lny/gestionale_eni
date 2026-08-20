# Avviso Telegram — Carburante da ordinare

Edge Function che controlla l'autonomia dei serbatoi e invia un messaggio Telegram
quando un carburante è **da ordinare** (semaforo giallo/rosso). **Sola lettura** sul DB.

Riproduce lo stesso motore di previsione della pagina *Ordine Carburante* → i numeri
coincidono con card e campanellina.

---

## 1. Crea il bot Telegram
1. Su Telegram apri **@BotFather** → `/newbot` → scegli nome e username.
2. Ti dà un **token** tipo `123456:ABC-DEF...`. **Tienilo privato** (non incollarlo in chat/repo).

## 2. Trova il tuo chat_id
1. Scrivi un messaggio qualsiasi al tuo bot (o aggiungilo a un gruppo e scrivi lì).
2. Apri nel browser: `https://api.telegram.org/bot<TOKEN>/getUpdates`
3. Cerca `"chat":{"id":...}` → quel numero è il tuo **chat_id**
   (per i gruppi è negativo, es. `-100123...`).

## 3. Imposta i secret su Supabase
Dashboard → **Project Settings → Edge Functions → Secrets** (o `supabase secrets set`):
- `TELEGRAM_BOT_TOKEN` = il token del bot
- `TELEGRAM_CHAT_ID` = il chat_id
- `CRON_SECRET` = una stringa a piacere (es. una password lunga) per autorizzare le chiamate

`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` sono già disponibili in automatico.

## 4. Deploy della funzione
Con la Supabase CLI (dalla cartella del progetto):
```bash
supabase functions deploy telegram-ordine-carburante --no-verify-jwt
```
`--no-verify-jwt` permette al cron di chiamarla; l'accesso resta protetto dal `CRON_SECRET`.

In alternativa, dal Dashboard → **Edge Functions → Create function**, incolla il contenuto di `index.ts`.

## 5. Prova subito (test manuale)
Apri nel browser (sostituisci PROJECT_REF e CRON_SECRET):
```
https://PROJECT_REF.supabase.co/functions/v1/telegram-ordine-carburante?key=CRON_SECRET&force=1
```
`force=1` invia un messaggio anche se non c'è nulla da ordinare → verifichi che Telegram funzioni.
Togli `&force=1` per il comportamento normale (silenzioso se non c'è nulla).

## 6. Schedula il controllo giornaliero
Esegui `cron.sql` nel **SQL Editor** (sostituendo PROJECT_REF e CRON_SECRET).
Di default gira alle **07:30 UTC** (~09:30 in estate). Cambia l'orario nel cron se vuoi.

---

## Note
- La funzione avvisa solo per i carburanti con ordine **imminente** (entro 2 giorni dalla
  data-limite): stessa soglia della campanellina 🔔.
- È **silenziosa** se non c'è nulla da ordinare (nessuno spam), tranne con `force=1`.
- Nessuna scrittura sul DB: legge serbatoi, giacenze rilevate, carichi previsti, vendite e parametri.
- Il messaggio riporta: litri da ordinare, entro quando ordinare, data consegna, giacenza e autonomia.
