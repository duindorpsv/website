# Duindorp SV — Onze Trots prototypes

Five complete interactive design directions in one Next.js App Router codebase:

- `/clubmuur` — painted club poster with a layered player portrait
- `/v-line` — original kit and V geometry
- `/clubhouse` — community bento and practical shortcuts
- `/floodlight` — cinematic match photography
- `/terrace` — supporter editorial with torn-paper composition

Every direction has `/nieuws`, `/teams`, `/wedstrijden`, `/club` subroutes. `/` is the design showcase; `/preview` offers an interactive 390px mobile frame; `/beheer` is the editorial CMS demo.

## Stack

React 19, Next.js 16 App Router-compatible source, Tailwind CSS 4, bundled shadcn/ui Radix controls, TypeScript. Sites' Vinext/Vite build targets Cloudflare Workers. Motion uses CSS transforms, entrance transitions, IntersectionObserver and a full reduced-motion alternative. Fonts are self-hosted.

## Prototype boundaries

- News, fixtures, results, standings, team rosters and training times are demo content, clearly labelled in the UI.
- The CMS edits news in localStorage on the current device only. It has no authentication, shared database or production publication workflow. Reset is available in news management.
- Poll votes are device-local demonstration state; vote totals include explicitly labelled example votes.
- Membership and trial-training flow does not transmit or store submitted contact details.
- Sportlink Club.Data Service is not connected. Production integration requires the club's entitled client ID and an approved data architecture.
- Clubmuur always uses light mode. The other four designs share a device-local theme preference.
- The exact supplied crest is used byte-for-byte, with object-fit: contain, no filters or deformation. Generated player photography follows the supplied Zarautz shirt; small fabric details in generated imagery may differ. Original product shirt and club photography are also used.

## Validation

- TypeScript no-emit compilation passes.
- All local asset references resolve; exact original crest hash verified.
- Browser checks cover desktop concept compositions, light/dark switching, match modal, poll interaction, and responsive previews.
- WebMCP `open_duindorp_team` is feature-detected with input validation and lifecycle cleanup. The available browser reports no document tools, so WebMCP runtime validation is unavailable; it is optional and does not affect normal UI.

Use the project-managed pnpm installation. The standard Sites build and deployment scripts manage the production artifact and source repository.


## Clubmuur — referentie-uitwerking

De route `/clubmuur` is opnieuw opgebouwd vanuit de aangeleverde Clubmuur-visual. De homepage heeft afzonderlijke HTML-elementen voor kop, speler, verhalen, wedstrijd, Walking Football en nieuws. De originele clubbadge in `public/assets/logo.png` is ongewijzigd. De overige vier conceptroutes en hun functies zijn behouden.

De uitknipfoto, losse brushletters en witte muurtextuur zijn met de ingebouwde imagegen gemaakt op basis van het aangeleverde beeldmateriaal; de speler behoudt de Zarautz-opdruk. De nieuwe bestanden zijn voor het web gecomprimeerd. Het jongere spelersportret en de Walking Football-foto zijn aangeleverde beelden.

Clubmuur gebruikt vast wit/blauw, met de blauwe Clubband-header. De mobiele navigatie staat onderin. Nieuws-, wedstrijd-, team- en aanmeldvensters gebruiken de bestaande toegankelijke dialogen. Wedstrijden, standen, stemmen en CMS blijven prototypegegevens; Sportlink en een productie-CMS zijn nog niet aangesloten.

Gecontroleerd: TypeScript, desktop en 390px mobiele compositie, beide kleurmodi, wedstrijdvenster, teamvenster en nieuwsvenster.

## Clubmuur — viewport en premium hero

De desktophero gebruikt `100svh` minus de headerhoogte, met een aparte gridrij voor de blauwe clubbalk. De kaarten hebben begrensde gridrijen en blijven boven de balk. Bij zeer lage vensters (onder 700px) groeit de pagina mee om tekst en bediening bereikbaar te houden. Op mobiel eindigt het openingsbeeld boven de vaste navigatie; verhalen en wedstrijdkaarten volgen eronder.

De eigen Clubmuur-header heeft een kleiner origineel embleem, compacte navigatie, themaknop en mobiel menu. De kaarten combineren zachte randen, gelaagde schaduwen en transparante accenten. CSS verzorgt de brush-reveal en hoverovergangen; een op requestAnimationFrame begrensde pointerbeweging geeft het beeld lichte diepte. `prefers-reduced-motion` schakelt de beweging uit.

Gecontroleerd op 1024×768, 1366×768, 1920×1080, 390×844 en 360×740: balkpositie, kaartgrenzen, horizontale overflow, beide kleurmodi, mobiel menu, aanmelden, wedstrijd- en Walking Football-vensters. TypeScript zonder uitvoer geslaagd.

## Clubmuur — headerstudie en verwisselbare hero-vakken

`/headers` toont zes echte CSS-headerconcepten: Signatuur, Clubblauw, Tribune, Vaandel, Middenstip en Kustlijn. De showcase toont elke header met dezelfde context en heeft een werkende desktop-/mobielpreview. Via `/clubmuur?header=vaandel` (of een ander gevalideerd ontwerp-ID) wordt het ontwerp aan de pagina doorgegeven. De standaard is inmiddels Clubband (07). Clubnaam/slogan en EST. 1950 hebben identieke boven- en ondergrenzen.

