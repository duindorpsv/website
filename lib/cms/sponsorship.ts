import { domainUid, domainMutation } from './domain-commands';
import type { CmsState, CmsMember } from './types';
import type { Sponsor, SponsorSigningParty, SponsorSigningChallenge, SponsorBusinessDetails, SponsorBusinessChangeRequest, SponsorContractTemplate, SponsorActivity, SponsorAgreement, SponsorContactRole, SponsorInvoice, SponsorItem, SponsorLine, SponsorMembership, SponsorPackage, SponsorProfile, SponsorProposal, SponsorProposalSnapshot, SponsorReminder, SponsorTask, SponsorTotals, SponsorshipState } from './sponsorship-types';
import { canonicalSponsorBusinessDetails, getSponsorBusinessDetails, getSponsorBusinessReadiness, createDefaultSponsorContractTemplate, validateSponsorContractTemplate, renderSponsorContractTemplate, getSponsorContractVariables, sponsorBusinessIdentity } from './sponsor-contracts';
export { getSponsorBusinessDetails, getSponsorBusinessReadiness, createDefaultSponsorContractTemplate, SPONSOR_CONTRACT_SHORTCODES, validateSponsorContractTemplate, renderSponsorContractTemplate, getSponsorContractVariables } from './sponsor-contracts';
const uid = domainUid;
const stamp = () => new Date().toISOString();
const today = () => stamp().slice(0, 10);
const clone = <T,>(value: T): T => structuredClone(value);
export const money = (cents: number) => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(cents / 100);
const emailValid = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
function validLink(value: string, image = false) { return !value || (/^https?:\/\/[^\s<>"\\]+$/i.test(value) || /^\/(?!\/)[^\s<>"\\]*$/.test(value) || (image && /^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(value))); }
function ensure(condition: unknown, message: string): asserts condition { if (!condition)
    throw new Error(message); }
function activeUser(state: CmsState, userId: string): CmsMember | undefined { return state.members.find(u => u.id === userId && u.active); }
export function canManageSponsorship(state: CmsState, userId: string) { const user = activeUser(state, userId); const role = state.roles.find(r => r.id === user?.roleId); return !!role && !role.teamScoped && role.permissions.some(p => p === 'sponsors'); }
function canManageUsers(state: CmsState, userId: string) { const user = activeUser(state, userId); const role = state.roles.find(r => r.id === user?.roleId); return !!role && !role.teamScoped && role.permissions.includes('users'); }
function requireManager(state: CmsState, userId: string) { ensure(canManageSponsorship(state, userId), 'Je hebt sponsorbeheerrechten nodig.'); }
function upgradeUnsignedAgreements(data: SponsorshipState) { for (const agreement of data.agreements)
    if (agreement.status === 'awaiting-signature' && !agreement.signatures.length && !agreement.signingMode)
        agreement.signingMode = 'dual-email-otp'; return data; }
export function readSponsorship(state: Pick<CmsState, 'sponsorship'>): SponsorshipState { const data = state.sponsorship || createSponsorshipSeed(); return data.agreements.some(row => row.status === 'awaiting-signature' && !row.signatures.length && !row.signingMode) ? upgradeUnsignedAgreements(clone(data)) : data; }
export function ensureSponsorship(state: Pick<CmsState, 'sponsorship'>): SponsorshipState { if (!state.sponsorship)
    state.sponsorship = createSponsorshipSeed(); return upgradeUnsignedAgreements(state.sponsorship); }
export function sponsorMemberships(state: CmsState, userId: string) { return activeUser(state, userId) ? readSponsorship(state).memberships.filter(m => m.userId === userId) : []; }
export function canAccessSponsor(state: CmsState, userId: string, sponsorId: string, role?: SponsorContactRole) { return canManageSponsorship(state, userId) || sponsorMemberships(state, userId).some(m => m.sponsorId === sponsorId && (!role || m.roles.includes(role))); }
function requireAccess(state: CmsState, userId: string, sponsorId: string, role?: SponsorContactRole) { ensure(canAccessSponsor(state, userId, sponsorId, role), 'Dit onderdeel is niet beschikbaar voor jouw account.'); }
function activity(data: SponsorshipState, actorId: string, sponsorId: string, kind: SponsorActivity['kind'], title: string, detail = '', internal = false) { data.activities.unshift({ id: uid('sp-log'), sponsorId, at: stamp(), actorId, kind, title, detail, internal }); }
function getSponsor(data: SponsorshipState, id: string) { const sponsor = data.sponsors.find(s => s.id === id); ensure(sponsor, 'Sponsor niet gevonden.'); return sponsor; }
function assign<T extends {
    id: string;
}>(rows: T[], value: T) { const index = rows.findIndex(r => r.id === value.id); if (index < 0)
    rows.push(clone(value));
else
    rows[index] = clone(value); }
function allocate(total:number,weights:number[]){
 ensure(Number.isSafeInteger(total)&&total>=0&&weights.every(n=>Number.isSafeInteger(n)&&n>=0),'Gebruik veilige gehele centbedragen.');
 if(!weights.length)return[];
 const sum=weights.reduce((sum,n)=>sum+BigInt(n),BigInt(0)),values=sum?weights.map(BigInt):weights.map(()=>BigInt(1)),base=sum||BigInt(weights.length);
 const parts=values.map((n,i)=>({i,amount:BigInt(total)*n/base,remainder:BigInt(total)*n%base}));
 const result=parts.map(p=>Number(p.amount));let remainder=total-result.reduce((sum,n)=>sum+n,0);
 for(const part of parts.sort((a,b)=>a.remainder>b.remainder?-1:a.remainder<b.remainder?1:a.i-b.i)){if(remainder--<=0)break;result[part.i]++;}
 return result;
}
export function calculateSponsorTotals(lines: SponsorLine[], discountCents = 0): SponsorTotals {
    ensure(Number.isSafeInteger(discountCents) && discountCents >= 0, 'Korting moet een positief bedrag in centen zijn.');
    ensure(lines.every(l => Number.isSafeInteger(l.quantity) && l.quantity > 0 && Number.isSafeInteger(l.unitPriceCents) && l.unitPriceCents >= 0 && ['21', '9', '0', 'exempt'].includes(l.taxRate)), 'Controleer aantallen, bedragen en btw-keuzes.');
    const amounts = lines.map(l => l.quantity * l.unitPriceCents), subtotalCents = amounts.reduce((a, b) => a + b, 0);
    ensure(Number.isSafeInteger(subtotalCents)&&amounts.every(Number.isSafeInteger),'Het bedrag is te groot om exact in centen te verwerken.');
    ensure(discountCents <= subtotalCents, 'De korting mag niet hoger zijn dan de waarde van de regels.');
    const discounts = allocate(discountCents, amounts), groups = new Map<string, {
        taxRate: SponsorLine['taxRate'];
        netCents: number;
        taxCents: number;
    }>();
    lines.forEach((line, i) => { const netCents = amounts[i] - discounts[i]; const group = groups.get(line.taxRate) || { taxRate: line.taxRate, netCents: 0, taxCents: 0 }; group.netCents += netCents; groups.set(line.taxRate, group); });
    const taxGroups = [...groups.values()].map(g => ({ ...g, taxCents: g.taxRate === 'exempt' ? 0 : Number((BigInt(g.netCents)*BigInt(g.taxRate)+BigInt(50))/BigInt(100)) }));
    const netCents = subtotalCents - discountCents, taxCents = taxGroups.reduce((a, b) => a + b.taxCents, 0);
    ensure(Number.isSafeInteger(netCents+taxCents),'Het totaalbedrag is te groot om exact te verwerken.');
    return { subtotalCents, discountCents, netCents, taxCents, totalCents: netCents + taxCents, taxGroups };
}
function validateProfile(profile: SponsorProfile) { ensure(!!profile.name.trim(), 'Vul een bedrijfsnaam in.'); ensure(validLink(profile.website), 'Gebruik een geldige http(s)-website.'); ensure(validLink(profile.logoUrl, true), 'Gebruik een geldige afbeelding (PNG, JPG of WebP) of veilige afbeelding-URL.'); ensure(profile.logoUrl.length <= 900000, 'Het logo is te groot voor de browserdemo.'); }
function _saveSponsor(state: CmsState, actorId: string, value: Sponsor) { requireManager(state, actorId); ensure(value.id && value.name.trim(), 'Vul een bedrijfsnaam in.'); ensure(!value.email || emailValid(value.email), 'Vul een geldig e-mailadres in.'); validateProfile(value.publicProfile); ensure(validLink(value.website) && validLink(value.logoUrl, true), 'Controleer de website en het logo.'); const data = ensureSponsorship(state); if (value.ownerId)
    ensure(getSponsorStaffAccounts(state,actorId).some(u=>u.id===value.ownerId&&u.active), 'Kies een actieve relatiebeheerder met sponsorbeheerrechten.'); if (value.publicFrom && value.publicUntil)
    ensure(value.publicFrom <= value.publicUntil, 'De publicatie-einddatum moet na de begindatum liggen.'); const next = { ...clone(value), name: value.name.trim(), updatedAt: stamp(), createdAt: value.createdAt || stamp() }, previous = data.sponsors.find(row => row.id === value.id); if (previous?.businessDetails) {
    next.businessDetails = clone(previous.businessDetails);
    for (const field of ['companyNumber', 'vatNumber', 'address', 'postalCode', 'city', 'email', 'phone'] as const)
        next[field] = previous[field];
}
else
    delete next.businessDetails; assign(data.sponsors, next); activity(data, actorId, value.id, 'profile', 'Sponsordossier bijgewerkt', '', true); return next; }
