# CertaCode

Tvåspråkig (SV/EN) företagssida med bokningsflöde. Statisk `index.html` + en
serverless-funktion som tar emot bokningar utan att exponera någon API-nyckel.

## Struktur

```
index.html               # Hela sidan (HTML + CSS + JS inbäddat)
functions/api/booking.js # Cloudflare Pages Function: skickar formulär som mejl via Brevo
.dev.vars                # Lokal hemlighet (committas ALDRIG, ligger i .gitignore)
CNAME                    # Custom domain: certacode.se
```

## Så fungerar bokningen

Mötesbokningen sköts av en inbäddad Cal.com-kalender (kopplad till Google
Kalender). Hero-formuläret ("Få ett gratis designförslag") postar till
`/api/booking` (vår egen funktion), som skickar ett mejl till
`info.certacode@gmail.com` via Brevos API. Brevo-nyckeln ligger **på
serversidan** och finns aldrig i `index.html`, i webbläsaren eller i GitHub.

Varför Brevo: Web3Forms gratisplan tillåter inte anrop från en server, bara
från webbläsaren, vilket hade krävt att nyckeln låg öppet i HTML-koden.

Om sidan öppnas som ren statisk fil (utan backend) faller formuläret snyggt
tillbaka på att öppna besökarens mejlklient.

## ⚠️ Viktigt om hosting

Funktionen i `functions/` körs **bara på Cloudflare Pages** (eller motsvarande).
Den körs **inte** på GitHub Pages — GitHub Pages serverar bara statiska filer,
så där hamnar bokningen i mailto-fallback istället för i din inkorg.

För riktig leverans: deploya via **Cloudflare Pages** (nedan).

## Deploy till Cloudflare Pages (en gång)

1. **Cloudflare Dashboard → Workers & Pages → Create → Pages → Connect to Git**
   och välj repot `SalihMor1na/CertaCode`.
2. Build-inställningar: lämna **Build command tomt** och
   **Build output directory = `/`** (sidan är redan färdig, ingen build behövs).
3. **Settings → Variables and Secrets → Add:**
   - Name: `BREVO_KEY`
   - Value: din Brevo API-nyckel (SMTP & API → API Keys)
   - Type: **Secret** → **Save**, deploya sedan om
   Avsändaren `info.certacode@gmail.com` måste vara verifierad under
   Brevo → Senders.
4. **Custom domains → Set up a custom domain → `certacode.se`** och följ
   DNS-stegen. (CNAME-filen i repot är för GitHub Pages och ignoreras av
   Cloudflare — den kan ligga kvar eller tas bort.)
5. Klart. Varje deploy från `main` uppdaterar sidan automatiskt.

## Lokal utveckling med funktionen

```bash
npm install -g wrangler
wrangler pages dev .
```

`wrangler` läser nyckeln från `.dev.vars` (som inte committas). Öppna den
lokala URL:en och testa bokningsflödet — det går då via den riktiga funktionen.

För att bara titta på sidan (utan backend) räcker vilken statisk server som
helst; då används mailto-fallbacken.

## Byta / återkalla nyckel

Skapa en ny nyckel i Brevo (SMTP & API → API Keys) och radera den gamla.
Uppdatera värdet under Cloudflares Variables and Secrets (och i `.dev.vars`
lokalt: `BREVO_KEY=...`).
