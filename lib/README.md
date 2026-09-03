# curved-carousel

En dragbar remsa av böjda videokort i WebGL. Inga beroenden, inget byggsteg,
en fil. Samma effekt som portföljsektionen på certacode.se.

## Använd den på en ny sajt

**1.** Kopiera `curved-carousel.js` till projektet.

**2.** Lägg en container med en höjd — modulen fyller den:

```html
<div id="work"></div>

<style>
  #work { height: min(88vh, 60vw); }
  .cc-title { font-size: 22px; }
  .cc-tag   { font-size: 12px; letter-spacing:.12em; text-transform:uppercase; color:#767C86 }
  .cc-hint  { font-size: 12px; letter-spacing:.14em; text-transform:uppercase; color:#767C86 }
</style>
```

**3.** Starta den:

```html
<script src="curved-carousel.js"></script>
<script>
  CurvedCarousel.init({
    container: "#work",
    hint: "Dra för att bläddra",
    projects: [
      { title: "Bageri Bohuslän",
        tag: "Bageri · Hantverk",
        poster: "media/bageri.jpg",
        video: { webm: "media/bageri.webm", mp4: "media/bageri.mp4" } }
    ]
  });
</script>
```

Fler projekt = fler rader i `projects`. Listan upprepas automatiskt tills
remsan är lång nog att aldrig visa sin egen skarv, så tre projekt räcker.

## Förbered videorna

Skärminspelningar är alldeles för tunga råa. Krymp dem först
(`ffmpeg`, byt ut `in.mp4`):

```bash
ffmpeg -i in.mp4 -an -vf "fps=30,scale=960:-2:flags=lanczos" -c:v libvpx-vp9 -crf 38 -b:v 0 -row-mt 1 out.webm
```

```bash
ffmpeg -i in.mp4 -an -vf "fps=30,scale=960:-2:flags=lanczos" -c:v libx264 -profile:v main -crf 30 -preset medium -pix_fmt yuv420p -movflags +faststart out.mp4
```

```bash
ffmpeg -ss 3 -i out.mp4 -frames:v 1 -q:v 5 -vf "scale=640:-2" out.jpg
```

Ungefär 500–900 KB per klipp. `webm` för Chrome och Firefox, `mp4` för Safari
— modulen väljer själv. Posterbilden visas tills klippet är igång, så sidan
laddar bara ~20 KB per projekt från början.

Spela in i **samma bildformat** som du sätter i `aspect` (16:9 som standard),
annars blir det svarta kanter.

## Inställningar

| Nyckel | Standard | Vad den gör |
|---|---|---|
| `aspect` | `16/9` | Kortets form. Måste matcha inspelningarna |
| `cardsAcross` | `3.4` | Ungefär hur många kort som ryms i bredd |
| `heightShare` | `0.56` | Största andel av containerns höjd ett kort får ta |
| `gap` | `0.05` | Avstånd mellan kort. Litet = sammanhängande remsa |
| `wave.amplitude` | `0.46` | Hur djupt remsan bågnar bort från betraktaren |
| `wave.perCards` | `2.2` | Våglängd i kort. Lägre = varje kort bågnar mer |
| `wave.vertical` | `0.09` | Mjuk upp/ner-orm |
| `ripple.reach` | `0.30` | Hur långt ringarna når från markören |
| `ripple.strength` | `0.022` | Hur mycket bilden faktiskt förskjuts (0.02 = 2 %) |
| `ripple.frequency` | `15` | Ringarnas täthet |
| `ripple.speed` | `3.2` | Hur snabbt ringarna vandrar utåt |
| `cornerRadius` | `0.12` | Hörnradie, i halva korthöjder |
| `background` | `[0.984,0.980,0.972]` | **Måste matcha sidans bakgrund**, som `[r,g,b]` 0–1 |
| `playAll` | `true` | Spela alla synliga klipp, inte bara mittenkortet |
| `labels` | `true` | Titel och etikett under varje kort |
| `hint` | `null` | Text som tonar bort vid första draget |

`background` är den enda som *måste* ändras på en ny sajt — den används för att
tona bort kort som ligger långt bak, och blir en synlig fyrkant om den inte
stämmer med sidan bakom.

## Att veta

**Storleken styrs av båda måtten.** Kortet begränsas av containerns bredd
*eller* höjd, beroende på vilken som tar slut först. En låg container ger
mindre kort och fler synliga — höj containern om du vill ha färre och större.

**16:9 är brett.** För att bara ~3⅓ kort ska rymmas i bredd krävs en hög
container. Kvadratiska kort får plats på mindre höjd.

**Mobil.** Under 720 px spelas bara ett klipp åt gången — tre samtidiga
videoavkodningar hackar på telefoner.

**Faller tillbaka snyggt.** Utan WebGL, eller när besökaren valt reducerad
rörelse, byggs istället en vanlig scrollbar lista av posterbilderna.

**Stänga av den:** `const cc = CurvedCarousel.init({...})` och sedan
`cc.destroy()`. Rensar lyssnare, observers och DOM — säkert i en SPA.

## Fallgropar jag redan gick i

**Uniformer måste ha samma precision i båda shaders.** `float` är `highp` i
vertex-shadern men `mediump` i fragment-shadern. Skiljer de sig länkar
programmet inte — och felet loggas ingenstans om du inte läser
`getProgramInfoLog`.

**Vänd inte texturen två gånger.** Om UV-koordinaterna redan gör `1 - v`,
sätt inte också `UNPACK_FLIP_Y_WEBGL` — då hamnar allt upp och ner.

**Deformera inte geometrin mot kameran.** I perspektiv blir det som kommer
närmare större, så en hover-bula får kortet att svälla. Deformera
texturkoordinaterna istället: konturen byggs från de odeformerade
koordinaterna och kan då inte röra sig.

**`loading="lazy"` triggar inte i en `display:none`-container.** Reservlistans
bilder sätts därför till `eager` i samma stund som reservläget aktiveras.

**Klipp etikettlagret.** Etiketter för kort som scrollat ut ligger kvar långt
utanför containern och gör sidan bredare än skärmen om lagret inte har
`overflow:hidden`.
