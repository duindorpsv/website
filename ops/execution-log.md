# Uitvoerlog

## Bron en runtime

- 14 oktober 2026: verzoek en alle specificaties 00–08 gelezen. Pakket bevat Sites v44, commit e91ed87f3e5917f286885c6593fe397f8e67cdf4.
- Alle 583 aangeleverde checksums geverifieerd. Bron ongewijzigd vastgelegd in eerste commit; contractdocumenten in reference/handoff.
- Doelrepository duindorpsv/website gecontroleerd: leeg, ADMIN-toegang, geen workflows. Hosting volgt na development en main volgens eigenaar.
- Eerste baseline zonder geïnstalleerde dependencies: 79 geslaagd, één overgeslagen, importsuite kon zod niet vinden. Herhaling volgt na installatie.
- Node 24.18.0, pnpm 11.25.0. Next 16.3.4, Tiptap 3.31.4 blijven vastgepind. Geen major-upgrade. Zevendaagse dependencywachttijd behouden; S3 SDK en mailversie gekozen buiten de wachttijd. Sites-buildbestanden gearchiveerd, niet als runtime gebruikt.

## Bewijs en afhankelijkheden

Nog geen staging/productiondeployment, browserdatamigratie of externe verzending bewezen. Acceptatiematrix wordt bijgewerkt met daadwerkelijk uitgevoerde controles. Main krijgt geen deploymenttrigger.

## Gedeeld CMS en developmentcontrole

- PostgreSQL/Drizzle met aparte raw/ORM-pools, schema-/JSON-invarianten, immutable revisies/publicaties en relationele rechten/metadata. Eigen database- en testmailcontainers; andere diensten niet gewijzigd.
- Better Auth-accounts, sessie-intrekking, laatste-beheerderbescherming, TOTP, aparte news/storiesacties en team/afdelingsscopes. Geen seedlogins of standaardwachtwoord.
- Rijen/kolommen als één Tiptap-document, echte containers, pointer/menu/touchbediening, undo, duplicatie, rijpatronen en dezelfde preview/publicrenderer. Legacy-archief en compatibiliteit behouden.
- Frozen planning, Europe/Amsterdam/DST-keuze, gecontroleerde ouder/kind-paden, concept/live-scheiding, immutable herstelpunten, idempotente browserimport en versiegebonden rollback.
- Serveruploads/Sharp/private originelen, albums/mediamapping, echte formulierontvangst met historische definitie, private inboxen, outbox/retry/retentie en aparte opt-in/providerstatus. Officiële clubaanmeldroute vervangt de demo-aanmeldstap.
- Laatste controles: 98 unit/regressiescenario’s (97 geslaagd/1 overgeslagen), 15 PostgreSQL-integraties geslaagd, typecheck geslaagd; acht browserproeven geslaagd vóór de definitieve runtimeherhaling.
- Geïsoleerde DB/mediarestore uitgevoerd: login, pagina, echte synthetische upload en oorspronkelijke formulierdefinitie bruikbaar. Private evidence/logs aanwezig. Geen externe backup of productieherstel bewezen.
- Eerdere schoon opgebouwde Node/Docker-images geslaagd; definitieve artifact/runtimeherhaling volgt na de laatste beheercorrecties. Geen GHCR-/staging-/productiedigest als goedgekeurd gemarkeerd.
- Specifieke proef vond en corrigeerde lege-slugreservering, Next-streamingmetadata zonder JS en een achtergebleven developmentworker met eerdere JSON-codering. Constraints voorkomen opnieuw verkeerd gecodeerde object-/arraygegevens.
- Hosting-VPS-installatie, reverse proxy/firewall, runners, staging/production en externe credentials zijn niet uitgevoerd/aangeleverd. Acceptatiematrix in acceptance-report.md benoemt de resterende scenario’s afzonderlijk.
