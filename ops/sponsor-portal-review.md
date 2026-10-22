# Controleverslag sponsorportaal en register

Datum: 22 oktober 2026. Referentie: OnzeTrots/Sites versie 61, broncommit `a9757baadcd2897be790e12edcdc84f1d389c337`. Bestaande applicatiebasis: `a71de3c3f6c99a1e9428b47a9c0053d9e2d9e426`. Uitvoeringsafspraak: productiebuild voorbereiden, geen staging en geen productie-uitrol. Er zijn geen productieaccounts, overeenkomsten, betalingen, databasegegevens of GitHub Environment-waarden gewijzigd.

## Uitgevoerde controles

De developmentcontrole gebruikt een afzonderlijke echte PostgreSQL 17-/Supabase Auth-stack met publieke registratie uit en achtcijferige OTP's, het beperkte `duindorp_app`-account en een afgeschermde Resend API-testsink. Alle personen/bedrijven en ondertekeningen zijn fictief. Bestanden zijn lokaal privé opgeslagen; de volledige GitHub-controle gebruikt daarnaast de echte private S3-interface van de geïsoleerde Supabase-teststack. De bestaande developmentdatabase en andere applicaties op de VPS zijn niet gewijzigd.

| Bewijs | Resultaat op development |
| --- | --- |
| Bestaande en nieuwe unitcontroles | 254 geslaagd, 1 bestaande skip |
| TypeScript | geslaagd |
| Host/deployconfiguratiecontroles | 29 geslaagd |
| Productiebuild en runtimebundel voor worker/migratie/provisioning | geslaagd in GitHub CI |
| Gerichte register-/sponsorintegratie | 18 geslaagd |
| Volledige integratiesuite | 110 geslaagd in de volledige GitHub Supabase/S3-/ffmpeg-omgeving; de minimale lokale stack mist deze twee bestaande afhankelijkheden |
| Browserflows | desktop 1440×900, tablet 1024×768 en mobiel 390×844; echte login, bedrijfsconcept, registerpaginering, focus/Escape, private upload, bedrijfswissel en websiteaanvraag naar CRM |
| Herstel vóór schema-upgrade | PostgreSQL custom-backup teruggezet op afgeschermde kopie; 0019 → 0020; bestaand account en canonieke koppeling behouden; geen bedrijven/uitnodigingen aangemaakt |
| Privacy en database-integriteit | 19 private tabellen met RLS, geen provider Data API-grants; beperkte runtime weigert gewijzigde documentbytes/hash, factuurbedragen, definitieve PDF-metadata en onbevestigde handtekeningen |
| Herstel met ondertekend document | oorspronkelijke UTF-8-bytes/hash, twee bewijsrecords en private PDF-bestandshash identiek na daadwerkelijke database-restore |
| PDF-rendercontrole | echte A4-PDF met ingebedde fonts/logo; normale overeenkomst 4 pagina's; stresstest met 28 items, lange partijnaam/voorwaarden en accenten 9 pagina's; geen tekst buiten de pagina; eerste, vervolg- en laatste pagina visueel gecontroleerd |

Een bronrelease of een lokale controle geldt niet als productie-uitrol. De definitieve buildstatus en het onveranderlijke candidate-image worden vastgelegd bij de feature-PR en in `production-candidate.json` van de GitHub-run. De productie-workflow is niet gestart.

## Acceptatiematrix: controlepunten en bewijs

De oorspronkelijke ID's uit het overdrachtspakket blijven hieronder herkenbaar. Vergelijk zichtbare UI met servergedrag; de geïmporteerde prototype-testaantallen gelden niet als bewijs voor deze backend.