export function canRequestSponsorBusinessChange(state: CmsState, actorId: string, sponsorId: string) { return canManageSponsorship(state, actorId) || sponsorMemberships(state, actorId).some(row => row.sponsorId === sponsorId && row.roles.some(role => role === 'signer' || role === 'billing')); }
function cleanSponsorBusinessDetails(value: SponsorBusinessDetails): SponsorBusinessDetails { const keys = ['legalName', 'companyNumber', 'registrationExemptionReason', 'vatNumber', 'address', 'postalCode', 'city', 'country', 'contactName', 'contactFunction', 'contactEmail', 'invoiceEmail', 'phone'] as const; const next = { ...canonicalSponsorBusinessDetails(value), registrationExempt: !!value.registrationExempt, confirmedAt: '', confirmedBy: '', updatedAt: '' }; for (const key of keys) {
    ensure(typeof value[key] === 'string' && value[key].length <= 500, `Controleer het bedrijfsveld ${key}.`);
    next[key] = value[key].trim();
} next.country = next.country.toUpperCase(); next.contactEmail = next.contactEmail.toLowerCase(); next.invoiceEmail = next.invoiceEmail.toLowerCase(); ensure(['registered', 'exempt', 'not-applicable'].includes(next.vatStatus), 'Kies een geldige btw-status.'); ensure(!next.contactEmail || emailValid(next.contactEmail), 'Vul een geldig contact-e-mailadres in.'); ensure(!next.invoiceEmail || emailValid(next.invoiceEmail), 'Vul een geldig factuur-e-mailadres in.'); return next; }
function _saveSponsorBusinessDetails(state: CmsState, actorId: string, sponsorId: string, value: SponsorBusinessDetails, confirm = false) { requireManager(state, actorId); const data = ensureSponsorship(state), sponsor = getSponsor(data, sponsorId), details = cleanSponsorBusinessDetails(value), old = getSponsorBusinessDetails(sponsor); if (confirm) {
    const ready = getSponsorBusinessReadiness(details);
    ensure(ready.complete, `Vul eerst de bedrijfsgegevens aan: ${ready.missing.join(', ')}.`);
    details.confirmedAt = stamp();
    details.confirmedBy = actorId;
}
else if (sponsorBusinessIdentity(details) === sponsorBusinessIdentity(old)) {
    details.confirmedAt = old.confirmedAt;
    details.confirmedBy = old.confirmedBy;
} details.updatedAt = stamp(); sponsor.businessDetails = details; sponsor.companyNumber = details.companyNumber; sponsor.vatNumber = details.vatNumber; sponsor.address = details.address; sponsor.postalCode = details.postalCode; sponsor.city = details.city; sponsor.email = details.contactEmail; sponsor.phone = details.phone; sponsor.updatedAt = details.updatedAt; activity(data, actorId, sponsorId, 'profile', confirm ? 'Bedrijfsgegevens bevestigd door de commissie' : 'Bedrijfsgegevens als concept opgeslagen', 'De openbare sponsorvermelding en bestaande documenten blijven ongewijzigd.'); return clone(details); }
function _requestSponsorBusinessChange(state: CmsState, actorId: string, sponsorId: string, value: SponsorBusinessDetails, reason = '') { ensure(canRequestSponsorBusinessChange(state, actorId, sponsorId), 'Alleen een tekenbevoegd of financieel contact kan een bedrijfswijziging aanvragen.'); const data = ensureSponsorship(state), sponsor = getSponsor(data, sponsorId), details = cleanSponsorBusinessDetails(value), ready = getSponsorBusinessReadiness(details); ensure(ready.complete, `Controleer de bedrijfsgegevens: ${ready.missing.join(', ')}.`); ensure(reason.length <= 2000, 'Houd de toelichting onder 2.000 tekens.'); const rows = data.businessChangeRequests || (data.businessChangeRequests = []), existing = rows.find(row => row.sponsorId === sponsorId && row.userId === actorId && row.status === 'pending'); const request: SponsorBusinessChangeRequest = { id: existing?.id || uid('sp-business-request'), sponsorId, userId: actorId, details, reason: reason.trim(), status: 'pending', createdAt: stamp(), reviewedAt: '', reviewedBy: '', reviewNote: '', baseIdentity: sponsorBusinessIdentity(getSponsorBusinessDetails(sponsor)) }; assign(rows, request); activity(data, actorId, sponsorId, 'profile', 'Wijziging bedrijfsgegevens aangevraagd', 'De sponsorcommissie beoordeelt dit verzoek. De huidige bedrijfsgegevens blijven gelden.'); return request; }
function _reviewSponsorBusinessChange(state: CmsState, actorId: string, id: string, approve: boolean, reviewNote = '') { requireManager(state, actorId); const data = ensureSponsorship(state), request = data.businessChangeRequests?.find(row => row.id === id); ensure(request && request.status === 'pending', 'Deze bedrijfswijziging is al beoordeeld.'); ensure(reviewNote.length <= 2000, 'Houd de beoordeling onder 2.000 tekens.'); const sponsor = getSponsor(data, request.sponsorId); if (approve) {
    ensure(!!request.baseIdentity && request.baseIdentity === sponsorBusinessIdentity(getSponsorBusinessDetails(sponsor)), 'De bedrijfsgegevens zijn inmiddels gewijzigd. Vraag de sponsor om een actueel wijzigingsverzoek.');
    saveSponsorBusinessDetails(state, actorId, request.sponsorId, request.details, true);
} request.status = approve ? 'approved' : 'rejected'; request.reviewedAt = stamp(); request.reviewedBy = actorId; request.reviewNote = reviewNote.trim(); activity(data, actorId, request.sponsorId, 'profile', approve ? 'Bedrijfswijziging goedgekeurd' : 'Bedrijfswijziging afgewezen', request.reviewNote); return request; }
export function readSponsorContractTemplates(state: Pick<CmsState, 'sponsorship'>): SponsorContractTemplate[] { return clone(readSponsorship(state).contractTemplates ?? [createDefaultSponsorContractTemplate()]); }
function _saveSponsorContractTemplate(state: CmsState, actorId: string, value: SponsorContractTemplate) { requireManager(state, actorId); validateSponsorContractTemplate(value); ensure(value.id.trim(), 'Template-identificatie ontbreekt.'); const data = ensureSponsorship(state); data.contractTemplates ??= [createDefaultSponsorContractTemplate()]; const old = data.contractTemplates.find(row => row.id === value.id), next = { ...clone(value), name: value.name.trim(), version: old ? old.version + 1 : 1, updatedAt: stamp() }; if (old?.active && !next.active)
    ensure(data.contractTemplates.some(row => row.id !== old.id && row.active), 'Behoud minimaal één actieve overeenkomsttemplate.'); assign(data.contractTemplates, next); return next; }
function _removeSponsorContractTemplate(state: CmsState, actorId: string, id: string) { requireManager(state, actorId); const data = ensureSponsorship(state); data.contractTemplates ??= [createDefaultSponsorContractTemplate()]; ensure(data.contractTemplates.some(row => row.id === id), 'Template niet gevonden.'); ensure(data.contractTemplates.some(row => row.id !== id && row.active), 'Behoud minimaal één actieve overeenkomsttemplate.'); data.contractTemplates = data.contractTemplates.filter(row => row.id !== id); }
function confirmedBusiness(sponsor: Sponsor) { const details = getSponsorBusinessDetails(sponsor), ready = getSponsorBusinessReadiness(details); ensure(ready.confirmed, ready.complete ? 'Laat de sponsorcommissie eerst de bedrijfsgegevens bevestigen.' : `Vul en bevestig eerst de bedrijfsgegevens: ${ready.missing.join(', ')}.`); return details; }
function _saveMembership(state: CmsState, actorId: string, value: SponsorMembership) { ensure(canManageSponsorship(state, actorId) || canManageUsers(state, actorId), 'Je hebt gebruikers- of sponsorbeheerrechten nodig.'); const data = ensureSponsorship(state); getSponsor(data, value.sponsorId); const previous = data.memberships.find(link => link.id === value.id); if (!canManageUsers(state, actorId))
    ensure(previous && previous.userId === value.userId && previous.sponsorId === value.sponsorId, 'Alleen gebruikersbeheer kan een bestaand account nieuw koppelen. Nodig een sponsorcontact uit via het personenregister.'); ensure(activeUser(state, value.userId), 'Kies een bestaand actief gebruikersaccount.'); ensure(value.roles.length > 0 && value.roles.every(r => ['signer', 'billing', 'marketing'].includes(r)), 'Kies minimaal één contactrol.'); ensure(!data.memberships.some(m => m.id !== value.id && m.userId === value.userId && m.sponsorId === value.sponsorId), 'Dit account is al gekoppeld aan deze sponsor.'); assign(data.memberships, { ...value, roles: [...new Set(value.roles)] }); }
