# Geverifieerde Sportlink-planning — 20 oktober 2026

Featurebranch `codex/verified-sportlink-planning`, vanaf productie/main `638a228f8b5bc3d1a12e1d81bf5c1635dfcc5dc4`. Deze opdracht is geen release: geen merge naar main en geen productiedeployment.

De interacties zijn vergeleken met prototypeversie 49, broncommit `74b1e08288b8a076119046dc5c762cfbf98a364c`. Bezetting als standaard, gedeelde bronstatus, thuis/uit en bescherming van geopende bewerkingen zijn in de bestaande productiearchitectuur opgenomen. De fictieve club-/park-ID's, demo-import, simulatieknop, browseropslag en extra prototypepolling zijn niet overgenomen.

## Bronidentiteit en beperkingen

De officiële artikeldefinities van [Club.Dataservice](https://data.sportlink.com/list) leveren een clubcode en teamcode/lokale teamcode. `programma` en `wedstrijd-informatie` documenteren geen stabiele accommodatie-, veld- of kleedkamer-ID's. `wedstrijd-accommodatie` en `wedstrijd-kleedkamers` lossen dit ook niet op. Er worden geen ID's of API-endpoints verzonnen.

De eigen club wordt via dezelfde geautoriseerde club- en teambron bevestigd. Een bestaand CMS-team wordt expliciet gekoppeld. Een park-ID vereist externe verificatie met een vastgelegde verwijzing. Iedere relevante thuiswedstrijd vereist bovendien een expliciete bevestiging van de waargenomen accommodatie binnen dat park. Resourcewaarden worden uitsluitend binnen die bevestigde club-/parkcontext gekoppeld. Zonder die broninformatie blijft automatische eigen resourceboeking geblokkeerd met Mapping nodig; andere verifieerbare wedstrijdgegevens kunnen wel worden verwerkt. Zie [de beheerhandleiding](../../ops/sportlink.md).

## Gerichte verificatie

- Modelchecks: eigen team eenmaal, tegenstander blijft publiek en wordt geen eigen team; conflicterende club/team-ID of onduidelijke lokale teamcode wordt geweigerd; gelijke veldnamen op verschillende parken delen geen identiteit; exacte thuis-/uitkleuren; uitwedstrijd heeft geen eigen veldachterstand; ontbrekende duur wordt niet geschat; gedocumenteerde detaildatum en Amsterdam-wintertijd.
- Echte repositorytransacties op een eigen, tijdelijke PostgreSQL 17-database: idempotente import en queue, private instellingen, expliciete park-/resourcekoppelingen, uit zonder automatische boeking, handmatige nevenruimte behouden, oude `expectedVersion` geweigerd, bronannulering geeft boekingen vrij, bronstoring behoudt de hele planning. Een conflict in een meerwedstrijdenbatch draait ook eerder gestagede reserveringen en alle activiteit-/publicatieversies terug. Een bronupdate past de openbare tijd aan zonder een privéomschrijving mee te publiceren. Een verse detailresponse gaat zonder tweede importactie door dezelfde verwerkingsstroom.
- Browsercontrole met de echte CMS-componenten en provider, twee echte EventSource-clients en uitsluitend synthetische HTTP-presentatiedata: beide schermen ontvangen dezelfde revisie, open tekst blijft behouden, opslaan wordt geblokkeerd, tabkeuze blijft staan, gewone heropening start op Bezetting en een expliciete diepverwijzing blijft geldig. Desktop 1440 px en mobiel 390 px; één H1 en geen horizontale documentoverflow. Het resultaat staat in [browser-result.json](browser-result.json).
- De aanvullende Playwright-test `tests/e2e/planning-live-source.spec.ts` toetst hetzelfde via echte geïsoleerde Supabase-opslag, twee ingelogde browsercontexten, de echte SSE-route en repositoryverwerking. Alleen de externe Sportlink-provider wordt door synthetische responses vervangen. Deze test draait mee in de bestaande PR-workflow, inclusief bestaande Auth-, opslag-, back-up-, runtime- en beveiligingscontroles.

De screenshots tonen gecontroleerde presentatievoorbeelden, geen geslaagde live Sportlink-import of productiegegevens.

| Scherm | Desktop | Mobiel |
| --- | --- | --- |
| Jaaragenda, Thuis/Uit | [Voorbeeld](agenda-desktop.png) | [Voorbeeld](agenda-mobiel.png) |
| Bezetting | [Voorbeeld](bezetting-desktop.png) | [Voorbeeld](bezetting-mobiel.png) |
| Bronwijziging tijdens bewerking | [Voorbeeld](bronwijziging-bewerken-desktop.png) | Zelfde melding en blokkade in responsieve dialoog |

## Belangrijkste gewijzigde bestanden

- Broncontract en identiteit: `lib/server/sportlink-identity.ts`, `lib/server/sportlink-client.ts`, `lib/sportlink-normalize.ts`, `lib/sportlink-team-normalize.ts` en beide publieke serveradapters.
- Centrale verwerking: `lib/server/sportlink-planning.ts`, `sportlink-sync.ts`, `sportlink-config.ts`, `planning-revision.ts`, `records.ts`, `planning.ts`, de lease-/heartbeatverlenging in `worker.ts` en de transactionele principalhercontrole in `permissions.ts`.
- Private API: `app/api/cms/planning/events/route.ts`, `app/api/cms/sportlink/identity/route.ts` en de bestaande instellingenroute.
- Model en beheer: `lib/cms/{types,planning,sportlink-settings}.ts`, `components/cms/{provider,planning-board,locations-manager,sportlink-settings-manager,planning-sync-status}` met bijbehorende stijlen.
- Verificatie: `tests/unit/verified-sportlink-planning.test.ts`, `tests/helpers/sportlink-repository.ts`, `tests/e2e/{planning-live-source,club-planning}.spec.ts`, deze bewijsmap en `ops/sportlink.md`.

Bestaande records, rechten, navigatie, handmatige locaties, publicatiekeuzes en publicatie-ID's blijven behouden. Oudere onzekere koppelingen staan ter beoordeling; deze wijziging verwijdert geen oude imports. Er zijn geen nieuwe GitHub-secrets of tabelmigraties nodig.