| Punten | Controle / bewijs |
| --- | --- |
| R01–R04, R10–R12 | `sponsor-directory.test.ts`: dossier zonder account, gedeeld contactadres blijft twee personen, expliciete basisoverzetting met hetzelfde account-ID, afwijzen uitgewerkt dossier en globale gebruikerskoppeling zonder beheerrecht |
| R05–R09 | echte Supabase-codeactivatie, gehashte eenmalige uitnodiging, onjuist adres, heruitnodiging, reservering van inlogadres, verlopen/onbekende link zonder naamlek, blokkade; scope/rollen worden alleen uit de private uitnodigingsrecord gebruikt |
| R13 | bestaande `AUTH04` en servercontrole op laatste native volledige beheerder vóór accountblokkade |
| R14–R18 | relationele unieke ouder-kindkoppeling, aanvraag zonder kindnaam, expliciete goedkeuring met alleen toegekende teamcontext, intrekking; portalprojectie verwijdert andere verzorgers en private registertabellen; actuele sessie-/rechtencontrole en SSE-contextwisseling |
| R19–R20 | gecontroleerde eigen-clubimport, stabiele bron-ID/upsert, veld-eigendom, lokaal adres en accounts behouden; dubbele bron-ID's/andere club afgewezen; geen verzonnen private leden-API of massale archivering |
| A01–A04 | response bevat alleen minimale sponsorcontactvelden; geen private profielvelden/globale rollen; privé-persoon-ID niet overschrijfbaar; commissie kan alleen bestaande bedrijfskoppelingen wijzigen |
| A05–A08 | bedrijfsgok, marketing naar financiële/tekenacties en commissie naar accountbeheer worden geweigerd; per-bedrijfrolcontrole blijft gelden voor globale beheerders; eigen uploads en documenten zijn niet publiek |
| B01–B09 | browserconcept onvolledige partij, compleet/bevestigd vóór documentvorming; formele wijzigingsverzoeken blijven apart; oude basis wordt geweigerd; vaste documentbytes blijven identiek; verouderde editors krijgen conflict |
| D01–D05 | brongetrouwe template-editor met versie/dupliceren, 22 gevalideerde shortcodes, eenmalige letterlijke vervanging inclusief HTML/shortcode als invoer; verstuurde inhoud onafhankelijk van latere template/catalogus |
| D06–D10 | gehele centen met BigInt-restverdeling, afzonderlijk 0%/vrijgesteld, gemengde btw/termijnen; echte gelijktijdige laatste-plekproef, omzetten telt eenmaal; database-immutabiliteit en daadwerkelijk backup-/JSONB-rondje |
| S01–S04, S07–S10 | afzonderlijke volgorde/actor/partij/adres/documenthash; meegestuurde naam `FORGED` genegeerd; werkelijke sessienaam gebruikt; gewijzigd geverifieerd inlogadres geweigerd |
| S05–S06, S11–S13 | vijf duurzame verkeerde pogingen, vervanging/verloop/replay, gelijktijdige consumptie eenmaal, mailproviderfout geen succes, server-rate-limits en eigen verificatiechallenge |
| S14–S15 | historische bytes en bestaande handtekeningen behouden; enkelvoudig historisch bewijs wordt niet dubbel ondertekend genoemd; PDF vermeldt historische verificatie apart |
| P01–P08 | echte overeenkomst-/factuur-PDF; servercontrole vóór/na genereren/lezen, private definitieve archivering met eigen hash; lange documentrender; factuur pas na twee echte bewijzen; alle termijnen tellen netto/btw/totaal exact op |
| P09 | geen bestaande geverifieerde Mollie-configuratie: zichtbaar uitgeschakeld; browser/fakebetaalcommand geweigerd; handmatige ontvangst met referentie en idempotent verzoek gecontroleerd |
| P10–P12 | publieke veldwhitelist plus publicatievlag/periode, apart redactie-/nieuwsbriefconcept zonder doelgroep of toestemming; onafhankelijke workerherinnering met deduplicatie, actuele ontvangerrechten en provideracceptatielog |
| U01–U06 | bron-TSX/CSS/huisstijl overgenomen; screenshots op drie schermmaten; lange modals, Radix focusbegrenzing/Escape, geen paginabrede overflow; lege/fout/conflictstatus; bedrijf wisselen wist upload/formulier; upload na intrekking geweigerd |
| U07 | gebruikersoverride: geen staging/deployment; volledige bestaande CI plus candidate-image; echte restoreproeven en terugvalprocedure vastgelegd in `sponsor-portal.md` |

## Reproduceerbare controles en bestanden

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
python3 -m unittest discover -s ops/tests -v
# Alleen met de geïsoleerde lokale Supabase-configuratie, nooit productie:
pnpm db:migrate
pnpm exec tsx scripts/provision-database.ts
pnpm db:seed
pnpm test:integration
pnpm build
pnpm build:runtime
pnpm test:e2e
```

De GitHub-workflow start deze geïsoleerde omgeving, test ook de uiteindelijke read-only web-/workercontainers en herstart/readiness, en bewaart `verification`: screenshots, een fictieve daadwerkelijk ondertekende PDF en het candidate-buildbewijs. OTP's, uitnodigingstokens, mail-sinklogs en private env-/accountbestanden worden niet als opleverartifact toegevoegd. Lokale aanvullende PDF-/herstelbewijzen staan onder de genegeerde `.runtime/sponsor-evidence/`.

De enige resterende externe controles zijn de latere, afzonderlijk goed te keuren productie-uitrol met echte DNS, bestaande Supabase/Hetzner/Resend-configuratie en ontvangst in een echte mailbox. Bestaande productiecredentials worden hiervoor niet uit GitHub teruggelezen of in bestanden gekopieerd. Voor dagelijks gebruik, inrichting en rollback: [beheerhandleiding](sponsor-portal.md).
