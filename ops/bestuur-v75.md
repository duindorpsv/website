# Clubbeheer → Bestuur v75

Deze module vertaalt de bestuursreferentie v75 naar de bestaande Next.js-, Supabase Auth- en PostgreSQL-architectuur. De browser bewaart geen bestuursdatabase en biedt geen rolwisselaar. Nieuwe bestuursgegevens beginnen leeg. Voorbeeldpersonen en dossiers staan uitsluitend in de geïsoleerde testfixtures.

## Bronkaart

| Referentie onder `prototype-bron/` | Implementatie |
| --- | --- |
| `components/club-cms.tsx` | `components/club-cms.tsx`: Clubbeheer → Bestuur, `/beheer#bestuur` |
| `components/cms/board/workspace.tsx` | `components/cms/board/workspace.tsx`: voorstellen, versies, dossiers en portefeuilles |
| `components/cms/board/role-overview.*` | Gelijknamige component en CSS: werkvoorraad, filters, planning en overdracht |
| `lib/cms/board-work.ts` | `lib/cms/board-work.ts`: afgeleide taken met concrete schermbestemming |
| `components/cms/board/meetings.*` | Gelijknamige component en CSS: agenda, aanwezigheid, behandeling en notulen |
| `components/cms/board/followup.tsx` | Gelijknamige component: besluitenregister en individuele/commissieacties |
| `components/cms/board/alv.*` | Gelijknamige component en CSS: voorbereiding, vaststelling, zaalbeeld en tellingen |
| `lib/cms/board.ts`, `board-schema.ts` | Productietypes, leeg model, validatie en servergestuurde overgangen onder `lib/cms/board*` |
| Lokale CMS-opslag en clientexport | `components/cms/board/server-workspace.ts`, `lib/server/board*`, `/api/cms/board` en beveiligde PDF-route |
| Demo-identiteiten en migratiehelpers | Bestaande `cms_memberships`, `cms_grants`, `cms_person_accounts` en actuele commissies; fixtures uitsluitend onder `tests/helpers/` |
| Import-/restorevoorbeelden | Bestaande volledige PostgreSQL-back-up en restoreprocedure; geen browserimport van bestuursgegevens |

## Toegang en inrichting

De migratie voegt vier rollen toe: **Bestuur · Voorzitter**, **Bestuur · Secretaris**, **Bestuur · Bestuurslid** en **Bestuur · Commissielid**. Zij wijst geen bestaand account automatisch toe. Een beheerder kan bij **Gebruikers & rollen** een bestaande gebruiker koppelen aan de passende rol. Ieder workflowaccount heeft een actieve persoonskoppeling nodig.

`board/read` geeft moduletoegang; precies één expliciete `board/chair`, `board/secretary`, `board/member` of `board/committee` bepaalt de workflowrol. `board/manage` geeft inrichtingstoegang. Een beheerderswildcard maakt een account niet automatisch voorzitter of secretaris. De rolleneditor bewaart deze bestuursrechten apart van algemene CMS-acties.

De server leidt het account af uit de bestaande achtcijferige OTP-sessie. Iedere read, mutatie en PDF-aanvraag controleert de actuele sessie, actieve toegang, persoonskoppeling en commissie. Een commissielid ziet eigen voorstellen en eigen of relevante commissieacties. Een commissiekoppeling geeft geen eigenaarschap over de individuele opdracht.

## Opslag, versies en herstel

Migratie `0026_board_workspace.sql` voegt `cms_board_state`, `cms_board_operations`, `cms_board_private_notes` en `cms_board_revisions` toe. Alle vier hebben RLS en zijn afgeschermd voor de openbare Supabase-API-rollen. De bestaande beperkte backendrol gebruikt de serverlaag. Bestaande CMS-inhoud wordt niet herschreven.

De gedeelde administratie gebruikt een serverversie, transacties, een vergrendeling en een operationele idempotentiesleutel. Een verouderde aanvraag krijgt een conflictmelding. Herhalen na een verloren antwoord gebruikt dezelfde aanvraag. Een statusovergang en zijn vervolgobjecten worden samen opgeslagen. Historie en idempotentiebewijs zijn niet overschrijfbaar.

Privénotities worden afzonderlijk op account én persoon opgeslagen. De algemene administratie, revisies, auditdetails en exports bevatten hun tekst niet. Snapshot- en bronintegriteit worden op de server gecontroleerd. Ingediende voorstelversies, ingediende/goedgekeurde notulen en vastgestelde agenda's blijven herleidbaar tot tekst, versie, actor en tijdstip.

Datums en tijden voor vergaderingen en peildatums volgen `Europe/Amsterdam`; auditgebeurtenissen gebruiken de bestaande UTC-conventie. Jaaragendakoppelingen beginnen intern en ongepubliceerd; berichtkoppelingen blijven concepten. De gewone publicatie- en verzendroutes behouden hun eigen rechten.

Gebruik voor herstel de bestaande volledige database-/mediaback-up en de geïsoleerde restoretest uit [rollback-and-restore.md](rollback-and-restore.md). Een schema- of UI-rollback verwijdert geen bestuursgegevens en voert geen destructieve downmigratie uit.

## Verificatie en integratie

De gerichte tests gebruiken afzonderlijke fictieve accounts voor Mara, Iris, Joris en Liv en een lokale Supabase-stack met mailopvang. De browsercontrole behandelt de overdracht op 390 px en de beschikbare werkruimte op 320, 390, 524, 768, 1024 en 1440 px. Containers schakelen volgens v75 op 540, 721 en 780 px; de desktopcontrole behoudt de CMS-zijbalk.

Controleer naast de gewone build, typecontrole en CMS-tests ook directe aanvragen, ingetrokken toegang, privénotities, de andere bevestiger bij een ALV-telling, dubbele aanvragen, gelijktijdige beoordelingen, snapshotintegriteit en migratie over bestaande inhoud. Leg echte uitkomsten en eventuele resterende afwijkingen vast in de oplevering; lokale tests bewijzen geen uitgevoerde staging- of productiedeployment.

De opdrachtgever heeft op 9 november 2026 expliciet gekozen voor een rechtstreekse productie-uitrol via de bestaande GitHub-releaseprocedure. De vereiste checks, immutable image, releasebinding, back-up, migratie, readinesscontrole en productie-gate blijven van kracht. De afzonderlijke stagingomgeving wordt voor deze uitrol overgeslagen; claim daarom geen uitgevoerde live stagingacceptatie. De algemene staginginrichting blijft beschreven in [staging.md](staging.md).
