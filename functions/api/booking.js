/**
 * Cloudflare Pages Function — POST /api/booking
 * ------------------------------------------------------------
 * Tar emot bokningsförfrågan från formuläret och vidarebefordrar
 * den till Web3Forms. Web3Forms-nyckeln läses från en KRYPTERAD
 * miljövariabel (env.WEB3FORMS_KEY) som du sätter i Cloudflare —
 * den finns aldrig i koden, i GitHub eller i webbläsaren.
 *
 * Sätt hemligheten så här (en gång):
 *   Cloudflare Dashboard → Workers & Pages → ditt Pages-projekt →
 *   Settings → Environment variables → Add variable
 *     Name:  WEB3FORMS_KEY
 *     Value: <din Web3Forms access key>
 *     [x] Encrypt   → Save
 * (Lokalt läses den istället från filen .dev.vars — se README.)
 */

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.WEB3FORMS_KEY) {
    return json({ success: false, message: "Server not configured (missing WEB3FORMS_KEY)." }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch (_) {
    return json({ success: false, message: "Invalid request." }, 400);
  }

  const fields = (body && typeof body.fields === "object" && body.fields) || {};
  const email = (body && body.replyto) || fields["E-post"] || "";

  // Minimal validering — hindrar tomma/uppenbart falska inskick.
  if (!fields["Namn"] || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email))) {
    return json({ success: false, message: "Missing or invalid fields." }, 422);
  }

  const payload = {
    access_key: env.WEB3FORMS_KEY,
    subject: (body && body.subject) || "Bokningsförfrågan – CertaCode",
    from_name: "CertaCode – Bokning",
    replyto: email,
    botcheck: "", // Web3Forms honeypot
    ...fields,
  };

  try {
    const upstream = await fetch("https://api.web3forms.com/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await upstream.json().catch(() => ({}));
    if (upstream.ok && result.success) {
      return json({ success: true });
    }
    return json({ success: false, message: result.message || "Delivery failed." }, 502);
  } catch (err) {
    return json({ success: false, message: "Upstream error." }, 502);
  }
}

// Blockera övriga metoder tydligt.
export async function onRequest(context) {
  if (context.request.method === "POST") return onRequestPost(context);
  return json({ success: false, message: "Method not allowed." }, 405);
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
