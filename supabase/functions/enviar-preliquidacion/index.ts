// ─────────────────────────────────────────────────────────────────────────────
//  Edge Function: enviar-preliquidacion
//  Envía por mail la preliquidación de un médico DESDE la casilla de la clínica
//  (Gmail por SMTP, con "contraseña de aplicación"). La invoca el botón
//  "✉️ Enviar por mail" de la app (js/ui-preliquidacion.js → enviarLiquidacionMail).
//
//  SECRETS que hay que cargar en Supabase (NO van en este archivo):
//    GMAIL_USER         = oftaoftalmo26@gmail.com
//    GMAIL_APP_PASSWORD = la contraseña de aplicación de 16 letras de Google (sin espacios)
//  Se cargan en: Supabase → Edge Functions → (Secrets / Manage secrets),
//  o por CLI:  supabase secrets set GMAIL_USER=... GMAIL_APP_PASSWORD=...
//
//  Seguridad: se despliega con "Verify JWT" ACTIVADO (el default), así solo la pueden
//  llamar usuarios con sesión válida de la app. La contraseña vive solo en los secrets.
// ─────────────────────────────────────────────────────────────────────────────

import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "Método no permitido" }, 405);

  let payload: { to?: string; subject?: string; html?: string; text?: string; medico?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ ok: false, error: "Body inválido (se esperaba JSON)." }, 400);
  }

  const to = (payload.to || "").trim();
  const subject = (payload.subject || "").trim();
  const html = payload.html || "";
  const text = payload.text || "";
  if (!to || !subject || (!html && !text)) {
    return json({ ok: false, error: "Faltan datos: to, subject y html/text son obligatorios." }, 400);
  }
  // Validación mínima del destinatario.
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
    return json({ ok: false, error: `Email de destino inválido: ${to}` }, 400);
  }

  const user = Deno.env.get("GMAIL_USER");
  const pass = Deno.env.get("GMAIL_APP_PASSWORD");
  if (!user || !pass) {
    return json({ ok: false, error: "Faltan los secrets GMAIL_USER / GMAIL_APP_PASSWORD en Supabase." }, 500);
  }

  try {
    const client = new SMTPClient({
      connection: {
        hostname: "smtp.gmail.com",
        port: 465,
        tls: true,
        auth: { username: user, password: pass },
      },
    });
    await client.send({
      from: `OIP Oftalmología Integral <${user}>`,
      to,
      subject,
      content: text || "Preliquidación en el cuerpo del mensaje.",
      html: html || undefined,
    });
    await client.close();
    return json({ ok: true });
  } catch (e) {
    return json({ ok: false, error: "No se pudo enviar el mail: " + String((e as Error)?.message || e) }, 500);
  }
});