export const saveSponsorMembership=(...args:Parameters<typeof saveMembership>)=>saveMembership(...args);
/** Minimal account projections for sponsor work; never return the general directory. */
export function getSponsorContactAccounts(state: CmsState, actorId: string, sponsorId?: string) {
    ensure(canManageSponsorship(state, actorId) || canManageUsers(state, actorId), 'Je hebt sponsor- of gebruikersbeheerrechten nodig.');
    const data = readSponsorship(state), ids = new Set(data.memberships.filter(link => !sponsorId || link.sponsorId === sponsorId).map(link => link.userId));
    return state.members.filter(member => ids.has(member.id)).map(({ id, name, email, active }) => ({ id, name, email, active }));
}
export function getSponsorStaffAccounts(state: CmsState, actorId: string) {
    ensure(canManageSponsorship(state, actorId) || canManageUsers(state, actorId), 'Je hebt sponsor- of gebruikersbeheerrechten nodig.'); if ((state as CmsState & {sponsorStaffOptions?:{id:string;name:string;active:boolean}[]}).sponsorStaffOptions) return (state as CmsState & {sponsorStaffOptions:{id:string;name:string;active:boolean}[]}).sponsorStaffOptions;
    return state.members.filter(member => canManageSponsorship(state, member.id)).map(({ id, name, active }) => ({ id, name, active }));
}
function _removeSponsorMembership(state: CmsState, actorId: string, id: string) { ensure(canManageSponsorship(state, actorId) || canManageUsers(state, actorId), 'Je hebt gebruikers- of sponsorbeheerrechten nodig.'); const data = ensureSponsorship(state); data.memberships = data.memberships.filter(m => m.id !== id); }
function _saveSponsorItem(state: CmsState, actorId: string, value: SponsorItem) { requireManager(state, actorId); ensure(value.name.trim(), 'Geef het sponsoritem een naam.'); ensure(Number.isInteger(value.capacity) && value.capacity >= 0, 'Gebruik een geldig aantal beschikbare plekken.'); calculateSponsorTotals([{ id: 'check', itemId: value.id, name: value.name, description: '', quantity: 1, unitPriceCents: value.priceCents, taxRate: value.taxRate }]); const data = ensureSponsorship(state); if (value.capacity > 0 && data.items.some(i => i.id === value.id)) {
    const dates = [today(), ...data.agreements.filter(a => a.status !== 'cancelled' && a.snapshot.endDate >= today()).flatMap(a => [a.snapshot.startDate, a.snapshot.endDate]), ...data.proposals.filter(p => (p.status === 'accepted' || p.status === 'sent' && p.reservedUntil >= stamp()) && p.snapshot && p.snapshot.endDate >= today()).flatMap(p => [p.snapshot!.startDate, p.snapshot!.endDate])].filter(d => d >= today());
    const committed = Math.max(0, ...dates.map(d => sponsorItemAvailability(state, value.id, d, d).reserved));
    ensure(value.capacity >= committed, 'Het aantal plekken is lager dan de bestaande reserveringen en overeenkomsten.');
} assign(data.items, value); return value; }
function _saveSponsorPackage(state: CmsState, actorId: string, value: SponsorPackage) { requireManager(state, actorId); const data = ensureSponsorship(state); ensure(value.name.trim() && value.itemIds.length, 'Kies een naam en minimaal één sponsoritem.'); ensure(value.itemIds.every(id => data.items.some(i => i.id === id && i.active)), 'Een geselecteerd sponsoritem is niet beschikbaar.'); ensure(new Set(value.itemIds).size === value.itemIds.length, 'Een item staat dubbel in het pakket.'); calculateSponsorTotals([{ id: 'check', itemId: '', name: value.name, description: '', quantity: 1, unitPriceCents: value.priceCents, taxRate: value.taxRate }]); assign(data.packages, value); return value; }
const defaultTerms = 'De club levert de opgenomen sponsoruitingen binnen de afgesproken looptijd. Materiaal wordt vooraf door de sponsor aangeleverd en goedgekeurd. Verlengen gebeurt uitsluitend volgens de schriftelijke afspraken.';
function linesFromPackage(data: SponsorshipState, packageId: string): SponsorLine[] { const pack = data.packages.find(p => p.id === packageId && p.active); ensure(pack, 'Kies een beschikbaar pakket.'); const items = pack.itemIds.map(id => data.items.find(i => i.id === id && i.active)); ensure(items.every(Boolean), 'Een pakketitem is niet meer beschikbaar.'); const prices = allocate(pack.priceCents, items.map(i => i!.priceCents)); return items.map((item, index) => ({ id: uid('sp-line'), itemId: item!.id, name: item!.name, description: item!.description, quantity: 1, unitPriceCents: prices[index], taxRate: item!.taxRate })); }
function _createSponsorProposal(state: CmsState, actorId: string, sponsorId: string, packageId = ''): SponsorProposal { requireManager(state, actorId); const data = ensureSponsorship(state), sponsor = getSponsor(data, sponsorId); const time = stamp(); const proposal: SponsorProposal = { id: uid('sp-proposal'), sponsorId, templateId: readSponsorContractTemplates(state).find(template => template.active)?.id, name: packageId ? data.packages.find(p => p.id === packageId)?.name || 'Sponsorvoorstel' : 'Sponsorvoorstel op maat', packageId, season: state.settings.season || '2026–2027', startDate: today(), endDate: '2027-06-30', paymentTerms: data.settings.defaultPaymentTerms, terms: data.settings.defaultTerms, lines: packageId ? linesFromPackage(data, packageId) : [], discountCents: 0, status: 'draft', reservedUntil: '', createdAt: time, updatedAt: time }; if (proposal.endDate < proposal.startDate)
    proposal.endDate = `${Number(proposal.startDate.slice(0, 4)) + 1}-06-30`; data.proposals.unshift(proposal); activity(data, actorId, sponsor.id, 'proposal', 'Voorstel als concept aangemaakt', proposal.name); return proposal; }
function validateProposal(data: SponsorshipState, proposal: SponsorProposal) { getSponsor(data, proposal.sponsorId); ensure(proposal.name.trim(), 'Geef het voorstel een naam.'); ensure(/^\d{4}-\d{2}-\d{2}$/.test(proposal.startDate) && /^\d{4}-\d{2}-\d{2}$/.test(proposal.endDate) && proposal.startDate <= proposal.endDate, 'Kies een geldige contractperiode.'); ensure(proposal.lines.length, 'Voeg minimaal één sponsoritem toe.'); ensure(new Set(proposal.lines.map(l => l.id)).size === proposal.lines.length, 'Dubbele voorstelregels.'); ensure(proposal.lines.every(l => l.name.trim() && data.items.some(i => i.id === l.itemId && i.active)), 'Een sponsoritem ontbreekt of is niet actief.'); calculateSponsorTotals(proposal.lines, proposal.discountCents); }
function _saveSponsorProposal(state: CmsState, actorId: string, value: SponsorProposal) { requireManager(state, actorId); const data = ensureSponsorship(state), old = data.proposals.find(p => p.id === value.id); ensure(!old || old.status === 'draft', 'Een verstuurd voorstel is vastgezet. Maak een nieuwe versie.'); ensure(value.status === 'draft' && !value.snapshot, 'Bewaar alleen een concept via deze actie.'); validateProposal(data, value); assign(data.proposals, { ...clone(value), updatedAt: stamp() }); return value; }
function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string) { return (!aEnd || !bStart || aEnd >= bStart) && (!bEnd || !aStart || bEnd >= aStart); }
export function sponsorItemAvailability(state: CmsState, itemId: string, startDate = today(), endDate = today(), excludeProposalId = '') { const data = readSponsorship(state), item = data.items.find(i => i.id === itemId); ensure(item, 'Sponsoritem niet gevonden.'); let reserved = 0; const current = stamp(); for (const p of data.proposals) {
    if (p.id === excludeProposalId || !['sent', 'accepted'].includes(p.status) || (p.status === 'sent' && p.reservedUntil < current) || !p.snapshot || !overlaps(startDate, endDate, p.snapshot.startDate, p.snapshot.endDate))
        continue;
    reserved += p.snapshot.lines.filter(l => l.itemId === itemId).reduce((s, l) => s + l.quantity, 0);
} for (const a of data.agreements) {
    if (a.status === 'cancelled' || !overlaps(startDate, endDate, a.snapshot.startDate, a.snapshot.endDate))
        continue;
    reserved += a.snapshot.lines.filter(l => l.itemId === itemId).reduce((s, l) => s + l.quantity, 0);
} return { capacity: item.capacity, reserved, available: item.capacity === 0 ? Infinity : Math.max(0, item.capacity - reserved), unlimited: item.capacity === 0 }; }
function checkInventory(state: CmsState, proposal: SponsorProposal) { const byItem = new Map<string, number>(); for (const line of proposal.lines)
    byItem.set(line.itemId, (byItem.get(line.itemId) || 0) + line.quantity); for (const [itemId, amount] of byItem) {
    const available = sponsorItemAvailability(state, itemId, proposal.startDate, proposal.endDate, proposal.id);
    ensure(available.available >= amount, `${readSponsorship(state).items.find(i => i.id === itemId)?.name || 'Sponsoritem'} is niet meer voldoende beschikbaar in deze periode.`);
} }
function makeSnapshot(data: SponsorshipState, proposal: SponsorProposal, clubName = 'Duindorp SV'): SponsorProposalSnapshot { const sponsor = getSponsor(data, proposal.sponsorId), company = confirmedBusiness(sponsor), templates = data.contractTemplates ?? [createDefaultSponsorContractTemplate()], template = templates.find(row => row.active && (!proposal.templateId || row.id === proposal.templateId)); ensure(template, 'Kies een actieve overeenkomsttemplate.'); const snapshot: SponsorProposalSnapshot = { name: proposal.name, sponsorName: company.legalName, sponsorAddress: [company.address, `${company.postalCode} ${company.city}`.trim(), company.country].filter(Boolean).join(', '), sponsorEmail: company.contactEmail, season: proposal.season, startDate: proposal.startDate, endDate: proposal.endDate, paymentTerms: proposal.paymentTerms, terms: proposal.terms, lines: clone(proposal.lines), discountCents: proposal.discountCents, capturedAt: stamp() }; const totals = calculateSponsorTotals(snapshot.lines, snapshot.discountCents), packageName = data.packages.find(row => row.id === proposal.packageId)?.name || 'Maatwerk', variables = getSponsorContractVariables(snapshot, company, packageName, totals, clubName), rendered = renderSponsorContractTemplate(template, variables); snapshot.contract = { templateId: template.id, templateName: template.name, templateVersion: template.version, title: rendered.title, body: rendered.body, variables, company: clone(company), packageName, totals }; return clone(snapshot); }
function _sendSponsorProposal(state: CmsState, actorId: string, id: string) { requireManager(state, actorId); const data = ensureSponsorship(state), proposal = data.proposals.find(p => p.id === id); ensure(proposal && proposal.status === 'draft', 'Kies een bewerkbaar conceptvoorstel.'); validateProposal(data, proposal); checkInventory(state, proposal); proposal.snapshot = makeSnapshot(data, proposal, state.settings.clubName); proposal.status = 'sent'; proposal.updatedAt = stamp(); if (proposal.reservedUntil) {
    ensure(Number.isFinite(Date.parse(proposal.reservedUntil)) && Date.parse(proposal.reservedUntil) > Date.now(), 'Kies een toekomstige reserveringsdatum.');
}
else
    proposal.reservedUntil = new Date(Date.now() + 7 * 86400000).toISOString(); getSponsor(data, proposal.sponsorId).stage = 'proposal'; activity(data, actorId, proposal.sponsorId, 'proposal', 'Voorstel klaargezet voor de sponsor', `${proposal.name} · beschikbaar in het persoonlijke sponsorportaal.`); return proposal; }
