// ============================================================
// Edge Function: gestione-staff
// Provisioning login dipendenti (privilegi admin, service role).
// Azioni:
//   crea  -> crea utente Auth (email tecnica + PIN 6 cifre) + riga personale
//   pin   -> aggiorna il PIN (password Auth) di un dipendente
// Chiamabile SOLO da un utente loggato che sia Super Admin o Admin.
// Deploy con verify_jwt ON.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, obj: unknown) {
  return new Response(JSON.stringify(obj), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1) Identifica il chiamante dal JWT
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) return json(200, { ok: false, error: "Non autenticato" });
    const { data: u } = await admin.auth.getUser(jwt);
    if (!u || !u.user) return json(200, { ok: false, error: "Sessione non valida" });

    // 2) Verifica che sia Super Admin o Admin attivo
    const { data: caller } = await admin.from("personale")
      .select("super_admin, ruolo")
      .eq("auth_user_id", u.user.id).eq("attivo", true).maybeSingle();
    if (!caller || !(caller.super_admin || caller.ruolo === "Admin")) {
      return json(200, { ok: false, error: "Non autorizzato" });
    }

    const p = await req.json().catch(() => ({}));
    const azione = p.azione;

    // --- CREA dipendente ---
    if (azione === "crea") {
      const username = String(p.username || "").trim().toLowerCase();
      const pin = String(p.pin || "");
      const nome = String(p.nome_completo || "").trim();
      if (!username || !nome) return json(200, { ok: false, error: "Username e nome obbligatori" });
      if (!/^[0-9]{6}$/.test(pin)) return json(200, { ok: false, error: "Il PIN deve essere di 6 cifre" });
      if (!/^[a-z0-9._-]+$/.test(username)) return json(200, { ok: false, error: "Username non valido (solo lettere, numeri, . _ -)" });

      // username già usato?
      const { data: esiste } = await admin.from("personale").select("id").eq("username", username).maybeSingle();
      if (esiste) return json(200, { ok: false, error: "Username già esistente" });

      const email = username + "@staff.titanwash.local";
      const { data: cre, error: eAuth } = await admin.auth.admin.createUser({ email, password: pin, email_confirm: true });
      if (eAuth || !cre || !cre.user) return json(200, { ok: false, error: "Auth: " + (eAuth ? eAuth.message : "creazione fallita") });
      const authId = cre.user.id;

      const { data: pers, error: ePers } = await admin.from("personale").insert({
        username, nome_completo: nome, ruolo: p.ruolo || "Cassiere",
        pin, email: p.email || null, telefono: p.telefono || null,
        attivo: true, auth_user_id: authId, super_admin: false,
      }).select().single();
      if (ePers) {
        await admin.auth.admin.deleteUser(authId); // rollback
        return json(200, { ok: false, error: "DB: " + ePers.message });
      }
      return json(200, { ok: true, personale: pers });
    }

    // --- CAMBIA PIN ---
    if (azione === "pin") {
      const authUserId = p.auth_user_id;
      const pin = String(p.pin || "");
      if (!authUserId) return json(200, { ok: false, error: "Dipendente senza login collegato" });
      if (!/^[0-9]{6}$/.test(pin)) return json(200, { ok: false, error: "Il PIN deve essere di 6 cifre" });
      const { error: eUpd } = await admin.auth.admin.updateUserById(authUserId, { password: pin });
      if (eUpd) return json(200, { ok: false, error: "Auth: " + eUpd.message });
      await admin.from("personale").update({ pin, updated_at: new Date().toISOString() }).eq("auth_user_id", authUserId);
      return json(200, { ok: true });
    }

    return json(200, { ok: false, error: "Azione sconosciuta" });
  } catch (e) {
    return json(200, { ok: false, error: String((e as Error).message || e) });
  }
});
