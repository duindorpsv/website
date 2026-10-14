# Omgevingsinventaris voor de uitvoerende Codex

Dit is een werkblad voor de eerste inspectie op de development-VPS. Gegevens zijn nog niet aangeleverd of vastgesteld. Zoek ze eerst in de bedoelde repository, bestaande runbooks en toegankelijke serverconfiguratie. Vraag alleen het werkelijk ontbrekende gegeven aan de eigenaar. Echte geheimen gaan via de secretvoorziening, niet in dit werkblad of de chat.

| Onderwerp | Te bepalen | Wanneer nodig |
| --- | --- | --- |
| GitHub | Exacte OWNER/REPO, clonepad, toegang, huidige branches en workflows | Voor overname/commit/push |
| Development | OS/architectuur, Node/package-manager, bestaande databases en vrije poorten | Voor eerste uitvoering |
| Hosting-VPS | Hostalias/toegangsroute, OS, capaciteit, sites en beheerafspraken | Voor serverinstallatie |
| Proxy | Caddy/Nginx/anders, configuratiepad, reloadprocedure en certificaten | Voor staginghost |
| Domeinen | Development/staging/production URL, gewenste canonical en DNS-beheer | Voor runtimeconfiguratie en livegang |
| Runners | Reeds aanwezige registraties, unieke Duindorplabels, accounts en minimale rechten | Voor GitHubdeployment |
| Branchbescherming | GitHub-plan, beschikbare Environments en vereiste controles | Voor promotie |
| Persistentie | DB-bestemming, S3-compatibele opslag, backupbestemming en groeibudget | Voor backend en media |
| Authenticatie | Eventueel bestaande accountprovider; eerste eigenaaraccount; herstel en MFA | Voor CMS-toegang |
| Browserinhoud | CMS-backup incl uploads; aparte narrowcasting-/menustand indien lokaal aangepast | Voor datamigratie |
| Sportlink lezen | Bestaande toegestane clientconfiguratie en D1-data/export die behouden moet worden | Voor serverport |
| Sportlink aanmelden | Officiële clubtoegang, ondersteunde route, veldmapping en testmogelijkheid | Voor echte ledenregistratie |
| Mail | SMTP/provider, geverifieerde afzender, reply-to, testopvang en afdelingen | Voor echte verzendfunctie |
| Nieuwsbrief | Provider of bestaande lijst, bevestigen/afmelden, importafspraken | Voor nieuwsbrief |
| Bewaarbeleid | Instellingen per formulier, privacytekst, mediarechten en gewenste backuptijden | Voor productiebeheer |
| Release | Gewenste stagingversie en gecontroleerde productionconfiguratie | Voor livegang |

## Defaults om mee door te bouwen

- UI/inhoud in Nederlands; datum/tijdweergave Europe/Amsterdam, opslag in UTC.
- Maximaal twee paginalayoutkolommen per rij; standaard 50/50 en op mobiel onder elkaar.
- Ontwikkel/test met synthetische personen en inzendingen; integreer nog geen echte leden in een demo.
- Productiebackbone zoals beschreven: Next.js Node, PostgreSQL/Drizzle, objectopslag en worker. Hergebruik aantoonbaar passende bestaande voorzieningen.
- Onaangesloten integraties blijven expliciet uit; ontvang beschikbare lokale backendaanmeldingen betrouwbaar met zichtbare wachtstatus.
- Geen publieke testaccount, standaardwachtwoord of automatisch overgenomen demobeheerder.

## Wat het pakket bewust niet beweert

Het pakket bevat geen bevestigde VPS-adressen, domeinnamen voor de nieuwe omgeving, GitHub-doelrepository, inloggegevens, ledenregistratierecht of productiebackups. Die waarden zijn niet uit de DartsPoint-handleiding af te leiden. De bestaande publieke Sportlink-leeskoppeling is iets anders dan een schrijf- of ledenaanmeldcontract.

## Voorrang bij verschillen

De gebruikersopdracht en de documenten in deze hoofdmap bepalen de Duindorp-scope. De oorspronkelijke DartsPoint-handleiding is een voorbeeld voor infrastructuur en releaseprincipes. Broncode laat zien wat het concept nu doet. Een verschil daartussen moet als migratietaak of expliciete technische keuze worden opgelost, niet door een eis weg te laten of een bestaande website-inrichting te overschrijven.

