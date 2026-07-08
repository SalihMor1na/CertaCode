# CertaCode

Tvåspråkig (SV/EN) företagssida med bokningsflöde. Statisk `index.html` + en
serverless-funktion som tar emot bokningar utan att exponera någon API-nyckel.

## Struktur

```
index.html               # Hela sidan (HTML + CSS + JS inbäddat)
functions/api/booking.js # Cloudflare Pages Function — proxy till Web3Forms
.dev.vars                # Lokal hemlighet (committas ALDRIG, ligger i .gitignore)
CNAME                    # Custom domain: certacode.se
```

## Så fungerar bokningen

Formuläret postar till `/api/booking` (vår egen funktion). Funktionen lägger
till Web3Forms-nyckeln **på serversidan** och skickar vidare, så att varje
bokning mejlas till `info.certacode@gmail.com`. Nyckeln finns aldrig i
`index.html`, i webbläsaren eller i GitHub.

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
3. **Settings → Environment variables → Add variable:**
   - Name: `WEB3FORMS_KEY`
   - Value: din Web3Forms access key
   - Kryssa **Encrypt** → **Save**
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

Skapa en ny nyckel på <https://web3forms.com> när som helst — den gamla slutar
då gälla. Uppdatera värdet i Cloudflares Environment variables (och i `.dev.vars`
lokalt).
