// ============================================================
// Edge Function: telegram-bot  (webhook interattivo)
// Riceve i messaggi del bot Telegram e risponde ai comandi:
//   /start          messaggio di benvenuto
//   /stato /giacenza situazione attuale serbatoi (giacenza + da ordinare)
// SOLO LETTURA sul DB. Riproduce il motore ENI.PrevisioneCarburante.
//
// Secret richiesti:
//   TELEGRAM_BOT_TOKEN         token del bot
//   TELEGRAM_CHAT_ID           chat autorizzata a /stato (il titolare)
//   TELEGRAM_WEBHOOK_SECRET    stringa passata a setWebhook come secret_token
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY forniti in automatico.
// Deploy con verify_jwt OFF (Telegram non manda JWT); protetto dal secret_token.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------- Motore previsione ----------
function parseISO(s: string) { const p = String(s).split("-"); return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])); }
function toISO(d: Date) { const m = String(d.getMonth() + 1).padStart(2, "0"); const g = String(d.getDate()).padStart(2, "0"); return d.getFullYear() + "-" + m + "-" + g; }
function addGiorni(iso: string, n: number) { const d = parseISO(iso); d.setDate(d.getDate() + n); return toISO(d); }
function dow(iso: string) { return parseISO(iso).getDay(); }
function daysBetween(a: string, b: string) { return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86400000); }
function mondayOf(iso: string) { const d = dow(iso); const off = (d === 0) ? 6 : (d - 1); return addGiorni(iso, -off); }
function fmtData(iso: string) { const p = String(iso).split("-"); return p[2] + "/" + p[1]; }
function fmtL(n: number) { return Math.round(Number(n) || 0).toLocaleString("it-IT"); }

function fattoreGiorno(dataISO: string, fattori: Record<string, number>) {
  const d = dow(dataISO);
  if (!fattori) return 1;
  const f = (fattori[d] != null) ? Number(fattori[d]) : 1;
  return isNaN(f) ? 1 : f;
}

function costruisciCascata(p: any) {
  const giacenzaIniziale = Math.round(Number(p.giacenzaIniziale) || 0);
  const orizzonte = Number(p.orizzonte) || 21;
  const media = Number(p.media) || 0;
  const fattori = p.fattori || {};
  const scortaMinima = Number(p.scortaMinima) || 0;
  const caricoPerData: Record<string, number> = {};
  (p.carichiPrevisti || []).forEach((c: any) => {
    const d = c.data || c.data_prevista;
    if (!d) return;
    caricoPerData[d] = (caricoPerData[d] || 0) + Math.round(Number(c.litri) || 0);
  });
  const giorni: any[] = [];
  let chiusuraPrec = giacenzaIniziale;
  for (let i = 0; i < orizzonte; i++) {
    const dataG = addGiorni(p.dataInizio, i);
    const apertura = (i === 0) ? giacenzaIniziale : chiusuraPrec;
    const carichi = caricoPerData[dataG] || 0;
    const consumo = Math.round(media * fattoreGiorno(dataG, fattori));
    const chiusura = apertura + carichi - consumo;
    const stato = chiusura <= 0 ? "esaurito" : (chiusura <= scortaMinima ? "sottoscorta" : "ok");
    giorni.push({ data: dataG, dow: dow(dataG), apertura, carichi, consumo, chiusura, stato });
    chiusuraPrec = chiusura;
  }
  return giorni;
}

function indicatori(cascata: any[], scortaMinima: number) {
  scortaMinima = Number(scortaMinima) || 0;
  let dataSottoScorta: string | null = null, dataEsaurimento: string | null = null, giorniAutonomia: number | null = null;
  for (let i = 0; i < cascata.length; i++) {
    if (dataSottoScorta === null && cascata[i].chiusura <= scortaMinima) { dataSottoScorta = cascata[i].data; giorniAutonomia = i; }
    if (dataEsaurimento === null && cascata[i].chiusura <= 0) { dataEsaurimento = cascata[i].data; }
  }
  return { dataSottoScorta, dataEsaurimento, giorniAutonomia };
}

