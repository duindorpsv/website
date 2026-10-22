# Databaseverkeer beperken

De eigenaar bevestigde op 22 oktober 2026 dat Supabase voor project `duindorpsv-website` 49,98 GB egress toont. De piek op de screenshot betreft Shared Pooler Egress: database-antwoorden van Supabase naar de VPS. Dit is geen meting van het afbeeldingsverkeer vanuit Hetzner S3. [Supabase: egress meten en beperken](https://supabase.com/docs/guides/platform/manage-your-usage/egress).

De productiecode bevatte twee concrete versterkers: `generateMetadata` en de pagina lazen ieder de brede CMS-inhoud, en publieke `SELECT *`-queries haalden ook concept-JSON op. Het CMS deed bij de eerste synchronisatiemelding bovendien opnieuw dezelfde bootstrap. De precieze verdeling van het historische verbruik over pagina’s, CMS, Sportlink en backups is niet gemeten: het productieproject is niet toegankelijk via de huidige gekoppelde Supabase-organisatie. De nieuwe tests gebruiken een afzonderlijke lokale/GitHub Supabase-stack en veroorzaken geen egress op dat productieproject.

## Wat de verbetering doet

- Metadata en pagina delen één publieke lezing binnen een renderverzoek met React `cache`.
- De VPS bewaart één publieke websitesnapshot en één publiek archiefsnapshot. Elke lezing controleert eerst alleen `cms_domain_revision.version`. Veranderde versies verversen de inhoud direct. De kopie wordt ook opnieuw gelezen bij een nieuwe Nederlandse/UTC-kalenderdag of het verlopen van de eerstvolgende uitlichting. Bij ongewijzigde inhoud is er een veiligheidsbovengrens van zes uur, zodat een periodieke volledige download niet iedere paar seconden terugkomt.
- Triggers in migratie 0020 verhogen deze versie binnen dezelfde transactie als de bronwijziging. Ook afdelingen, redirects, planningsmigratie, teams en de archieftabellen zijn gedekt. Wijzigingen in een andere web-/workerverbinding maken de kopie dus ongeldig.
- Een read-only repeatable-read-transactie houdt versie en inhoud bij elkaar. Gelijktijdige bezoekers delen een lopende opvraging. Fouten worden niet gecachet en iedere caller krijgt een onafhankelijke kopie.
- Publieke CMS-/hero-/archiefqueries halen de bewerkbare documenten niet op. Alleen de annuleringsstatus van een activiteit wordt nog uit het concept geprojecteerd, omdat een annulering direct publiek moet gelden. Publieke afdelingsqueries halen geen interne e-mailadressen op.
- Private CMS-inhoud, registers, sessies en bedrijfsdocumenten gebruiken deze cache niet. Rechtencontroles en private bestandsautorisatie blijven bij elke handeling gelden. De eerste CMS-synchronisatiemelding herhaalt de al ontvangen bootstrap niet meer.

Dit voegt geen databaseverbindingen of verplichte instellingen toe. Backups vóór een deployment blijven verplicht; die beveiliging wordt niet uitgezet om verkeer te besparen. `pg_dump` via de pooler telt ook als egress.

## Bewijs en vervolgmeting

`tests/integration/public-egress.test.ts` gebruikt echte PostgreSQL, het beperkte runtime-account en een tweede verbinding. De test controleert minder ontvangen documentbytes, tien cachehits na één eerste lezing, directe zichtbaarheid van een wijziging en intrekking, geïsoleerde kopieën en de afhankelijkheidstriggers. Het fictieve meetrecord bevat bewust een groot concept: de gemeten bytebesparing daarvoor is geen schatting van de besparing op productie. Het artifact `verification/egress-proof.json` bevat de reproduceerbare meting.

De volledige bestaande integratie-/browsersuite controleert daarnaast publicatie, planning, fotoalbums, archief, formulieren en sponsorprofielen. De build wordt voorbereid zonder productie-uitrol. Tot een latere expliciet gevraagde deployment verandert het productiegebruik niet.

Na die deployment:

1. Selecteer in Supabase Usage expliciet `duindorpsv-website` en vergelijk Shared Pooler Egress per dag. De dashboardgegevens verversen ieder uur.
2. Bekijk Query Performance op veel aanroepen en veel teruggegeven rijen. Controleer naast publieke CMS-query’s ook Sportlink-foto’s, beheerbezoeken en de omvang/aantallen databasebackups wanneer het verkeer hoog blijft.
3. Meet tijdens normaal websiteverkeer. De al verbruikte 49,98 GB verdwijnt niet door een codewijziging; de ingreep beperkt nieuw verkeer en de teller begint opnieuw bij de volgende gebruiksperiode.

Er wordt geen maandverbruik of abonnementskostenbesparing gegarandeerd zonder die productiemeting. Er is geen abonnement, Spend Cap of productiecredential gewijzigd.