De vier hero-vakken staan in één grid met twee gelijke kolommen en twee gelijke rijen. Ze gebruiken lichte schaduwen. De speler wordt met `object-fit: contain` kleiner getoond; de muur gebruikt de volledige achtergrondafbeelding. De blauwe balk begint links met “ONZE CLUB. ONZE TROTS.” in zwaar letterbeeld met een decoratief SVG-textuurmasker. De tekst blijft echte, toegankelijke HTML.

`lib/clubmuur-config.ts` definieert vier vaste posities en een getypeerde inhoudskeuze. `HeroTile` rendert pagina-, nieuws-, team- en wedstrijdinhoud. In `/beheer` staat “Clubmuur · Hero”: elke positie krijgt een inhoudstype, bestemming, titel, bovenregel, beeld en foto-/splitweergave. Validatie beperkt links en afbeeldingen tot de bekende pagina's en bestanden. Een later productie-CMS kan de data-adapter vervangen; de renderers en posities kunnen blijven bestaan.

Deze CMS-uitbreiding gebruikt, net als de bestaande nieuwsdemonstratie, lokale browseropslag. Het is geen gedeelde productiepublicatie. Opslaan ververst de huidige sessie en andere tabbladen; herstellen heeft een bevestiging. Bij verwijderde voorbeeldcontent vraagt de editor om een nieuwe bestemming.

Gecontroleerd: TypeScript zonder uitvoer, zes desktopheaders, EST-uitlijning, gelijke kaartmaten en balkpositie bij 1366×768 en 1363×936, mobiele 390×844-preview met 2×2-vakken, variantselectie, teamvenster, en CMS opslaan → herladen → correcte nieuwe titel/paginalink → oorspronkelijke inhoud hersteld. Voor vensters lager dan 740px mag de desktophero groeien om de bediening beschikbaar te houden.

## Clubmuur — blauwe Clubband-header

Clubband (07) is de nieuwe standaardheader en staat ook in `/headers`. De header gebruikt dezelfde muurtextuur, blauwe verflaag en 3px boven- en onderranden als de onderste clubbalk. De navigatie heeft de compacte Barlow Condensed-typografie van Tribune (03): HOME, ONZE CLUB, ONZE TEAMS, WEDSTRIJDEN en MEDIA. MEDIA opent het bestaande nieuws- en verhalenoverzicht. De witte knop Lid worden staat rechts; op mobiel staat aanmelden in het menu.

DUINDORP SV en de drie delen van de slogan hebben exact dezelfde breedte. De zichtbare letterranden van EST./1950 delen de boven- en ondergrens met de naam/slogan (36px desktop, 27px mobiel). De vier lokale fontdefinities hebben metriek afgestemd op de werkelijke glyphranden, inclusief ronde overshoot; de compacte regelhoogtes schalen met het letterformaat. Hierdoor wordt de witruimte binnen de oorspronkelijke fontregels niet langer mee uitgelijnd. Het originele logo blijft ongewijzigd. De themaknop is verwijderd; Clubmuur blijft licht, ook bij een opgeslagen donkere voorkeur uit een ander ontwerp.

De onderste balk gebruikt Barlow Condensed 900 in rechte, zware hoofdletters met een verweerd grungemasker, afgestemd op de referentie. De tekst blijft selecteerbare HTML. ONZE CLUB. ONZE TROTS. staat links, gevolgd door een korte witte lijn van 4px; SINDS 1950 staat rechts. Op desktop heeft de inhoud 20% ruimte aan beide zijden; op mobiel schaalt de balk naar kleinere marges. De viewportverdeling en het 2×2-CMS-grid blijven intact.

Gecontroleerd: TypeScript, zeven headers zonder overlap in de showcase, uitlijning van naam/slogan/jaartal, CTA en mobiel menu, MEDIA-bestemming, vaste lightmode bij opgeslagen darkmode, gelijke kaartmaten en een balk die eindigt op 768px respectievelijk 936px. Mobiel eindigt de balk op 778px boven de vaste navigatie in de 390×844-preview.

De optische uitlijning is in de browser gecontroleerd: op desktop beginnen DUINDORP SV en EST. op pixelrij 26; de slogan en 1950 eindigen beide op pixelrij 61. De mobiele variant gebruikt dezelfde fontmetriek op kleinere grootte.

## Clubmuur — één clubblauw en rechte grungeletters

`--cm-club-blue: #03438a` is de gedeelde kleur van de Clubband-header, onderste balk, herotekst, slogans, knoppen, wedstrijdkop en Walking Football-tekst. Gekleurde knopgradients zijn vervangen door dezelfde egale kleur. De muurtextuur blijft zichtbaar in de header en balk; de extra schaduwwerking gebruikt neutrale transparantie. De witte tekst op blauwe vlakken en de originele clublogo’s blijven intact.

De ONZE TROTS-brush gebruikt de alpha van het bestaande beeld als CSS-masker en krijgt zijn kleur rechtstreeks uit dezelfde variabele. De vorm, positie en reveal-animatie blijven behouden; de kop heeft toegankelijke HTML-tekst. De onderbalk heeft rechte Barlow Condensed 900-hoofdletters, lichte slijtage en dezelfde tekst, lijn, marges en SINDS 1950.

Gecontroleerd in de browser: de blauwe voorgrond- en achtergrondkleuren van de hero-onderdelen zijn alle rgb(3, 67, 138); de onderste tekst gebruikt gewicht 900. De hero behoudt zijn viewporthoogte.