function _acceptSponsorProposal(state: CmsState, actorId: string, id: string) { const data = ensureSponsorship(state), proposal = data.proposals.find(p => p.id === id); ensure(proposal && proposal.status === 'sent', 'Dit voorstel kan niet meer worden geaccepteerd.'); ensure(sponsorMemberships(state, actorId).some(m => m.sponsorId === proposal.sponsorId && m.roles.includes('signer')), 'Alleen een gekoppelde tekenbevoegde sponsor kan dit voorstel accepteren.'); checkInventory(state, proposal); proposal.status = 'accepted'; proposal.updatedAt = stamp(); activity(data, actorId, proposal.sponsorId, 'proposal', 'Voorstel geaccepteerd', 'De overeenkomst moet nog afzonderlijk worden ondertekend.'); return proposal; }
function _createSponsorAgreement(state: CmsState, actorId: string, proposalId: string) { requireManager(state, actorId); const data = ensureSponsorship(state), proposal = data.proposals.find(p => p.id === proposalId); ensure(proposal && ['sent', 'accepted'].includes(proposal.status) && proposal.snapshot, 'Verstuur het voorstel voordat je een overeenkomst maakt.'); ensure(!data.agreements.some(a => a.proposalId === proposal.id && a.status !== 'cancelled'), 'Er bestaat al een overeenkomst voor dit voorstel.'); checkInventory(state, proposal); const company = confirmedBusiness(getSponsor(data, proposal.sponsorId)); ensure(proposal.snapshot.contract, 'Dit oudere voorstel mist een overeenkomsttemplate. Maak een nieuw voorstel met de actuele bedrijfsgegevens.'); ensure(sponsorBusinessIdentity(company) === sponsorBusinessIdentity(proposal.snapshot.contract.company), 'De bedrijfsgegevens zijn gewijzigd sinds het voorstel. Maak een nieuw voorstel voordat je een overeenkomst opstelt.'); const snapshot = clone(proposal.snapshot), agreement: SponsorAgreement = { id: uid('sp-agreement'), signingMode: 'dual-email-otp', sponsorId: proposal.sponsorId, proposalId, number: `DSV-${new Date().getFullYear()}-${String(data.agreements.length + 1).padStart(3, '0')}`, version: 1, status: 'awaiting-signature', snapshot, documentHash: sha256(JSON.stringify(snapshot)), snapshotBytes:JSON.stringify(snapshot),hashFormat:'json-utf8-v1',signatures: [], createdAt: stamp(), signedAt: '' }; data.agreements.unshift(agreement); proposal.status = 'converted'; activity(data, actorId, proposal.sponsorId, 'agreement', 'Overeenkomst klaar voor ondertekening', `${agreement.number} · versie ${agreement.version}`); return agreement; }
export type SponsorSignatureInput = {
    name?: string;
    function: string;
    consent: boolean;
    verificationCode: string;
    challengeId?: string;
};
function signatureAccess(state: CmsState, actorId: string, agreement: SponsorAgreement, party: SponsorSigningParty) { const user = activeUser(state, actorId); ensure(user && user.name.trim() && emailValid(user.email), 'Je actieve account heeft een naam en persoonlijk e-mailadres nodig.'); if (party === 'sponsor') {
    ensure(agreement.status === 'awaiting-signature', 'Deze overeenkomst kan niet meer door de sponsor worden ondertekend.');
    ensure(sponsorMemberships(state, actorId).some(row => row.sponsorId === agreement.sponsorId && row.roles.includes('signer')), 'Alleen een gekoppelde tekenbevoegde sponsor kan deze overeenkomst ondertekenen.');
}
else {
    requireManager(state, actorId);
    ensure(agreement.status === 'awaiting-club-signature' && agreement.signatures.some(row => row.party === 'sponsor'), 'Laat de sponsor eerst ondertekenen.');
    ensure(!agreement.signatures.some(row => row.party === 'sponsor' && row.userId === actorId), 'De sponsor en de club moeten met afzonderlijke accounts ondertekenen.');
} sponsorSnapshotBytes(agreement); return user; }
function _requestSponsorSigningCode(state: CmsState, actorId: string, id: string, party: SponsorSigningParty) { ensure(party === 'sponsor' || party === 'club', 'Kies een geldige ondertekenpartij.'); const data = ensureSponsorship(state), agreement = data.agreements.find(a => a.id === id); ensure(agreement, 'Overeenkomst niet gevonden.'); const user = signatureAccess(state, actorId, agreement, party), email = user.email.trim().toLowerCase(), at = stamp(); const challenge: SponsorSigningChallenge = { id: uid('sp-otp'), agreementId: id, sponsorId: agreement.sponsorId, userId: actorId, party, email, emailHint: email.slice(0, 2) + '***@' + email.split('@')[1], documentHash: agreement.documentHash, createdAt: at, expiresAt: new Date(Date.now() + 600000).toISOString(), attempts: 0, status: 'pending', codeHash: '', consumedAt: '' }; for (const row of data.signingChallenges || [])
    if (row.userId === actorId && row.agreementId === id && row.party === party && row.status === 'pending')
        row.status = 'revoked'; (data.signingChallenges ??= []).unshift(challenge); return clone(challenge); }
