# Mollie · accountinrichting en betaalroutes

De centrale inrichting staat onder `/beheer?koppeling=mollie#instellingen`. Alleen een actieve gebruiker met clubbrede instellingenrechten kan deze lezen of wijzigen. Sponsorbeheer of donateursinstellingen geven dat recht niet. De instellingen worden uitsluitend als privéwerkversie opgeslagen in `cms_records`, singleton `site-mollie`, module `mollieSettings`; gewone clubinstellingen vervangen deze registratie niet. Er staan geen sleutels in dit record of in de browser.

`paymentsEnabled` en `executionAllowed` blijven letterlijk `false`. Deze oplevering activeert geen betalingen, schrijft niet in het Mollie-portaal en bevat geen echte Mollie-credentials. Een routevoorbeeld maakt geen betaalpoging aan. Een catalogus bevat uitsluitend daadwerkelijk opgehaalde providergegevens; er is geen knop die demoprofielen als echte verbinding laadt.

## Beheerde toegang

De server accepteert uitsluitend de vaste namen `MOLLIE_TEST_TOKEN` en `MOLLIE_LIVE_TOKEN`. Elke naam vereist de overeenkomstige serverconfiguratie `MOLLIE_TEST_BINDING` of `MOLLIE_LIVE_BINDING`. De metadata is een JSON-object met:

| Veld | Betekenis |
| --- | --- |
| `clubId` | Letterlijk `duindorpsv`. |
| `organizationId` | De door de beheerder gecontroleerde echte Mollie-organisatie-ID. |
| `mode` | `test` of `live`, passend bij de vaste variabelenaam. |
| `authMode` | `advanced-token` of `profile-api-key`. |
| `credentialKind` | `advanced-access-token`, `oauth` of `profile-api-key`. |
| `currentProfileId` | Leeg voor onbeperkte organisatietoegang; anders het gecontroleerde vaste profiel. Verplicht voor een profielsleutel. |
| `scopes` | Alleen werkelijk toegestane `organizations.read`, `profiles.read`, `balances.read`, `payments.read`, `payments.write`. |
| `testmodeParameter` | Alleen `true` als deze concrete credential de modusparameter toestaat. Voor een gewone profielsleutel altijd `false`; een modusgebonden advanced token kan `false` vereisen. |

Dit is vertrouwde operatorconfiguratie. De browser kan deze binding of een willekeurige procesvariabele niet kiezen. De binding-ID is een HMAC over de metadata met de geheime credential; een sleutel- of bindingswijziging maakt oude catalogi en profiel-balansregistraties onbruikbaar. Bij iedere synchronisatie met organisatietoegang haalt de server eerst `GET /v2/organizations/me` op met `organizations.read`. Alleen een providerantwoord met `resource=organization` en exact de vastgelegde organisatie-ID geeft toegang tot het ophalen van de inventarissen. Een mismatch blokkeert de hele synchronisatie zonder de bestaande catalogus te overschrijven. De betaalroute gebruikt daarna deze providergecontroleerde organisatiebinding; een sleutel- of scopewijziging vereist opnieuw synchroniseren. Organisatiecontext wordt niet als een niet-bestaand veld op een betaalresponse gepresenteerd.

De bestaande hostinghelpers gebruiken onveranderlijke configuratiegeneraties en een vaste lijst toegestane GitHub Environment-namen. **Deze vier nieuwe namen worden nog niet door de bestaande workflows doorgestuurd.** Eerst moeten de hostbeheerder en een reviewer de configuratiegeneratie, de invoercontrole en private runtime-overdracht uitbreiden; daarna kunnen passende, afzonderlijke test/live-credentials veilig worden aangeleverd. Voeg de namen niet alleen aan de workflow toe: de oude hosthelper weigert onbekende configuratiesleutels. Dit is een resterende aansluitstap, geen uitgevoerde accountverbinding. Ontbrekende toegang laat de koppeling zichtbaar uit.

## Catalogus en bewijs

Na verificatie van de werkelijk geauthenticeerde organisatie volgt de server met organisatietoegang alle pagina's van `GET /v2/profiles` en `GET /v2/balances`. De providerstatus `verified/unverified/blocked` komt uit het profiel; `active/inactive`, valuta en modus komen uit de balans. Profielmodus wordt gecontroleerd uit het providerprofiel. Voor een organisatiecredential die testmodusparameters gebruikt, leest de adapter ieder profiel via het modusgebonden detailendpoint: de profielenlijst publiceert zelf geen `testmode`-parameter. Afwijkende of ontbrekende modi worden geweigerd.