function propostaOrdine(p: any) {
  const cascata = p.cascata || [];
  const scortaMinima = Number(p.scortaMinima) || 0;
  const capacitaUtile = Number(p.capacitaUtile) || 0;
  let lotto = Number(p.lottoMinimo) || 1; if (lotto <= 0) lotto = 1;
  const giorniConsegna = (p.giorniConsegna && p.giorniConsegna.length) ? p.giorniConsegna : [1, 2, 3, 4, 5];
  let idx = -1;
  for (let i = 0; i < cascata.length; i++) { if (cascata[i].chiusura <= scortaMinima) { idx = i; break; } }
  if (idx === -1) return { serve: false };
  const giornoSottoScorta = cascata[idx].data;
  const minData = cascata.length ? cascata[0].data : giornoSottoScorta;
  let consegna = giornoSottoScorta;
  while (giorniConsegna.indexOf(dow(consegna)) === -1 && consegna > minData) consegna = addGiorni(consegna, -1);
  const gc = cascata.find((g: any) => g.data === consegna);
  const aperturaConsegna = gc ? gc.apertura : cascata[idx].apertura;
  const spazio = capacitaUtile - aperturaConsegna;
  if (spazio <= 0) return { serve: false };
  const quantita = Math.floor(spazio / lotto) * lotto;
  if (quantita <= 0) return { serve: false };
  let ordine = addGiorni(consegna, -1);
  while ([1, 2, 3, 4, 5].indexOf(dow(ordine)) === -1) ordine = addGiorni(ordine, -1);
  return { serve: true, dataConsegna: consegna, dataOrdine: ordine, quantita, giornoSottoScorta, aperturaConsegna };
}

// Calcola la situazione di TUTTI i prodotti
async function computeStato(supabase: any, oggi: string) {
  const [{ data: prodotti }, { data: serbatoi }, { data: cfg }] = await Promise.all([
    supabase.from("prodotti_carburante").select("id,nome,attivo,ordine").eq("attivo", true).order("ordine", { ascending: true }),
    supabase.from("serbatoi").select("*"),
    supabase.from("config_carburanti").select("valore").eq("chiave", "previsione_parametri").maybeSingle(),
  ]);
  const PARAM_DEFAULT: any = { finestra_giorni: 12, orizzonte: 21, modalita_media: "auto", fattori_giorno: { "0": 0.5, "6": 0.8 }, media_manuale: {} };
  let parametri = { ...PARAM_DEFAULT };
  if (cfg && (cfg as any).valore) { try { parametri = { ...PARAM_DEFAULT, ...JSON.parse((cfg as any).valore) }; } catch (_e) { /* default */ } }
  const serbMap: Record<string, any> = {};
  (serbatoi || []).forEach((s: any) => serbMap[s.prodotto_id] = s);
  const gridStart = mondayOf(oggi);
  let orizz = daysBetween(oggi, addGiorni(gridStart, 20)) + 1;
  if (orizz < 1) orizz = 1;
  const finestra = Number(parametri.finestra_giorni) || 12;

  const out: any[] = [];
  for (const prod of (prodotti || [])) {
    const serb = serbMap[prod.id] || {};
    const giacRes = await supabase.from("giacenze_rilevate").select("litri,data").eq("prodotto_id", prod.id).order("data", { ascending: false }).limit(1).maybeSingle();
    const giac = giacRes.data ? Number((giacRes.data as any).litri) : 0;
    const carRes = await supabase.from("carichi_previsti").select("data_prevista,litri").eq("prodotto_id", prod.id);
    const carichiPrevisti = (carRes.data || []).map((c: any) => ({ data: c.data_prevista, litri: c.litri }));

    let media = 0;
    if (parametri.modalita_media === "manuale") {
      const mm = (parametri.media_manuale && parametri.media_manuale[prod.id]) || {};
      const g = Number(mm.giorni) || 0;
      media = g > 0 ? (Number(mm.totale) || 0) / g : 0;
    } else {
      const da = addGiorni(oggi, -finestra), a = addGiorni(oggi, -1);
      const vg = await supabase.from("vendite_giornaliere").select("id").gte("data_inizio", da).lte("data_inizio", a);
      const ids = (vg.data || []).map((r: any) => r.id);
      let tot = 0;
      const giorniSet = new Set<string>();
      if (ids.length) {
        const vp = await supabase.from("vendite_per_prodotto").select("litri, vendita_id").eq("prodotto_id", prod.id).in("vendita_id", ids);
        (vp.data || []).forEach((r: any) => { tot += Number(r.litri) || 0; if (r.vendita_id) giorniSet.add(String(r.vendita_id)); });
      }
      // Divide per i giorni EFFETTIVAMENTE registrati (non per la finestra fissa)
      const giorniEff = giorniSet.size > 0 ? giorniSet.size : finestra;
      media = giorniEff > 0 ? tot / giorniEff : 0;
    }

    const cascata = costruisciCascata({
      giacenzaIniziale: giac, dataInizio: oggi, orizzonte: orizz, media,
      fattori: parametri.fattori_giorno, scortaMinima: Number(serb.scorta_minima) || 0, carichiPrevisti,
    });
    const ind = indicatori(cascata, Number(serb.scorta_minima) || 0);
    const prop: any = propostaOrdine({
      cascata, scortaMinima: Number(serb.scorta_minima) || 0,
      capacitaUtile: Number(serb.capacita_utile) || 0, lottoMinimo: Number(serb.lotto_minimo) || 0,
      giorniConsegna: [1, 2, 3, 4, 5],
    });
    let livello = "ok";
    if (prop.serve) {
      const gg = daysBetween(oggi, prop.dataOrdine);
      livello = gg <= 0 ? "rosso" : (gg <= 2 ? "giallo" : "ok");
    }
    out.push({ nome: prod.nome, giac, media, ind, prop, livello });
  }
  return out;
}

