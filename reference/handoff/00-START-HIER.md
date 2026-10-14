# Duindorp SV overdracht aan Codex

Opdracht van 13 oktober 2026. Bouw het bestaande Duindorp SV concept op de development-VPS uit tot een gedeeld, productiegeschikt CMS. Behoud de bestaande website en vormgeving. De nieuwe paginabouwer bestaat uit werkelijk versleepbare rijen met één of maximaal twee kolommen, waarin widgets kunnen worden geplaatst en verplaatst.

## Eerst lezen

1. `STARTPROMPT-CODEX.md` is de uitvoeropdracht om in Codex op de development-VPS te gebruiken.
2. `01-PRODUCT-EN-CMS.md` legt de scope en vaststaande inhoudelijke keuzes vast.
3. `02-BRONCODE-EN-MIGRATIE.md` beschrijft de werkelijke bron, datamigratie en platformafhankelijkheden.
4. `03-PAGINABOUWER.md` is het bouwcontract voor rijen, kolommen en widgets. `examples/page-layout-v2.json` toont het gewenste opslagformaat; `examples/paginabouwer-schema.svg` laat de indeling zien.
5. `04-SERVERCONTRACTEN.md` beschrijft API-gedrag, publicaties, rechten en achtergrondtaken.
6. `05-VPS-EN-DEPLOYMENT.md` beschrijft de ontwikkeling en releaseprocedure op de bestaande hosting-VPS.
7. `06-ACCEPTATIE-EN-FASERING.md` bepaalt wanneer de bouw afgerond is.
8. `07-OMGEVINGSINVENTARIS.md` bevat de gegevens die Codex op de servers en in GitHub moet vaststellen.

## Meegeleverde bron

`broncode/` bevat de volledige getrackte broncode inclusief afbeeldingen en lockfile, afkomstig van Sites-versie 44, commit `e91ed87f3e5917f286885c6593fe397f8e67cdf4`. Het is een broncodesnapshot zonder Git-authenticatie of `.git`-geschiedenis. `SOURCE-MANIFEST.json` legt herkomst en telling vast; `SHA256SUMS.txt` legt de integriteit van alle meegeleverde bestanden vast.

Visuele referentie: https://duindorp-onze-trots.dgwebserv.chatgpt.site. Beheerconcept: `/beheer`. De recentere narrowcastinguitwerking in versie 44 is meegenomen en moet behouden blijven.

Browserwijzigingen en zelf geüploade foto's van de eigenaar staan niet in deze broncodesnapshot. Exporteer die vanuit het huidige CMS in de browser waarin ze zijn gemaakt, inclusief uploads. Bewaar dit exportbestand privé, importeer het eerst op development, en controleer volledigheid. Er is in dit pakket geen toegang tot die browserdata, de VPS'en of de doelrepository.

## Opdracht en status

Dit pakket is de overdracht voor implementatie. De nieuwe paginabouwer, gedeelde database, echte accounts en deployments zijn hiermee nog niet gebouwd of op een VPS uitgevoerd. De bron is het werkende concept; de documenten zijn de bouwopdracht. Voorbeelden zijn uitdrukkelijk ontwerpen en krijgen pas na implementatie en controles een plaats in de doelrepository.

De uitvoerroute is development-VPS → GitHub `main` → `staging` → `production`. Een push naar `main` publiceert niets. De staging- en production-deployments gebruiken afzonderlijke self-hosted runners op de bestaande static-websites-VPS. Deze CMS-website krijgt daar een serverruntime; een map met statische HTML alleen is onvoldoende.

De meegeleverde `referentie/DartsPoint-VPS-handleiding.docx` is de ongewijzigde aangeleverde infrastructuurreferentie. De Duindorp-overdracht gaat voor bij verschillen. Installeer geen nieuwe DartsPoint-server, neem geen DartsPoint-domeinen, poorten of spelserver over en voer geen serverbrede herinstallatie uit op de bestaande websites-VPS.

De bestaande `broncode/README.md` en oude ontwerpbestanden zijn historische broninformatie. De documenten in de hoofdmap van dit pakket bepalen de nieuwe opdracht. Huidige feiten, voorgestelde technische keuzes en nog vast te stellen omgevingsgegevens zijn apart benoemd.

## Praktische start

Pak dit pakket uit op de development-VPS, geef Codex toegang tot de uitgepakte map en de bedoelde GitHub-werkmap, en plak `STARTPROMPT-CODEX.md`. Laat Codex de bestaande repository inspecteren voordat bestanden worden overgenomen. Een bestaande repository en lokale wijzigingen mogen niet worden overschreven met een blinde kopie. Gebruik een featurebranch of geïsoleerde werkmap en voeg het resultaat na controles samen naar `main`.

De bouwopdracht is al gegeven. Codex kan reguliere implementatiekeuzes zelf maken en doorwerken. Alleen werkelijk ontbrekende toegang of een extern gegeven dat niet uit de omgeving is vast te stellen vraagt aanvullende invoer. Ontbrekende Sportlink- of mailtoegang blokkeert het overige CMS niet; die integratie blijft dan zichtbaar uitgeschakeld met een concrete resterende taak.

