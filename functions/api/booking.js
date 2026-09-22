/**
 * Cloudflare Pages Function, POST /api/booking
 * ------------------------------------------------------------
 * Tar emot formulär från webbplatsen (t.ex. "Få ett gratis designförslag")
 * och skickar dem som mejl till oss via Brevo. API-nyckeln läses från en
 * KRYPTERAD miljövariabel (env.BREVO_KEY) som sätts i Cloudflare, så den
 * finns aldrig i koden, i GitHub eller i webbläsaren.
 *
 * Sätt hemligheten så här (en gång):
 *   Cloudflare Dashboard → Workers & Pages → ditt Pages-projekt →
 *   Settings → Variables and Secrets → Add
 *     Name:  BREVO_KEY
 *     Value: <din Brevo API-nyckel>
 *     Type:  Secret   → Save, deploya om
 * (Lokalt läses den istället från filen .dev.vars, se README.)
 *
 * Avsändaradressen måste vara verifierad i Brevo (Senders).
 */

const TO = "info.certacode@gmail.com";

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.BREVO_KEY) {
    return json({ success: false, message: "Server not configured (missing BREVO_KEY)." }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch (_) {
    return json({ success: false, message: "Invalid request." }, 400);
  }

  const fields = (body && typeof body.fields === "object" && body.fields) || {};
  const email = String((body && body.replyto) || fields["E-post"] || "").trim();

  // Minimal validering: hindrar tomma eller uppenbart falska inskick.
  if (!fields["Namn"] || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ success: false, message: "Missing or invalid fields." }, 422);
  }

  const subject = String((body && body.subject) || "Förfrågan från certacode.se").slice(0, 150);
  const rows = Object.entries(fields)
    .filter(([k, v]) => typeof k === "string" && k.length <= 60 && v != null)
    .map(([k, v]) => [k, String(v).slice(0, 2000)]);

  const text = rows.map(([k, v]) => `${k}: ${v}`).join("\n");
  const html =
    `<table style="font:15px/1.5 system-ui,sans-serif;border-collapse:collapse">` +
    rows.map(([k, v]) => `<tr><td style="padding:6px 14px 6px 0;color:#6F6B63;white-space:nowrap;vertical-align:top">${esc(k)}</td><td style="padding:6px 0">${esc(v).replace(/\n/g, "<br>")}</td></tr>`).join("") +
    `</table>`;

  const payload = {
    sender: { name: "CertaCode webbplats", email: TO },
    to: [{ email: TO, name: "CertaCode" }],
    replyTo: { email },
    subject,
    textContent: text,
    htmlContent: html,
    tags: ["webbplats"],
  };

  try {
    const upstream = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": env.BREVO_KEY, "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(payload),
    });
    if (upstream.status === 201) {
      return json({ success: true });
    }
    const result = await upstream.json().catch(() => ({}));
    return json({ success: false, message: result.message || `Delivery failed (${upstream.status}).` }, 502);
  } catch (err) {
    return json({ success: false, message: "Upstream error." }, 502);
  }
}

// Blockera övriga metoder tydligt.
export async function onRequest(context) {
  if (context.request.method === "POST") return onRequestPost(context);
  return json({ success: false, message: "Method not allowed." }, 405);
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