function escapeHtml(s: string) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function testoStato(stato: any[], oggi: string, ora: string) {
  const ico: Record<string, string> = { rosso: "🔴", giallo: "🟡", ok: "🟢" };
  const righe = stato.map((x) => {
    const aut = x.ind.giorniAutonomia != null ? x.ind.giorniAutonomia + " gg" : "oltre 3 sett.";
    let riga = `${ico[x.livello]} <b>${escapeHtml(x.nome)}</b> — giacenza ${fmtL(x.giac)} L · autonomia ${aut}`;
    if (x.prop.serve) {
      const gg = daysBetween(oggi, x.prop.dataOrdine);
      const quando = gg <= 0 ? "ordina SUBITO" : "ordina entro 8:30 del " + fmtData(x.prop.dataOrdine);
      riga += `\n   → ${fmtL(x.prop.quantita)} L, ${quando} (consegna ${fmtData(x.prop.dataConsegna)})`;
    }
    return riga;
  }).join("\n\n");
  return `📊 <b>Situazione carburante</b> (${fmtData(oggi)} ${ora})\n\n${righe}`;
}

async function sendMessage(token: string, chatId: string | number, text: string) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
  });
}

Deno.serve(async (req) => {
  try {
    // Verifica che la chiamata arrivi da Telegram (secret_token impostato in setWebhook)
    const WH_SECRET = Deno.env.get("TELEGRAM_WEBHOOK_SECRET") || "";
    const got = req.headers.get("x-telegram-bot-api-secret-token") || "";
    if (!WH_SECRET || got !== WH_SECRET) return new Response("unauthorized", { status: 401 });

    const TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
    // Autorizzati a /stato: TELEGRAM_CHAT_ID (titolare) + lista TELEGRAM_ALLOWED_CHATS (id separati da virgola)
    const OWNER = Deno.env.get("TELEGRAM_CHAT_ID") || "";
    const EXTRA = (Deno.env.get("TELEGRAM_ALLOWED_CHATS") || "").split(",").map((s) => s.trim()).filter(Boolean);
    const allowed = new Set([OWNER, ...EXTRA].filter(Boolean).map(String));

    const update = await req.json().catch(() => ({}));
    const msg = update.message || update.edited_message;
    if (!msg || !msg.chat) return new Response("ok"); // niente da fare

    const chatId = msg.chat.id;
    const text = String(msg.text || "").trim().toLowerCase();
    const cmd = text.split(/\s+/)[0].replace(/@.*$/, ""); // "/stato@bot" -> "/stato"

    if (cmd === "/start") {
      await sendMessage(TOKEN, chatId,
        "👋 Ciao! Sono il bot di <b>Titanwash</b>.\n\n" +
        "Ogni mattina alle <b>7:30</b> ti avviso se c'è carburante da ordinare.\n" +
        "Scrivi <b>/stato</b> per la situazione attuale dei serbatoi.");
      return new Response("ok");
    }

    if (cmd === "/id") {
      await sendMessage(TOKEN, chatId, "Il tuo ID Telegram è: <b>" + chatId + "</b>");
      return new Response("ok");
    }

    if (cmd === "/stato" || cmd === "/giacenza") {
      // Solo gli autorizzati possono vedere i dati aziendali
      if (allowed.size && !allowed.has(String(chatId))) {
        await sendMessage(TOKEN, chatId,
          "⛔ Non sei autorizzato a vedere questi dati.\n" +
          "Il tuo ID è: <b>" + chatId + "</b>\nChiedi al titolare di abilitarti.");
        return new Response("ok");
      }
      const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const oggi = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date());
      const ora = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" }).format(new Date());
      const stato = await computeStato(supabase, oggi);
      await sendMessage(TOKEN, chatId, stato.length ? testoStato(stato, oggi, ora) : "Nessun serbatoio configurato.");
      return new Response("ok");
    }

    // Comando sconosciuto
    await sendMessage(TOKEN, chatId, "Comandi disponibili:\n/stato — situazione serbatoi\n/start — info");
    return new Response("ok");
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message || e) }), { status: 200, headers: { "Content-Type": "application/json" } });
  }
});