`canReceivePayments` is een expliciete normalisatie: een geverifieerd profiel én minstens één door `GET /v2/methods` als `activated` gemelde methode. Daarom vereist de catalogus ook `payments.read`. Profielstatus alleen bewijst dit niet. De adapter stuurt voor een gewone profielsleutel geen `profileId` of `testmode`; organisatietoegang gebruikt alleen de toegestane parameters. De adapter verwerkt meer dan 200 records en stopt bij 10.000 records of 1.000 pagina's met een concrete fout. Bij een fout, verkeerde modus, ongeldige volgende pagina, herhaalde ID, gewijzigde binding of ingetrokken recht blijft de vorige catalogus behouden. Publicatie gebeurt pas na volledige ophaling in één database-transactie.

Een gewone profielsleutel leest alleen `/v2/profiles/me` en de eigen beschikbare betaalmethoden. Zij kan de organisatie niet via het organisatietoegang-endpoint verifiëren en geen organisatiebrede balansinventaris ophalen. Het scherm toont daarom **Profiel gelezen** en de ontbrekende saldotoegang; een route kan niet worden aangezet zolang een actuele, passende balansinventaris ontbreekt. De applicatie verzint geen primaire balans of profiel-balanskoppeling. Gebruik voor de volledige inrichting passende organisatietoegang.

De afzonderlijke lijsten bewijzen geen profiel-balansrelatie. Een gebruiker registreert de al in Mollie gecontroleerde koppeling met herkomst en datum; de server legt deze vast als `manual`, met een auditregistratie van de actor. Er wordt geen `provider`-bewijs gegenereerd uit namen, volgorde of overeenkomstige IDs. Dit bewijst geen bankrekening of uitbetaling. Eén profiel, één gedeeld saldo of slechts één ingerichte stroom geeft geen bewijs van gescheiden saldi.

Routes vereisen een catalogus van maximaal 24 uur oud, maximaal vijf minuten toekomstige klokafwijking, een bekende ingeschakelde stroom, een bruikbaar profiel, een passende credentialbinding en een geregistreerde actieve EUR-balans in dezelfde omgeving. Er is geen automatische terugval. De vaste codes zijn `sponsors`, `donations` en `webshop`; `donors` blijft uitsluitend de bestaande factuurnummerbron.

## Verificatie en primaire documentatie

Unit: `tests/unit/mollie-settings.test.ts` controleert onder meer 251 profielen, meerdere balanspagina's, ontvangstmogelijkheden, scopefouten, ongeldige paginaverwijzingen, credentialrotatie en test/live-afscherming. Integratie: `tests/integration/mollie-settings.test.ts` gebruikt de geïsoleerde lokale Database/Auth en bewijst werkelijke rechten, herladen, atomair bewaren, intrekking tijdens synchronisatie, veilige samenvattingen, behoud bij algemene clubwijzigingen en bindingsrotatie. Providerantwoorden in deze tests zijn expliciete lokale testadapters; er worden geen Mollie-netwerktransacties uitgevoerd.

De adapter is opnieuw gecontroleerd tegen de op 6 november 2026 beschikbare OpenAPI-definities die in deze officiële Markdown-documenten zijn opgenomen:

- [Authenticatie en modus-/profielgebonden advanced tokens](https://docs.mollie.com/reference/authentication.md).
- [Werkelijk geauthenticeerde organisatie en `organizations.read`](https://docs.mollie.com/reference/get-current-organization.md).
- [Profielenlijst, paginering en scopes](https://docs.mollie.com/reference/list-profiles.md).
- [Profielobject, `mode` en `status`](https://docs.mollie.com/reference/get-profile.md).
- [Huidig profiel van een profielsleutel](https://docs.mollie.com/reference/get-current-profile.md).
- [Balansenlijst en modus](https://docs.mollie.com/reference/list-balances.md).
- [Balansobject, verplichte `mode`, `currency` en `status`](https://docs.mollie.com/reference/get-balance.md).
- [Betaalmethoden, `activated`, `profileId` en credentialgebonden `testmode`](https://docs.mollie.com/reference/list-methods.md).