function consumeSigningCode(..._input: unknown[]): never { throw new Error('Verificatie vindt uitsluitend op de server plaats.'); }
function finishSponsorAgreement(data: SponsorshipState, agreement: SponsorAgreement, actorId: string, at: string) { agreement.status = 'signed'; agreement.signedAt = at; getSponsor(data, agreement.sponsorId).stage = 'active'; for (const line of agreement.snapshot.lines) {
    const item = data.items.find(row => row.id === line.itemId);
    data.tasks.unshift({ id: uid('sp-task'), sponsorId: agreement.sponsorId, agreementId: agreement.id, title: line.name, kind: item?.kind || 'other', status: 'open', ownerId: getSponsor(data, agreement.sponsorId).ownerId, dueDate: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10), note: 'Uitvoering volgens de door beide partijen ondertekende overeenkomst.', proofUrl: '', visibleToSponsor: true, createdAt: at, completedAt: '' });
} activity(data, actorId, agreement.sponsorId, 'agreement', 'Overeenkomst door beide partijen ondertekend', `${agreement.number} · afzonderlijke e-mailverificaties vastgelegd.`); }
function appendSponsorSignature(_state: CmsState, _actor: string, _id: string, _party: SponsorSigningParty, _input: SponsorSignatureInput): SponsorAgreement { throw new Error('Onderteken uitsluitend via de beveiligde serververificatie.'); }
function _signSponsorAgreement(state: CmsState, actorId: string, id: string, input: SponsorSignatureInput) { return appendSponsorSignature(state, actorId, id, 'sponsor', input); }
function _countersignSponsorAgreement(state: CmsState, actorId: string, id: string, input: SponsorSignatureInput) { return appendSponsorSignature(state, actorId, id, 'club', input); }
/** Return failures instead of throwing, so browser transactions retain failed-code attempt counts. */
function _trySignSponsorAgreement(state: CmsState, actorId: string, id: string, input: SponsorSignatureInput) { try {
    return { ok: true as const, agreement: signSponsorAgreement(state, actorId, id, input) };
}
catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : 'Ondertekenen is niet gelukt.' };
} }
function _tryCountersignSponsorAgreement(state: CmsState, actorId: string, id: string, input: SponsorSignatureInput) { try {
    return { ok: true as const, agreement: countersignSponsorAgreement(state, actorId, id, input) };
}
catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : 'Ondertekenen is niet gelukt.' };
} }
function _createSponsorInvoice(state: CmsState, actorId: string, agreementId: string, dueDate?: string) { requireManager(state, actorId); const data = ensureSponsorship(state), agreement = data.agreements.find(a => a.id === agreementId); ensure(agreement && agreement.status === 'signed' && agreement.signingMode==='dual-email-otp' && agreement.signatures.length===2 && agreement.signatures.every(s=>s.verification==='email-otp'&&!s.demo), 'Maak een factuur van een ondertekende overeenkomst.'); ensure(!data.invoices.some(i => i.agreementId === agreementId && i.status !== 'cancelled'), 'Er bestaat al een factuur voor deze overeenkomst.'); const total = calculateSponsorTotals(agreement.snapshot.lines, agreement.snapshot.discountCents); const invoice: SponsorInvoice = { id: uid('sp-invoice'), sponsorId: agreement.sponsorId, agreementId, number: `DSV-F-${new Date().getFullYear()}-${String(data.invoices.length + 1).padStart(3, '0')}`, issueDate: today(), dueDate: dueDate || new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10), status: 'open', lines: clone(agreement.snapshot.lines), discountCents: agreement.snapshot.discountCents, totalCents: total.totalCents, paidAt: '', paymentMethod: 'none', createdAt: stamp() }; ensure(invoice.dueDate >= invoice.issueDate, 'De vervaldatum moet op of na de factuurdatum liggen.'); data.invoices.unshift(invoice); activity(data, actorId, invoice.sponsorId, 'invoice', 'Factuur aangemaakt', `${invoice.number} · ${money(invoice.totalCents)}`); return invoice; }
export function simulateSponsorPayment(_state: CmsState, _actor: string, _id: string, _method: 'manual-demo' | 'mollie-demo' = 'mollie-demo'): never { throw new Error('Online betalen is nog niet geconfigureerd.'); }
function _updateSponsorTask(state: CmsState, actorId: string, id: string, patch: Partial<Pick<SponsorTask, 'status' | 'ownerId' | 'dueDate' | 'note' | 'proofUrl' | 'visibleToSponsor' | 'title'>>) { requireManager(state, actorId); const data = ensureSponsorship(state), task = data.tasks.find(t => t.id === id); ensure(task, 'Taak niet gevonden.'); ensure(!patch.proofUrl || validLink(patch.proofUrl), 'Gebruik een veilige openbare link voor het bewijs.'); if (patch.ownerId)
    ensure(activeUser(state, patch.ownerId), 'Kies een actieve verantwoordelijke.'); Object.assign(task, clone(patch)); task.completedAt = task.status === 'done' ? task.completedAt || stamp() : ''; activity(data, actorId, task.sponsorId, 'task', `${task.status === 'done' ? 'Uitgevoerd' : 'Bijgewerkt'}: ${task.title}`, task.note, !task.visibleToSponsor); return task; }
function _addSponsorNote(state: CmsState, actorId: string, sponsorId: string, title: string, detail = '') { requireManager(state, actorId); const data = ensureSponsorship(state); getSponsor(data, sponsorId); ensure(title.trim(), 'Schrijf een notitie.'); activity(data, actorId, sponsorId, 'note', title.trim(), detail, true); }
function _requestSponsorProfile(state: CmsState, actorId: string, sponsorId: string, profile: SponsorProfile) { requireAccess(state, actorId, sponsorId, 'marketing'); validateProfile(profile); const data = ensureSponsorship(state); getSponsor(data, sponsorId); const request = { id: uid('sp-profile'), sponsorId, userId: actorId, profile: clone(profile), status: 'pending' as const, createdAt: stamp(), reviewedAt: '', reviewedBy: '' }; data.profileRequests.unshift(request); activity(data, actorId, sponsorId, 'profile', 'Bedrijfsprofiel ter goedkeuring aangeboden', 'Het publieke profiel blijft gelijk totdat de commissie akkoord geeft.'); return request; }
function _approveSponsorProfile(state: CmsState, actorId: string, id: string, approve = true) { requireManager(state, actorId); const data = ensureSponsorship(state), request = data.profileRequests.find(r => r.id === id); ensure(request && request.status === 'pending', 'Dit wijzigingsvoorstel is al beoordeeld.'); request.status = approve ? 'approved' : 'rejected'; request.reviewedAt = stamp(); request.reviewedBy = actorId; if (approve) {
    const sponsor = getSponsor(data, request.sponsorId);
    sponsor.publicProfile = clone(request.profile);
    sponsor.updatedAt = stamp();
} activity(data, actorId, request.sponsorId, 'profile', approve ? 'Bedrijfsprofiel goedgekeurd' : 'Wijzigingsvoorstel afgewezen'); return request; }
function _saveSponsorMaterial(state: CmsState, actorId: string, sponsorId: string, input: {
    logoUrl?: string;
    note?: string;
    proofUrl?: string;
}) { requireAccess(state, actorId, sponsorId, 'marketing'); const data = ensureSponsorship(state), sponsor = getSponsor(data, sponsorId); ensure(!input.proofUrl || validLink(input.proofUrl), 'Gebruik een veilige link voor het materiaal.'); if (input.logoUrl)
    requestSponsorProfile(state, actorId, sponsorId, { ...sponsor.publicProfile, logoUrl: input.logoUrl }); ensure(input.logoUrl || input.note?.trim() || input.proofUrl, 'Voeg een bestand, link of toelichting toe.'); activity(data, actorId, sponsorId, 'task', 'Materiaal aangeleverd', [input.note, input.proofUrl].filter(Boolean).join('\n')); const task = data.tasks.find(t => t.sponsorId === sponsorId && t.status !== 'done' && t.visibleToSponsor); if (task) {
    task.note = [task.note, input.note, input.proofUrl].filter(Boolean).join('\n');
    if (input.proofUrl)
        task.proofUrl = input.proofUrl;
    task.status = 'in-progress';
} }
function _registerSponsorEvent(state: CmsState, actorId: string, eventId: string, sponsorId: string, guests = 1) { requireAccess(state, actorId, sponsorId); ensure(Number.isInteger(guests) && guests >= 1 && guests <= 20, 'Kies een geldig aantal bezoekers.'); const data = ensureSponsorship(state), event = data.events.find(e => e.id === eventId); ensure(event, 'Bijeenkomst niet gevonden.'); ensure(event.date.slice(0, 10) >= today(), 'Deze bijeenkomst heeft al plaatsgevonden.'); const others = event.registrations.filter(r => !(r.userId === actorId && r.sponsorId === sponsorId)); ensure(others.reduce((s, r) => s + r.guests, 0) + guests <= event.capacity, 'Er zijn onvoldoende plaatsen beschikbaar.'); event.registrations = [...others, { userId: actorId, sponsorId, guests, at: stamp() }]; activity(data, actorId, sponsorId, 'event', 'Aangemeld voor sponsorbijeenkomst', `${event.title} · ${guests} persoon/personen`); }
function _cancelSponsorEvent(state: CmsState, actorId: string, eventId: string, sponsorId: string) { requireAccess(state, actorId, sponsorId); const data = ensureSponsorship(state), event = data.events.find(e => e.id === eventId); ensure(event, 'Bijeenkomst niet gevonden.'); event.registrations = event.registrations.filter(r => !(r.userId === actorId && r.sponsorId === sponsorId)); activity(data, actorId, sponsorId, 'event', 'Aanmelding ingetrokken', event.title); }
export function getPublicSponsors(state: Pick<CmsState, 'sponsorship'>, at = stamp()) { const date = at.slice(0, 10); return readSponsorship(state).sponsors.filter(s => s.publicEnabled && s.publicProfile.name.trim() && (!s.publicFrom || s.publicFrom <= date) && (!s.publicUntil || s.publicUntil >= date)).map(s => ({ id: s.id, name: s.publicProfile.name, description: s.publicProfile.description, website: s.publicProfile.website, logoUrl: s.publicProfile.logoUrl, publicProfile: clone(s.publicProfile), publicFrom: s.publicFrom, publicUntil: s.publicUntil })); }
export function getSponsorReminders(state: Pick<CmsState, 'sponsorship'>, at = stamp()): SponsorReminder[] { const data = readSponsorship(state), date = at.slice(0, 10), items: SponsorReminder[] = []; const add = (kind: SponsorReminder['kind'], referenceId: string, sponsorId: string, title: string, dueDate: string) => items.push({ id: `${kind}-${referenceId}`, kind, referenceId, sponsorId, title, dueDate, severity: dueDate < date ? 'urgent' : 'normal' }); for (const a of data.agreements) {
    if (a.status === 'awaiting-signature' || a.status === 'awaiting-club-signature')
        add('signature', a.id, a.sponsorId, `${a.status === 'awaiting-club-signature' ? 'Clubondertekening' : 'Sponsorondertekening'} ontbreekt · ${a.number}`, a.snapshot.startDate);
    if (a.status === 'signed') {
        const days = (Date.parse(a.snapshot.endDate) - Date.parse(date)) / 86400000;
        if (days >= -30 && days <= (data.settings.reminderDays.length ? Math.max(90,...data.settings.reminderDays) : 90))
            add('renewal', a.id, a.sponsorId, `Overeenkomst verlengen · ${a.number}`, a.snapshot.endDate);
    }
} for (const i of data.invoices)
    if (i.status === 'open')
        add('invoice', i.id, i.sponsorId, `Factuur ${i.number} staat open`, i.dueDate); for (const t of data.tasks)
    if (t.status !== 'done')
        add('task', t.id, t.sponsorId, t.title, t.dueDate); return items.sort((a, b) => a.dueDate.localeCompare(b.dueDate)); }
