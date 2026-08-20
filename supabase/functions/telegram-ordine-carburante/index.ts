// ============================================================
// Edge Function: telegram-ordine-carburante
// Controlla l'autonomia dei serbatoi e, se un carburante è da ordinare
// (semaforo giallo/rosso), invia un avviso su Telegram.
// SOLO LETTURA sul DB. Riproduce il motore ENI.PrevisioneCarburante.
//
// Secret richiesti (Project Settings → Edge Functions → Secrets):
//   TELEGRAM_BOT_TOKEN   token del bot (@BotFather)
//   TELEGRAM_CHAT_ID     id chat/gruppo dove inviare
//   CRON_SECRET          stringa a piacere: va passata come ?key=... per autorizzare la chiamata
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sono forniti in automatico.
//
// Query param:
//   ?key=<CRON_SECRET>   obbligatorio
//   &force=1             invia un messaggio anche se non c'è nulla da ordinare (per test)
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------- Motore previsione (porting di js/lib/previsione-carburante.js) ----------
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

// ---------- Handler ----------
Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
    if (!CRON_SECRET || url.searchParams.get("key") !== CRON_SECRET) {
      return new Response("unauthorized", { status: 401 });
    }
    const force = url.searchParams.get("force") === "1";

    const TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
    const CHAT_ID = Deno.env.get("TELEGRAM_CHAT_ID");
    if (!TOKEN || !CHAT_ID) return new Response("missing telegram env", { status: 500 });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Oggi nel fuso di San Marino/Roma (il server gira in UTC)
    const oggi = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date());

    // Base dati
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

    const daInclusi: any[] = [];
    for (const prod of (prodotti || [])) {
      const serb = serbMap[prod.id] || {};

      // Giacenza rilevata più recente
      const giacRes = await supabase.from("giacenze_rilevate").select("litri,data").eq("prodotto_id", prod.id).order("data", { ascending: false }).limit(1).maybeSingle();
      const giac = giacRes.data ? Number((giacRes.data as any).litri) : 0;

      // Carichi previsti
      const carRes = await supabase.from("carichi_previsti").select("data_prevista,litri").eq("prodotto_id", prod.id);
      const carichiPrevisti = (carRes.data || []).map((c: any) => ({ data: c.data_prevista, litri: c.litri }));

      // Media consumo
      let mediaParams: any;
      if (parametri.modalita_media === "manuale") {
        const mm = (parametri.media_manuale && parametri.media_manuale[prod.id]) || {};
        mediaParams = { modalita: "manuale", manualeTotale: Number(mm.totale) || 0, manualeGiorni: Number(mm.giorni) || 0 };
      } else {
        const da = addGiorni(oggi, -finestra), a = addGiorni(oggi, -1);
        const vg = await supabase.from("vendite_giornaliere").select("id").gte("data_inizio", da).lte("data_inizio", a);
        const ids = (vg.data || []).map((r: any) => r.id);
        let tot = 0;
        if (ids.length) {
          const vp = await supabase.from("vendite_per_prodotto").select("litri").eq("prodotto_id", prod.id).in("vendita_id", ids);
          tot = (vp.data || []).reduce((s: number, r: any) => s + (Number(r.litri) || 0), 0);
        }
        mediaParams = { modalita: "auto", erogatoFinestra: tot, giorniFinestra: finestra };
      }

      const media = mediaParams.modalita === "manuale"
        ? (mediaParams.manualeGiorni > 0 ? mediaParams.manualeTotale / mediaParams.manualeGiorni : 0)
        : (mediaParams.giorniFinestra > 0 ? mediaParams.erogatoFinestra / mediaParams.giorniFinestra : 0);

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

      if (!prop.serve) continue;
      const gg = daysBetween(oggi, prop.dataOrdine);
      if (gg > 2) continue; // solo imminenti (giallo/rosso), come la campanellina

      daInclusi.push({ nome: prod.nome, prop, ind, urgente: gg <= 0, giac });
    }

    // Componi messaggio
    let text: string;
    if (daInclusi.length) {
      const righe = daInclusi.map((x) => {
        const ico = x.urgente ? "🔴" : "🟡";
        const azione = x.urgente
          ? "ordina <b>SUBITO</b>"
          : "ordina entro le 8:30 del <b>" + fmtData(x.prop.dataOrdine) + "</b>";
        const aut = x.ind.giorniAutonomia != null ? x.ind.giorniAutonomia + " gg" : "—";
        return `${ico} <b>${escapeHtml(x.nome)}</b>: ${azione} — ${fmtL(x.prop.quantita)} L\n` +
               `   consegna ${fmtData(x.prop.dataConsegna)} · giacenza ${fmtL(x.giac)} L · autonomia ${aut}`;
      }).join("\n\n");
      text = `⛽ <b>Carburante da ordinare</b> (${fmtData(oggi)})\n\n${righe}`;
    } else {
      if (!force) return new Response(JSON.stringify({ ok: true, daOrdinare: 0 }), { headers: { "Content-Type": "application/json" } });
      text = `✅ Nessun carburante da ordinare (${fmtData(oggi)}).`;
    }

    const tg = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: "HTML", disable_web_page_preview: true }),
    });
    const tgBody = await tg.text();

    return new Response(JSON.stringify({ ok: tg.ok, daOrdinare: daInclusi.length, telegram: tgBody }), {
      status: tg.ok ? 200 : 502, headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message || e) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});

function escapeHtml(s: string) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
