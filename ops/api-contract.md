# Servercontract

CMS-API's vereisen een door Supabase gevalideerde sessie, waarvan de live provider-sessie en lokale intrekkingsstatus worden gecontroleerd. Mutaties vereisen exact de ingestelde origin. Accountblokkering en wijzigingen van rollen/scopes worden bij elke aanvraag opnieuw gecontroleerd. Productiebeheerders moeten TOTP activeren én de huidige sessie naar AAL2 verhogen. Een opgeslagen factor alleen geeft geen toegang.

`GET /api/cms/bootstrap` levert de toegestane redactionele records en versietokens; geen volledige inzendingsdatabase. Resourcelezingen `/api/cms/{articles,pages,media,albums,people,forms,documents,settings,navigation,hero,narrowcasting}` hebben begrensde lijsten, offset/limit en objectautorisatie. Artikeltypen hebben een expliciet `contentType`-filter.

`POST /api/cms/mutations`: `{operationId: UUID, changes: [{module,id,expectedVersion,action,data?,scheduledAt?}]}`. Acties: save/publish/unpublish/trash/restore/schedule/cancelSchedule. Maximaal 50 wijzigingen per transactie. De server genereert livepublicaties, revisies, routewijzigingen, audit en taken; client-live/revisies zijn niet schrijfbaar. Conflict: 409 met record-ID en verwachte/actuele versie. Validatie: 422 met node/veld. Autorisatie: 401/403.

`GET /api/cms/{module}/{id}/revisions` geeft maximaal 30 onveranderlijke revisies. Herstel kopieert een revisie naar een nieuw concept; publiceren is apart. Preview: `/preview/{id}`, geautoriseerd en noindex, formulieren uitgeschakeld.

Publieke inname: `POST /api/forms/{id}/submissions` met `{operationId,answers:{fieldId:string},website?:honeypot}`. Alleen de actuele live-formulierdefinitie bepaalt soort, afdeling, ontvanger, validatie en bewaartermijn. Een succesvolle 201 betekent duurzaam ontvangen; geen bevestigde externe verwerking. Dezelfde operatie levert dezelfde inzending. Formulierdefinitie, antwoorden en bestemming worden historisch vastgelegd.

Inbox: `GET /api/cms/submissions?kind=contact|registration|request`; details en notities via `/{id}?kind=...`. `POST /api/cms/submissions/{id}` draagt expectedVersion en status/note/assigneeId/externalRef. Afdeling en stroom worden servermatig getoetst. Externe referenties vereisen afzonderlijk beheerrecht en bevestigde handmatige opvolging.

Uploads: multipart `POST /api/cms/media/uploads` (file, teamId, season, folderId). Inhoudscontrole en private originele opslag, vervolgens worker-afgeleiden. `GET /api/media/{id}` toont uitsluitend live-afgeleiden. Geautoriseerde `/api/cms/media/{id}/file?original=true` is een private download.

Accounts: `/api/cms/users`, `/api/cms/users/{id}`, `/api/cms/roles`; laatste beheerder beschermd. Afdelingen `/api/cms/departments`; redirects `/api/cms/redirects`; audit `/api/cms/audit`; integratiefouten `/api/cms/integrations`; gecontroleerde herstart `/api/cms/jobs/{id}/retry`.

Import `/api/cms/imports` ondersteunt dry-run, apply en rollback van v1-browserbackups. Alleen volledige beheerders; originele JSON privé gearchiveerd, bestaande records standaard overgeslagen, geselecteerde vervanging vereist exact versietoken. Browsermedia worden gevalideerd en duurzaam gemapt. Demoaccounts worden geen logins, demoberichten geen echte aanmeldingen. Export `/api/cms/exports` is privé; operationele volledige DB/media-backup en restore zijn afzonderlijke procedures.

Nieuwsbrief: `/api/newsletter` met expliciete toestemming, aparte bevestiging/afmelding en providerstatus. Bevestigen/afmelden worden pas door een expliciete POST uitgevoerd; het openen van de link heeft geen schrijfeffect. Geen automatische inschrijving vanuit contact/aanmelding. Ontbrekende Resend API-/Sportlinktoegang geeft wacht/fout/handmatige opvolging; geen gesimuleerd succes.

Planning gebruikt Europe/Amsterdam, slaat UTC op en vereist bij het dubbele winteruur een keuze. De worker controleert de actuele rechten, scope, referenties en taaklease. Een nieuwe planning/intrekking annuleert de eerdere taak; een latere conceptbewerking verandert de bevroren publicatie niet.

Nieuws- en Verhalenrechten zijn afzonderlijke modules `news`/`stories`. De initiële migratie kopieert bestaande news-grants naar stories om de startersrollen te behouden; beheerders kunnen ze daarna los instellen. Een typewijziging vereist rechten op het bestaande en nieuwe type.

Mediabootstrap bevat maximaal 100 niet-gerefereerde foto’s plus gebruikte centrale referenties. Volgende bibliotheekpagina’s worden afzonderlijk geladen. Lijsten hebben maximaal 100 records per request. Private submissions worden uitsluitend per stroom/afdeling gepagineerd; details toetsen het individuele record.

PDF-documenten kunnen via `/api/cms/documents/uploads` worden opgeslagen. Alleen gecontroleerde PDF-header/afsluiting en maximaal 10 MB; originelen zijn private en publicatie is afzonderlijk. Openbare downloads zijn attachments met nosniff en een sandboxheader. Dit is geen claim van virusscanning of volledige PDF-sanitization. De bestaande Clubdocumentenpagina blijft behouden.


`GET /api/cms/integrations` levert `mailProvider: "resend"` en `mailConfigured` voor de aanwezigheid van API-key en afzender; dit is geen externe verbindingstest. De worker verstuurt alle websitemail via de Resend HTTPS API. HTTP 200 met geldig bericht-ID betekent geaccepteerd, niet bewezen afgeleverd; fouten worden zonder providerbody als retrybare taakstatus opgeslagen.

`GET /api/cms/newsletter` vereist `settings/manage` en ondersteunt q, topic, status, offset en limit (maximaal 100). Alleen abonneegegevens en toestemmingstatus worden teruggegeven, geen tokens/hashes. `POST /api/cms/newsletter/{id}` vereist dezelfde rechten, de juiste Origin en expectedVersion; action is update (name, topics) of unsubscribe. Een beheerder kan geen onbevestigde/afgemelde inschrijving rechtstreeks activeren. Publieke bevestiging maakt lokaal actief; afmelding is direct lokaal. Externe lijstproviders worden niet gebruikt.