function _renewSponsorAgreement(state: CmsState, actorId: string, id: string) { requireManager(state, actorId); const data = ensureSponsorship(state), agreement = data.agreements.find(a => a.id === id); ensure(agreement && agreement.status === 'signed', 'Kies een ondertekende overeenkomst.'); const proposal = createSponsorProposal(state, actorId, agreement.sponsorId); const start = new Date(agreement.snapshot.endDate + 'T12:00:00Z'); start.setUTCDate(start.getUTCDate() + 1); const end = new Date(start); end.setUTCFullYear(end.getUTCFullYear() + 1); end.setUTCDate(end.getUTCDate() - 1); proposal.name = `Verlengvoorstel · ${agreement.snapshot.name}`; proposal.startDate = start.toISOString().slice(0, 10); proposal.endDate = end.toISOString().slice(0, 10); proposal.season = `${start.getUTCFullYear()}–${end.getUTCFullYear()}`; proposal.lines = agreement.snapshot.lines.map(l => { const item = data.items.find(i => i.id === l.itemId); return { ...clone(l), id: uid('sp-line'), unitPriceCents: item?.priceCents ?? l.unitPriceCents, taxRate: item?.taxRate ?? l.taxRate }; }); proposal.discountCents = 0; return proposal; }
// Deterministic SHA-256 of the exact captured document, usable in synchronous
// browser-local CMS transactions. This is an integrity check, not a qualified seal.
export function sponsorDocumentHash(value: string) { return sha256(value); }
function sha256(value: string) { const bytes = new TextEncoder().encode(value), length = bytes.length, words: number[] = []; for (let i = 0; i < length; i++)
    words[i >> 2] = (words[i >> 2] || 0) | (bytes[i] << ((3 - i % 4) * 8)); words[length >> 2] = (words[length >> 2] || 0) | (0x80 << ((3 - length % 4) * 8)); const padded = (((length + 8) >> 6) + 1) * 16; while (words.length < padded)
    words.push(0); words[padded - 2] = Math.floor(length / 0x20000000); words[padded - 1] = (length * 8) >>> 0; const k = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2], h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]; const rot = (v: number, n: number) => (v >>> n) | (v << (32 - n)); for (let block = 0; block < words.length; block += 16) {
    const w = words.slice(block, block + 16);
    for (let i = 16; i < 64; i++) {
        const a = w[i - 15], b = w[i - 2];
        w[i] = ((rot(a, 7) ^ rot(a, 18) ^ (a >>> 3)) + w[i - 16] + (rot(b, 17) ^ rot(b, 19) ^ (b >>> 10)) + w[i - 7]) | 0;
    }
    let [a, b, c, d, e, f, g, q] = h;
    for (let i = 0; i < 64; i++) {
        const t1 = (q + (rot(e, 6) ^ rot(e, 11) ^ rot(e, 25)) + ((e & f) ^ (~e & g)) + k[i] + w[i]) | 0, t2 = ((rot(a, 2) ^ rot(a, 13) ^ rot(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        q = g;
        g = f;
        f = e;
        e = (d + t1) | 0;
        d = c;
        c = b;
        b = a;
        a = (t1 + t2) | 0;
    }
    [a, b, c, d, e, f, g, q].forEach((v, i) => h[i] = (h[i] + v) | 0);
} return h.map(v => (v >>> 0).toString(16).padStart(8, '0')).join(''); }
const escape = (v: string) => v.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
function documentShell(title: string, content: string) { return `<!doctype html><html lang="nl"><meta charset="utf-8"><title>${escape(title)}</title><style>body{font:15px/1.6 Arial,sans-serif;color:#142538;max-width:820px;margin:40px auto;padding:24px}header{border-bottom:5px solid #03438a;padding-bottom:20px}h1{color:#03438a}table{border-collapse:collapse;width:100%;margin:25px 0}td,th{text-align:left;padding:10px;border-bottom:1px solid #dce3eb}small,.note{color:#5c6f83}.demo{padding:12px;background:#fff3d3}footer{margin-top:36px;border-top:1px solid #ddd;padding-top:12px}pre{white-space:pre-wrap;font:inherit}@media print{body{margin:0;max-width:none}}</style><header><b>DUINDORP SV · ONZE CLUB. ONZE TROTS.</b><h1>${escape(title)}</h1></header><p class="demo">Fictief document uit het prototype. Ondertekening en betalingen zijn demonstraties.</p>${content}<footer>Duindorp SV · ONZE WIJK. ONZE CLUB. ONZE TROTS.</footer></html>`; }
function linesHtml(lines: SponsorLine[], discount: number, savedTotals?: SponsorTotals) { const totals = savedTotals || calculateSponsorTotals(lines, discount); return `<table><thead><tr><th>Omschrijving</th><th>Aantal</th><th>Bedrag excl. btw</th><th>Btw</th></tr></thead><tbody>${lines.map(l => `<tr><td>${escape(l.name)}<br><small>${escape(l.description)}</small></td><td>${l.quantity}</td><td>${money(l.unitPriceCents * l.quantity)}</td><td>${l.taxRate === 'exempt' ? 'Vrijgesteld' : l.taxRate + '%'}</td></tr>`).join('')}</tbody></table><p>Subtotaal: ${money(totals.subtotalCents)}<br>Korting: ${money(totals.discountCents)}<br>Btw: ${money(totals.taxCents)}<br><b>Totaal: ${money(totals.totalCents)}</b></p>`; }
export function getSponsorAgreementHtml(state: CmsState, actorId: string, id: string) { const data = readSponsorship(state), a = data.agreements.find(v => v.id === id); ensure(a, 'Overeenkomst niet gevonden.'); requireAccess(state, actorId, a.sponsorId); const s = a.snapshot; return documentShell(`Sponsorovereenkomst ${a.number}`, `<h2>${escape(s.sponsorName)}</h2><p>${escape(s.sponsorAddress)}<br>${escape(s.sponsorEmail)}</p><p>${escape(s.name)} · ${escape(s.season)}<br>Looptijd: ${escape(s.startDate)} t/m ${escape(s.endDate)} · versie ${a.version}</p>${linesHtml(s.lines, s.discountCents)}<h2>${escape(s.contract?.title || 'Afspraken')}</h2><pre>${escape(s.contract?.body || s.terms)}</pre>${s.contract ? '' : `<p>${escape(s.paymentTerms)}</p>`}<h2>Ondertekenverslag</h2>${a.signatures.length ? a.signatures.map(v => `<p>${v.party === 'club' ? 'Namens Duindorp SV' : v.party === 'sponsor' ? 'Namens de sponsor' : 'Historische ondertekening'}: ${escape(v.name)} · ${escape(v.function)}<br>E-mail: ${escape(v.email || 'Niet vastgelegd in historische versie')}<br>Datum: ${escape(v.at)}<br>IP: ${escape(v.ipAddress)}<br>Verificatie: voorbeeldcode via de demo; geen e-mail verzonden<br>Gebruikersreferentie: ${escape(v.userId)}<br>Uitdrukkelijke instemming: ja</p>`).join('') : '<p>Nog niet ondertekend.</p>'}<p class="note">Documentcontrole (SHA-256): ${escape(a.documentHash)}</p>`); }
export function getSponsorInvoiceHtml(state: CmsState, actorId: string, id: string) { const data = readSponsorship(state), i = data.invoices.find(v => v.id === id); ensure(i, 'Factuur niet gevonden.'); requireAccess(state, actorId, i.sponsorId, 'billing'); const a = data.agreements.find(v => v.id === i.agreementId); ensure(a, 'Overeenkomst niet gevonden.'); return documentShell(`Voorbeeldfactuur ${i.number}`, `<h2>${escape(a.snapshot.sponsorName)}</h2><p>${escape(a.snapshot.sponsorAddress)}</p><p>Factuurdatum: ${escape(i.issueDate)}<br>Vervaldatum: ${escape(i.dueDate)}<br>Status: ${i.status === 'paid' ? 'Betaling gesimuleerd' : i.status === 'open' ? 'Openstaand' : 'Geannuleerd'}</p>${i.installment ? `<p>Termijn ${i.installment.index} van ${i.installment.count}</p>` : ''}${linesHtml(i.lines, i.discountCents, getSponsorInvoiceTotals(i))}<p>${escape(a.snapshot.paymentTerms)}</p>`); }
function _logSponsorReminder(state: CmsState, actorId: string, reminderId: string) { requireManager(state, actorId); const reminder = getSponsorReminders(state).find(r => r.id === reminderId); ensure(reminder, 'Deze herinnering is niet meer actueel.'); activity(ensureSponsorship(state), actorId, reminder.sponsorId, 'reminder', 'Herinnering aangevraagd', `${reminder.title} · verzending wordt door de achtergrondtaak verwerkt.`); }
export function submitSponsorEnquiry(state: CmsState, input: {
    name: string;
    email: string;
    company: string;
    phone: string;
    message: string;
    packageId?: string;
}) { ensure(input.name.trim() && input.company.trim(), 'Vul je naam en bedrijfsnaam in.'); ensure(emailValid(input.email.trim()), 'Vul een geldig e-mailadres in.'); ensure(input.message.length <= 5000, 'Maak je bericht iets korter.'); const data = ensureSponsorship(state); if (input.packageId)
    ensure(data.packages.some(p => p.id === input.packageId && p.active), 'Kies een beschikbaar pakket.'); const at = stamp(); const sponsor: Sponsor = { id: uid('sp-lead'), name: input.company.trim(), companyNumber: '', vatNumber: '', address: '', postalCode: '', city: '', email: input.email.trim().toLowerCase(), phone: input.phone.trim(), website: '', description: '', logoUrl: '', ownerId: '', stage: 'lead', notes: `Aanvraag van ${input.name.trim()}\n${input.message.trim()}${input.packageId ? `\nInteresse: ${data.packages.find(p => p.id === input.packageId)?.name}` : ''}`, publicProfile: { name: input.company.trim(), description: '', website: '', logoUrl: '' }, publicEnabled: false, publicFrom: '', publicUntil: '', createdAt: at, updatedAt: at, demo: false }; data.sponsors.unshift(sponsor); activity(data, '', sponsor.id, 'note', 'Nieuwe sponsorinteresse', `Aangevraagd door ${input.name.trim()} · ${input.message.trim()}`, true); return sponsor; }
export function createSponsorshipSeed(): SponsorshipState { return { sponsors: [], memberships: [], items: [], packages: [], proposals: [], agreements: [], invoices: [], tasks: [], activities: [], profileRequests: [], businessChangeRequests: [], signingChallenges: [], contractTemplates: [createDefaultSponsorContractTemplate()], events: [], settings: { committeeEmail: 'sponsoring@duindorpsv.nl', defaultTerms: '', defaultPaymentTerms: 'Binnen 30 dagen na factuurdatum.', vatNote: '', mollieEnabled: false, reminderDays: [14, 7, 1] } }; }
export function getSponsorInvoiceTotals(invoice: SponsorInvoice): SponsorTotals { return invoice.totals ? clone(invoice.totals) : calculateSponsorTotals(invoice.lines, invoice.discountCents); }
/** Keep the initial calendar day (or month-end) when making monthly installments. */
export function sponsorInstallmentDate(firstDueDate: string, offset: number) {
    ensure(/^\d{4}-\d{2}-\d{2}$/.test(firstDueDate), 'Kies een geldige eerste vervaldatum.');
    const [year, month, day] = firstDueDate.split('-').map(Number), initial = new Date(Date.UTC(year, month - 1, day));
    ensure(initial.toISOString().slice(0, 10) === firstDueDate, 'Kies een bestaande eerste vervaldatum.');
    const target = new Date(Date.UTC(year, month - 1 + offset, 1)), last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate(), initialLast = new Date(Date.UTC(year, month, 0)).getUTCDate();
    target.setUTCDate(day === initialLast ? last : Math.min(day, last));
    return target.toISOString().slice(0, 10);
}
function _createSponsorInvoicePlan(state: CmsState, actorId: string, agreementId: string, input: {
    firstDueDate: string;
    count: 1 | 2 | 3 | 4 | 6 | 12;
}): SponsorInvoice[] {
    requireManager(state, actorId);
    ensure([1, 2, 3, 4, 6, 12].includes(input.count), 'Kies 1, 2, 3, 4, 6 of 12 termijnen.');
    const firstDue = sponsorInstallmentDate(input.firstDueDate, 0);
    ensure(firstDue >= today(), 'De eerste vervaldatum moet op of na de factuurdatum liggen.');
    const data = ensureSponsorship(state), agreement = data.agreements.find(a => a.id === agreementId);
    ensure(agreement && agreement.status === 'signed' && agreement.signingMode==='dual-email-otp' && agreement.signatures.length===2 && agreement.signatures.every(s=>s.verification==='email-otp'&&!s.demo), 'Maak facturen van een ondertekende overeenkomst.');
    ensure(!data.invoices.some(i => i.agreementId === agreementId && i.status !== 'cancelled'), 'Er bestaat al een factuur of termijnplan voor deze overeenkomst.');
    const snapshot = agreement.snapshot, total = calculateSponsorTotals(snapshot.lines, snapshot.discountCents), weights = snapshot.lines.map(l => l.quantity * l.unitPriceCents), discounts = allocate(snapshot.discountCents, weights), lineSplits = weights.map((amount, i) => allocate(amount - discounts[i], Array(input.count).fill(1)));
    const groupSplits = total.taxGroups.map(group => { const netSplits = Array.from({ length: input.count }, (_, index) => snapshot.lines.reduce((sum, line, lineIndex) => sum + (line.taxRate === group.taxRate ? lineSplits[lineIndex][index] : 0), 0)); return { taxRate: group.taxRate, netSplits, taxSplits: allocate(group.taxCents, netSplits) }; });
    const createdAt = stamp(), issueDate = today();
    const invoices: SponsorInvoice[] = Array.from({ length: input.count }, (_, index) => {
        const lines = snapshot.lines.map((line, lineIndex) => ({ ...clone(line), id: uid('sp-term-line'), quantity: 1, unitPriceCents: lineSplits[lineIndex][index], description: [line.description, `Termijn ${index + 1} van ${input.count} · nettobedrag na de overeengekomen korting.`].filter(Boolean).join(' ') }));
        const taxGroups = groupSplits.map(group => ({ taxRate: group.taxRate, netCents: group.netSplits[index], taxCents: group.taxSplits[index] })), netCents = taxGroups.reduce((sum, g) => sum + g.netCents, 0), taxCents = taxGroups.reduce((sum, g) => sum + g.taxCents, 0), totals: SponsorTotals = { subtotalCents: netCents, discountCents: 0, netCents, taxCents, totalCents: netCents + taxCents, taxGroups };
        return { id: uid('sp-invoice'), sponsorId: agreement.sponsorId, agreementId, number: `DSV-F-${new Date().getFullYear()}-${String(data.invoices.length + index + 1).padStart(3, '0')}`, issueDate, dueDate: sponsorInstallmentDate(firstDue, index), status: 'open', lines, discountCents: 0, totalCents: totals.totalCents, paidAt: '', paymentMethod: 'none', createdAt, totals, installment: { index: index + 1, count: input.count } };
    });
    ensure(invoices.reduce((sum, i) => sum + i.totalCents, 0) === total.totalCents, 'De termijnverdeling klopt niet met de overeenkomst.');
    data.invoices.unshift(...invoices);
    activity(data, actorId, agreement.sponsorId, 'invoice', input.count === 1 ? 'Factuur aangemaakt' : 'Termijnfacturen aangemaakt', `${input.count} ${input.count === 1 ? 'factuur' : 'maandelijkse termijnen'} · samen ${money(total.totalCents)} · factuur beschikbaar in het portaal.`);
    return invoices;
}
/** Called only after the server has atomically consumed the bound OTP. */
export function appendVerifiedSponsorSignature(state: CmsState, actorId: string, id: string, party: SponsorSigningParty, input: {
    function: string;
    consent: boolean;
}, proof: {
    challengeId: string;
    email: string;
    verifiedAt: string;
    ipAddress: string;
}) { const data = ensureSponsorship(state), agreement = data.agreements.find(a => a.id === id); ensure(agreement, 'Overeenkomst niet gevonden.'); const user = signatureAccess(state, actorId, agreement, party); ensure(input.consent && input.function.trim(), 'Bevestig je bevoegdheid en vul je functie in.'); ensure(proof.email === user.email.trim().toLowerCase() && proof.challengeId && proof.verifiedAt, 'De e-mailverificatie is niet meer geldig.'); const at = stamp(); agreement.signingMode = 'dual-email-otp'; agreement.signatures.push({ id: uid('sp-signature'), userId: actorId, name: user.name.trim(), function: input.function.trim(), at, ipAddress: proof.ipAddress, verification: 'email-otp', documentHash: agreement.documentHash, consent: true, demo: false, party, email: proof.email, verifiedAt: proof.verifiedAt, challengeId: proof.challengeId }); if (party === 'sponsor') {
    agreement.status = 'awaiting-club-signature';
    activity(data, actorId, agreement.sponsorId, 'agreement', 'Sponsor heeft ondertekend; clubakkoord volgt', agreement.number);
}
else
    finishSponsorAgreement(data, agreement, actorId, at); return agreement; }
function _recordSponsorManualPayment(state: CmsState, actorId: string, id: string, reference: string) { requireManager(state, actorId); const data = ensureSponsorship(state), invoice = data.invoices.find(i => i.id === id); ensure(invoice && invoice.status === 'open', 'Deze factuur staat niet meer open.'); ensure(reference.trim(), 'Vul een betalingskenmerk of toelichting in.'); invoice.status = 'paid'; invoice.paidAt = stamp(); invoice.paymentMethod = 'manual'; activity(data, actorId, invoice.sponsorId, 'invoice', 'Ontvangen betaling geregistreerd', invoice.number + ' · ' + reference.trim()); return invoice; }
function _saveSponsorSettings(state: CmsState, actorId: string, value: SponsorshipState['settings']) { requireManager(state, actorId); ensure(emailValid(value.committeeEmail), 'Vul een geldig commissieadres in.'); ensure(value.reminderDays.every(n => Number.isInteger(n) && n >= 0 && n <= 365), 'Controleer de herinneringstermijnen.'); ensureSponsorship(state).settings = { ...clone(value), mollieEnabled: false }; }
function _saveSponsorEvent(state: CmsState, actorId: string, value: SponsorshipState['events'][number]) { requireManager(state, actorId); ensure(value.title.trim() && Number.isFinite(Date.parse(value.date)) && Number.isInteger(value.capacity) && value.capacity >= 0, 'Controleer titel, datum en capaciteit.'); const data = ensureSponsorship(state), old = data.events.find(e => e.id === value.id); ensure(!value.capacity || !old || old.registrations.reduce((n, r) => n + r.guests, 0) <= value.capacity, 'Er zijn al meer inschrijvingen dan plaatsen.'); const next = { ...clone(value), registrations: old?.registrations || [] }; if (old)
    Object.assign(old, next);
else
    data.events.push(next); return next; }
export const saveSponsor = (...args: Parameters<typeof _saveSponsor>): ReturnType<typeof _saveSponsor> => domainMutation('saveSponsor', args, () => _saveSponsor(...args));
export const saveSponsorBusinessDetails = (...args: Parameters<typeof _saveSponsorBusinessDetails>): ReturnType<typeof _saveSponsorBusinessDetails> => domainMutation('saveSponsorBusinessDetails', args, () => _saveSponsorBusinessDetails(...args));
export const requestSponsorBusinessChange = (...args: Parameters<typeof _requestSponsorBusinessChange>): ReturnType<typeof _requestSponsorBusinessChange> => domainMutation('requestSponsorBusinessChange', args, () => _requestSponsorBusinessChange(...args));
export const reviewSponsorBusinessChange = (...args: Parameters<typeof _reviewSponsorBusinessChange>): ReturnType<typeof _reviewSponsorBusinessChange> => domainMutation('reviewSponsorBusinessChange', args, () => _reviewSponsorBusinessChange(...args));
export const saveSponsorContractTemplate = (...args: Parameters<typeof _saveSponsorContractTemplate>): ReturnType<typeof _saveSponsorContractTemplate> => domainMutation('saveSponsorContractTemplate', args, () => _saveSponsorContractTemplate(...args));
export const removeSponsorContractTemplate = (...args: Parameters<typeof _removeSponsorContractTemplate>): ReturnType<typeof _removeSponsorContractTemplate> => domainMutation('removeSponsorContractTemplate', args, () => _removeSponsorContractTemplate(...args));
export const saveMembership = (...args: Parameters<typeof _saveMembership>): ReturnType<typeof _saveMembership> => domainMutation('saveMembership', args, () => _saveMembership(...args));
export const removeSponsorMembership = (...args: Parameters<typeof _removeSponsorMembership>): ReturnType<typeof _removeSponsorMembership> => domainMutation('removeSponsorMembership', args, () => _removeSponsorMembership(...args));
export const saveSponsorItem = (...args: Parameters<typeof _saveSponsorItem>): ReturnType<typeof _saveSponsorItem> => domainMutation('saveSponsorItem', args, () => _saveSponsorItem(...args));
export const saveSponsorPackage = (...args: Parameters<typeof _saveSponsorPackage>): ReturnType<typeof _saveSponsorPackage> => domainMutation('saveSponsorPackage', args, () => _saveSponsorPackage(...args));
export const createSponsorProposal = (...args: Parameters<typeof _createSponsorProposal>): ReturnType<typeof _createSponsorProposal> => domainMutation('createSponsorProposal', args, () => _createSponsorProposal(...args));
export const saveSponsorProposal = (...args: Parameters<typeof _saveSponsorProposal>): ReturnType<typeof _saveSponsorProposal> => domainMutation('saveSponsorProposal', args, () => _saveSponsorProposal(...args));
export const sendSponsorProposal = (...args: Parameters<typeof _sendSponsorProposal>): ReturnType<typeof _sendSponsorProposal> => domainMutation('sendSponsorProposal', args, () => _sendSponsorProposal(...args));
export const acceptSponsorProposal = (...args: Parameters<typeof _acceptSponsorProposal>): ReturnType<typeof _acceptSponsorProposal> => domainMutation('acceptSponsorProposal', args, () => _acceptSponsorProposal(...args));
export const createSponsorAgreement = (...args: Parameters<typeof _createSponsorAgreement>): ReturnType<typeof _createSponsorAgreement> => domainMutation('createSponsorAgreement', args, () => _createSponsorAgreement(...args));
export const requestSponsorSigningCode = (...args: Parameters<typeof _requestSponsorSigningCode>): ReturnType<typeof _requestSponsorSigningCode> => domainMutation('requestSponsorSigningCode', args, () => _requestSponsorSigningCode(...args));
export const signSponsorAgreement = (...args: Parameters<typeof _signSponsorAgreement>): ReturnType<typeof _signSponsorAgreement> => domainMutation('signSponsorAgreement', args, () => _signSponsorAgreement(...args));
export const countersignSponsorAgreement = (...args: Parameters<typeof _countersignSponsorAgreement>): ReturnType<typeof _countersignSponsorAgreement> => domainMutation('countersignSponsorAgreement', args, () => _countersignSponsorAgreement(...args));
export const trySignSponsorAgreement = (...args: Parameters<typeof _trySignSponsorAgreement>): ReturnType<typeof _trySignSponsorAgreement> => domainMutation('trySignSponsorAgreement', args, () => _trySignSponsorAgreement(...args));
export const tryCountersignSponsorAgreement = (...args: Parameters<typeof _tryCountersignSponsorAgreement>): ReturnType<typeof _tryCountersignSponsorAgreement> => domainMutation('tryCountersignSponsorAgreement', args, () => _tryCountersignSponsorAgreement(...args));
export const createSponsorInvoice = (...args: Parameters<typeof _createSponsorInvoice>): ReturnType<typeof _createSponsorInvoice> => domainMutation('createSponsorInvoice', args, () => _createSponsorInvoice(...args));
export const updateSponsorTask = (...args: Parameters<typeof _updateSponsorTask>): ReturnType<typeof _updateSponsorTask> => domainMutation('updateSponsorTask', args, () => _updateSponsorTask(...args));
export const addSponsorNote = (...args: Parameters<typeof _addSponsorNote>): ReturnType<typeof _addSponsorNote> => domainMutation('addSponsorNote', args, () => _addSponsorNote(...args));
export const requestSponsorProfile = (...args: Parameters<typeof _requestSponsorProfile>): ReturnType<typeof _requestSponsorProfile> => domainMutation('requestSponsorProfile', args, () => _requestSponsorProfile(...args));
export const approveSponsorProfile = (...args: Parameters<typeof _approveSponsorProfile>): ReturnType<typeof _approveSponsorProfile> => domainMutation('approveSponsorProfile', args, () => _approveSponsorProfile(...args));
export const saveSponsorMaterial = (...args: Parameters<typeof _saveSponsorMaterial>): ReturnType<typeof _saveSponsorMaterial> => domainMutation('saveSponsorMaterial', args, () => _saveSponsorMaterial(...args));
export const registerSponsorEvent = (...args: Parameters<typeof _registerSponsorEvent>): ReturnType<typeof _registerSponsorEvent> => domainMutation('registerSponsorEvent', args, () => _registerSponsorEvent(...args));
export const cancelSponsorEvent = (...args: Parameters<typeof _cancelSponsorEvent>): ReturnType<typeof _cancelSponsorEvent> => domainMutation('cancelSponsorEvent', args, () => _cancelSponsorEvent(...args));
export const renewSponsorAgreement = (...args: Parameters<typeof _renewSponsorAgreement>): ReturnType<typeof _renewSponsorAgreement> => domainMutation('renewSponsorAgreement', args, () => _renewSponsorAgreement(...args));
export const logSponsorReminder = (...args: Parameters<typeof _logSponsorReminder>): ReturnType<typeof _logSponsorReminder> => domainMutation('logSponsorReminder', args, () => _logSponsorReminder(...args));
export const createSponsorInvoicePlan = (...args: Parameters<typeof _createSponsorInvoicePlan>): ReturnType<typeof _createSponsorInvoicePlan> => domainMutation('createSponsorInvoicePlan', args, () => _createSponsorInvoicePlan(...args));
export const recordSponsorManualPayment = (...args: Parameters<typeof _recordSponsorManualPayment>): ReturnType<typeof _recordSponsorManualPayment> => domainMutation('recordSponsorManualPayment', args, () => _recordSponsorManualPayment(...args));
export const saveSponsorSettings = (...args: Parameters<typeof _saveSponsorSettings>): ReturnType<typeof _saveSponsorSettings> => domainMutation('saveSponsorSettings', args, () => _saveSponsorSettings(...args));
export const saveSponsorEvent = (...args: Parameters<typeof _saveSponsorEvent>): ReturnType<typeof _saveSponsorEvent> => domainMutation('saveSponsorEvent', args, () => _saveSponsorEvent(...args));

export function validateSponsorSigningAccess(state:CmsState,actorId:string,id:string,party:SponsorSigningParty){
 const agreement=readSponsorship(state).agreements.find(a=>a.id===id);ensure(agreement,'Overeenkomst niet gevonden.');return signatureAccess(state,actorId,agreement,party);
}

/** Historical bytes are authoritative; JSONB/schema field order is irrelevant. */
export function sponsorSnapshotBytes(agreement:SponsorAgreement){
 const bytes=agreement.snapshotBytes||JSON.stringify(agreement.snapshot);
 const sort=(v:any):any=>Array.isArray(v)?v.map(sort):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort(v[k])])):v;
 ensure(!agreement.hashFormat||agreement.hashFormat==='json-utf8-v1','Onbekend documenthashformaat.');
 let original:unknown;try{original=JSON.parse(bytes);}catch{throw new Error('De vastgelegde documentserialisatie is ongeldig.');}
 ensure(JSON.stringify(sort(original))===JSON.stringify(sort(agreement.snapshot)),'De vaste documentinhoud komt niet overeen met de opgeslagen serialisatie.');
 ensure(sha256(bytes)===agreement.documentHash,'De vaste documenthash komt niet overeen.');
 return bytes;
}
