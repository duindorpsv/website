import { domainUid, domainMutation } from './domain-commands';
import type { CmsMember, CmsPerson, CmsState } from './types';
import type { CreateDirectoryInvitationInput, DirectoryAssignment, DirectoryGuardian, DirectoryImportPerson, DirectoryInvitation, DirectoryInvitationView, DirectoryPortalProjection, DirectoryProfile, DirectoryRow, DirectoryState, GuardianPermission, SaveDirectoryPersonInput } from './directory-types';
import { ensureSponsorship, readSponsorship } from './sponsorship';
const stamp = () => new Date().toISOString();
const uid = domainUid;
const clone = <T,>(value: T): T => structuredClone(value);
const email = (value: string) => value.trim().toLowerCase();
const validEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
function assert(value: unknown, message: string): asserts value { if (!value)
    throw new Error(message); }
const isoDate = (value: string) => !value || /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
const guardianPermissions: GuardianPermission[] = ['schedule', 'attendance', 'forms', 'profile', 'finance'];
const actor = (state: CmsState, userId: string) => state.members.find(user => user.id === userId && user.active);
function actorHas(state: CmsState, userId: string, permission: string) { const user = actor(state, userId), role = state.roles.find(row => row.id === user?.roleId); return !!role && !role.teamScoped && (role.permissions as string[]).includes(permission); }
export function canManageDirectory(state: CmsState, userId: string) { return actorHas(state, userId, 'directory') || actorHas(state, userId, 'users'); }
export function canAccessDirectory(state: CmsState, userId: string) { return canManageDirectory(state, userId) || actorHas(state, userId, 'sponsors'); }
function requireGlobal(state: CmsState, userId: string) { assert(canManageDirectory(state, userId), 'Je hebt rechten voor de ledenadministratie nodig.'); }
function requireUsers(state: CmsState, userId: string) { assert(actorHas(state, userId, 'users'), 'Alleen gebruikersbeheer kan deze accountkoppeling of toegang wijzigen.'); }
function guardPublishedContact(state: CmsState, userId: string, old: CmsPerson | undefined, next: Pick<CmsPerson, 'name' | 'email' | 'phone'>) { if (old?.published && (old.name !== next.name.trim() || old.email !== next.email.trim() || old.phone !== next.phone.trim()))
    assert(actorHas(state, userId, 'people') && actorHas(state, userId, 'publish'), 'Dit contact staat op de website. Wijzig naam, e-mail of telefoon via Websiteprofielen met publicatierechten.'); }
function emptyDirectory(): DirectoryState { return { version: 1, profiles: [], guardians: [], invitations: [], assignments: [], events: [] }; }
export function directoryPersonTemplate(id = uid('person')): CmsPerson { return { id, name: '', role: '', group: '', teamId: '', bio: '', mediaId: '', email: '', phone: '', showContact: false, published: false, order: 0 }; }
export function directoryProfileTemplate(personId: string): DirectoryProfile { return { personId, birthDate: '', membership: 'none', status: 'active', labels: [], teamIds: [], address: '', postalCode: '', city: '', source: 'manual', sourceUpdatedAt: '', updatedAt: stamp(), sponsorIds: [] }; }
function event(state: CmsState, personId: string, actorId: string, action: string) { state.directory!.events.unshift({ id: uid('directory-event'), personId, actorId, action, at: stamp() }); }
function syncExisting(state: CmsState) {
    const data = state.directory!;
    for (const member of state.members) {
        if (member.personId && !state.people.some(person => person.id === member.personId))
            continue;
        let person = state.people.find(p => p.backofficeUserId === member.id) || state.people.find(p => p.id === member.personId);
        if (!person) {
            person = { ...directoryPersonTemplate(`person-account-${member.id}`), name: member.name, email: member.email, backofficeUserId: member.id, order: state.people.length };
            state.people.push(person);
        }
        if (!person.backofficeUserId)
            person.backofficeUserId = member.id;
        if (person.backofficeUserId === member.id)
            member.personId = person.id;
    }
    for (const person of state.people) {
        if (!data.profiles.some(profile => profile.personId === person.id)) {
            const profile = directoryProfileTemplate(person.id);
            profile.teamIds = person.teamId ? [person.teamId] : [];
            profile.source = person.sportlinkId ? 'sportlink' : person.backofficeUserId ? 'account' : 'manual';
            data.profiles.push(profile);
        }
        const profile = data.profiles.find(row => row.personId === person.id)!;
        const user = state.members.find(u => u.id === person.backofficeUserId);
        if (user) {
            user.personId = person.id;
            const ids = readSponsorship(state).memberships.filter(link => link.userId === user.id).map(link => link.sponsorId);
            profile.sponsorIds = [...new Set([...profile.sponsorIds, ...ids])];
        }
    }
}
export function initializeDirectory(state: CmsState) { if (!state.directory) { state.directory = emptyDirectory(); syncExisting(state); } return state.directory; }
export function readDirectory(state: CmsState): DirectoryState { if (state.directory)
    return state.directory; const copy = clone(state); return initializeDirectory(copy); }
export function ensureDirectory(state: CmsState) { return initializeDirectory(state); }
function effectiveState(state: CmsState) { if (state.directory)
    return state; const copy = clone(state); initializeDirectory(copy); return copy; }
export function getDirectoryProfile(state: CmsState, personId: string) { return clone(readDirectory(state).profiles.find(profile => profile.personId === personId) || directoryProfileTemplate(personId)); }
export function getDirectoryAccountForUser(state: CmsState, userId: string) { const source = effectiveState(state), user = actor(source, userId); return user ? source.people.find(person => person.id === user.personId || person.backofficeUserId === userId) || null : null; }
function sponsorIdsForPerson(state: CmsState, personId: string) { const data = readDirectory(state), person = state.people.find(p => p.id === personId), userId = person?.backofficeUserId||state.members.find(m=>m.personId===personId)?.id; return [...new Set([...(data.profiles.find(profile => profile.personId === personId)?.sponsorIds || []), ...readSponsorship(state).memberships.filter(link => link.userId === userId).map(link => link.sponsorId)])]; }
function isSponsorContact(state: CmsState, personId: string, sponsorId?: string) { const ids = sponsorIdsForPerson(state, personId); return sponsorId ? ids.includes(sponsorId) : ids.length > 0; }
function canReadPerson(state: CmsState, userId: string, personId: string) { return canManageDirectory(state, userId) || actorHas(state, userId, 'sponsors') && isSponsorContact(state, personId); }
export function getDirectoryRows(state: CmsState, userId: string): DirectoryRow[] { if (!canAccessDirectory(state, userId))
    return []; const source = effectiveState(state), data = readDirectory(source), full = canManageDirectory(source, userId); return source.people.filter(person => !person.deletedAt && canReadPerson(source, userId, person.id)).map(person => { const profile = getDirectoryProfile(source, person.id), user = source.members.find(row => row.id === person.backofficeUserId || row.personId === person.id), invitation = data.invitations.filter(row => row.personId === person.id && (full || row.scope === 'sponsor')).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]; const sponsorIds = sponsorIdsForPerson(source, person.id); if (!full) {
    const safePerson = { ...directoryPersonTemplate(person.id), name: person.name, email: person.email, phone: person.phone, backofficeUserId: user?.id };
    const safeProfile = { ...directoryProfileTemplate(person.id), source: 'manual' as const, sponsorIds };
    return { person: safePerson, profile: safeProfile, account: user ? { id: user.id, name: user.name, email: user.email, active: user.active, roleId: 'sponsor', teamIds: [] } : undefined, invitation: invitation ? clone(invitation) : undefined, sponsorIds, committeeNames: [] };
} return { person: clone(person), profile, account: user ? clone(user) : undefined, invitation: invitation ? clone(invitation) : undefined, sponsorIds, committeeNames: source.planning.committees.filter(c => c.members.some(m => m.personId === person.id)).map(c => c.name) }; }); }
export const visibleDirectoryPeople = getDirectoryRows;
function _saveDirectoryPerson(state: CmsState, userId: string, input: SaveDirectoryPersonInput) {
    assert(canAccessDirectory(state, userId), 'Je hebt geen toegang tot dit register.');
    const data = ensureDirectory(state), old = state.people.find(row => row.id === input.person.id);
    assert(input.person.name.trim(), 'Vul een naam in.');
    assert(!input.person.email || validEmail(input.person.email.trim()), 'Vul een geldig contactadres in.');
    assert(isoDate(input.profile.birthDate), 'Controleer de geboortedatum.');
    const full = canManageDirectory(state, userId);
    if (!full) {
        assert(input.sponsorId && readSponsorship(state).sponsors.some(s => s.id === input.sponsorId), 'Kies een sponsorbedrijf.');
        assert(!old || isSponsorContact(state, old.id, input.sponsorId), 'Dit contact hoort niet bij dit sponsorbedrijf.');
        assert(!old?.deletedAt, 'Dit contact is gearchiveerd.');
        guardPublishedContact(state, userId, old, input.person);
        const person = old ? { ...old, name: input.person.name.trim(), email: input.person.email.trim(), phone: input.person.phone.trim() } : { ...directoryPersonTemplate(input.person.id), name: input.person.name.trim(), email: input.person.email.trim(), phone: input.person.phone.trim(), order: state.people.length };
        const profile = old ? getDirectoryProfile(state, old.id) : directoryProfileTemplate(person.id);
        profile.sponsorIds = [...new Set([...profile.sponsorIds, input.sponsorId])];
        profile.updatedAt = stamp();
        const index = state.people.findIndex(row => row.id === person.id);
        if (index < 0)
            state.people.push(person);
        else
            state.people[index] = person;
        const pi = data.profiles.findIndex(row => row.personId === person.id);
        if (pi < 0)
            data.profiles.push(profile);
        else
            data.profiles[pi] = profile;
        event(state, person.id, userId, 'Sponsorcontact bijgewerkt');
        return person;
    }
    assert(!old?.deletedAt, 'Herstel deze persoon eerst.');
    guardPublishedContact(state, userId, old, input.person);
    assert(!input.person.sportlinkId || !state.people.some(person => person.id !== input.person.id && person.sportlinkId === input.person.sportlinkId), 'Deze Sportlink-referentie hoort al bij een persoon.');
    const person = { ...clone(input.person), name: input.person.name.trim(), email: input.person.email.trim(), phone: input.person.phone.trim(), backofficeUserId: old?.backofficeUserId, order: old?.order ?? state.people.length };
    if (!actorHas(state, userId, 'people')) {
        person.published = old?.published || false;
        person.showContact = old?.showContact || false;
        person.bio = old?.bio || '';
        person.mediaId = old?.mediaId || '';
    }
    const profile = { ...clone(input.profile), personId: person.id, updatedAt: stamp(), sponsorIds: old ? getDirectoryProfile(state, old.id).sponsorIds : input.sponsorId ? [input.sponsorId] : [] };
    assert(['playing', 'non-playing', 'none'].includes(profile.membership) && ['active', 'former', 'archived'].includes(profile.status), 'Kies geldige lidmaatschapsgegevens.');
    const index = state.people.findIndex(row => row.id === person.id);
    if (index < 0)
        state.people.push(person);
    else
        state.people[index] = person;
    const pi = data.profiles.findIndex(row => row.personId === person.id);
    if (pi < 0)
        data.profiles.push(profile);
    else
        data.profiles[pi] = profile;
    const linked = state.members.find(member => member.id === person.backofficeUserId);
    if (linked)
        linked.name = person.name;
    event(state, person.id, userId, 'Persoonsgegevens bijgewerkt');
    return person;
}
function _bindDirectoryAccount(state: CmsState, userId: string, personId: string, accountId: string) { requireUsers(state, userId); const data = ensureDirectory(state); const person = state.people.find(p => p.id === personId && !p.deletedAt), account = state.members.find(member => member.id === accountId); assert(person && account, 'Kies een bestaande persoon en gebruiker.'); assert(!person.backofficeUserId || person.backofficeUserId === accountId, 'Deze persoon heeft al een account.'); const previous = state.people.find(p => p.id !== personId && (p.backofficeUserId === accountId || p.id === account.personId)); if (previous) {
    const profile = getDirectoryProfile(state, previous.id);
    const untouched = previous.id === `person-account-${accountId}` && !previous.deletedAt && !previous.published && !previous.showContact && !previous.sportlinkId && !previous.role && !previous.group && !previous.bio && !previous.mediaId && !previous.phone && !previous.teamId && previous.name === account.name && email(previous.email) === email(account.email) && !profile.birthDate && !profile.address && !profile.postalCode && !profile.city && profile.membership === 'none' && profile.status === 'active' && !profile.labels.length && !profile.teamIds.length && profile.source === 'account' && !profile.sourceUpdatedAt && !data.guardians.some(row => row.guardianPersonId === previous.id || row.childPersonId === previous.id) && !data.assignments.some(row => row.personId === previous.id) && !data.invitations.some(row => row.personId === previous.id) && !data.events.some(row => row.personId === previous.id) && !state.planning.committees.some(committee => committee.members.some(member => member.personId === previous.id));
    assert(untouched, 'Dit account hoort al bij een uitgewerkt persoon. Laat gebruikersbeheer de dossiers beoordelen.');
    const targetProfile = data.profiles.find(row => row.personId === person.id)!;
    targetProfile.sponsorIds = [...new Set([...targetProfile.sponsorIds, ...profile.sponsorIds])];
    previous.backofficeUserId = undefined;
    previous.deletedAt = stamp();
    data.profiles.find(row => row.personId === previous.id)!.status = 'archived';
    event(state, personId, userId, `Account expliciet overgezet van ${previous.id} naar ${personId}; gebruiker ${accountId} behouden`);
}
else
    assert(!account.personId || account.personId === personId, 'Dit account hoort al bij een andere persoon.'); person.backofficeUserId = accountId; account.personId = personId; event(state, personId, userId, 'Bestaand account gekoppeld'); }
function _setDirectoryAccountActive(state: CmsState, userId: string, accountId: string, active: boolean) { requireUsers(state, userId); ensureDirectory(state); const account = state.members.find(member => member.id === accountId); assert(account, 'Account niet gevonden.'); const role = state.roles.find(r => r.id === account.roleId); if (!active && role?.permissions.includes('users'))
    assert(state.members.some(other => other.id !== account.id && other.active && state.roles.some(r => r.id === other.roleId && r.permissions.includes('users'))), 'Behoud minimaal één actieve gebruikersbeheerder.'); account.active = active; event(state, account.personId || '', userId, active ? 'Account geactiveerd' : 'Account geblokkeerd'); }
export function invitationStatus(invitation: DirectoryInvitation, at = stamp()): DirectoryInvitationView['status'] { return invitation.status === 'pending' && invitation.expiresAt <= at ? 'expired' : invitation.status; }
function _createDirectoryInvitation(state: CmsState, userId: string, input: CreateDirectoryInvitationInput) {
    assert(canAccessDirectory(state, userId), 'Je hebt geen uitnodigingsrechten.');
    const data = ensureDirectory(state), person = state.people.find(p => p.id === input.personId && !p.deletedAt);
    assert(person, 'Persoon niet gevonden.');
    const full = canManageDirectory(state, userId);
    assert(validEmail(input.email.trim()), 'Vul een persoonlijk inlogadres in.');
    if (!full) {
        assert(input.scope === 'sponsor' && input.sponsorId && isSponsorContact(state, person.id, input.sponsorId), 'Je kunt alleen gekoppelde sponsorcontacten uitnodigen.');
    }
    if (input.scope === 'sponsor') {
        assert(input.sponsorId && readSponsorship(state).sponsors.some(s => s.id === input.sponsorId), 'Kies een geldig sponsorbedrijf.');
        assert(input.sponsorRoles?.length && input.sponsorRoles.every(role => ['signer', 'billing', 'marketing'].includes(role)), 'Kies minimaal één bedrijfsrecht.');
    }
    else
        assert(full, 'Alleen de ledenadministratie verstuurt clubuitnodigingen.');
    const target = email(input.email);
    assert(!data.invitations.some(invite => invite.personId !== person.id && invite.email === target && invitationStatus(invite) === 'pending'), 'Dit inlogadres is al uitgenodigd voor een andere persoon. Gebruik een eigen adres of laat gebruikersbeheer dit beoordelen.');
    const linked = state.members.find(member => member.id === person.backofficeUserId);
    if (linked) {
        assert(linked.active, 'Dit account is geblokkeerd. Laat gebruikersbeheer dit beoordelen.');
        assert(email(linked.email) === target, 'Het bestaande inlogadres wijkt af. Laat gebruikersbeheer dit beoordelen.');
    }
    assert(!state.members.some(member => email(member.email) === target && member.id !== linked?.id), 'Dit inlogadres hoort bij een andere persoon. Laat gebruikersbeheer de koppeling beoordelen.');
    const at = stamp();
    for (const old of data.invitations.filter(row => row.personId === person.id && row.status === 'pending'))
        old.status = 'revoked';
    const invitation: DirectoryInvitation = { id: uid('invite'), personId: person.id, email: target, scope: input.scope, sponsorId: input.scope === 'sponsor' ? input.sponsorId! : '', sponsorRoles: input.scope === 'sponsor' ? [...new Set(input.sponsorRoles!)] : [], token: uid('invitation'), status: 'pending', createdAt: at, expiresAt: new Date(Date.now() + 72 * 3600000).toISOString(), createdBy: userId, acceptedAt: '', userId: '' };
    data.invitations.unshift(invitation);
    event(state, person.id, userId, 'Uitnodiging klaargezet voor verzending');
    return invitation;
}
function _revokeDirectoryInvitation(state: CmsState, userId: string, id: string) { const data = ensureDirectory(state), invitation = data.invitations.find(row => row.id === id); assert(invitation, 'Uitnodiging niet gevonden.'); assert(canManageDirectory(state, userId) || actorHas(state, userId, 'sponsors') && invitation.scope === 'sponsor' && isSponsorContact(state, invitation.personId, invitation.sponsorId), 'Deze uitnodiging valt buiten jouw toegang.'); assert(invitation.status === 'pending', 'Deze uitnodiging is niet meer actief.'); invitation.status = 'revoked'; event(state, invitation.personId, userId, 'Uitnodiging ingetrokken'); }
function maskEmail(value: string) { const [name, host] = value.split('@'); return `${name.slice(0, 1)}${'•'.repeat(Math.min(6, Math.max(2, name.length - 1)))}@${host}`; }
export function getDirectoryInvitation(state: CmsState, token: string): DirectoryInvitationView { const source = effectiveState(state), invitation = readDirectory(source).invitations.find(row => row.token === token), person = source.people.find(p => p.id === invitation?.personId && !p.deletedAt); assert(invitation && person, 'Deze uitnodiging is niet beschikbaar. Vraag de club om een nieuwe link.'); const status = invitationStatus(invitation); return { id: invitation.id, personName: status === 'pending' ? person.name : 'Uitnodiging niet actief', emailHint: status === 'pending' ? maskEmail(invitation.email) : '', scope: invitation.scope, sponsorName: status === 'pending' && invitation.sponsorId ? readSponsorship(source).sponsors.find(s => s.id === invitation.sponsorId)?.name || 'Sponsorbedrijf' : '', expiresAt: invitation.expiresAt, status }; }
export function acceptDirectoryInvitation(_state: CmsState, _token: string, _input: {
    email: string;
    code: string;
    consent: boolean;
}): never { throw new Error('Accepteer de uitnodiging via de beveiligde serverroute.'); }
export function demoDirectoryLogin(_state: CmsState, _email: string, _code: string): never { throw new Error('Gebruik de centrale e-mailcode om in te loggen.'); }
function _saveDirectoryGuardian(state: CmsState, userId: string, value: DirectoryGuardian) { requireGlobal(state, userId); const data = ensureDirectory(state); assert(value.guardianPersonId !== value.childPersonId, 'Een persoon kan niet zijn eigen verzorger zijn.'); assert(state.people.some(p => p.id === value.guardianPersonId && !p.deletedAt) && state.people.some(p => p.id === value.childPersonId && !p.deletedAt), 'Kies twee bestaande personen.'); assert(value.permissions.length > 0 && value.permissions.every(p => guardianPermissions.includes(p)), 'Kies minimaal één geldige toegang.'); assert(!data.guardians.some(row => row.id !== value.id && row.guardianPersonId === value.guardianPersonId && row.childPersonId === value.childPersonId && row.status !== 'revoked'), 'Deze ouder-kindrelatie bestaat al.'); const next = { ...clone(value), requestedAt: value.requestedAt || stamp(), requestedBy: value.requestedBy || userId, approvedAt: value.status === 'approved' ? stamp() : '', approvedBy: value.status === 'approved' ? userId : '' }; const index = data.guardians.findIndex(row => row.id === next.id); if (index < 0)
    data.guardians.push(next);
else
    data.guardians[index] = next; event(state, value.childPersonId, userId, 'Ouder-kindrelatie bijgewerkt'); return next; }
function _approveDirectoryGuardian(state: CmsState, userId: string, id: string, approved: boolean) { requireGlobal(state, userId); const data = ensureDirectory(state), link = data.guardians.find(row => row.id === id); assert(link, 'Relatie niet gevonden.'); link.status = approved ? 'approved' : 'revoked'; link.approvedAt = stamp(); link.approvedBy = userId; event(state, link.childPersonId, userId, approved ? 'Ouderrelatie goedgekeurd' : 'Ouderrelatie ingetrokken'); return link; }
function _requestDirectoryGuardian(state: CmsState, userId: string, input: {
    childPersonId: string;
    relationship: DirectoryGuardian['relationship'];
    permissions: GuardianPermission[];
}) { const user = actor(state, userId); assert(user, 'Gebruik eerst je eigen account.'); const data = ensureDirectory(state), person = state.people.find(p => p.id === user.personId || p.backofficeUserId === user.id), child = state.people.find(p => p.id === input.childPersonId && !p.deletedAt); assert(person && child && person.id !== child.id, 'Deze koppeling kan niet worden aangevraagd. Neem contact op met de club.'); assert(!data.guardians.some(row => row.guardianPersonId === person.id && row.childPersonId === child.id && row.status !== 'revoked'), 'Deze koppeling is al bekend of wordt beoordeeld.'); assert(input.permissions.length && input.permissions.every(permission => guardianPermissions.includes(permission)), 'Kies een geldige toegang.'); const link: DirectoryGuardian = { id: uid('guardian'), guardianPersonId: person.id, childPersonId: child.id, relationship: input.relationship, permissions: [...new Set(input.permissions)], status: 'pending', requestedAt: stamp(), requestedBy: userId, approvedAt: '', approvedBy: '' }; data.guardians.push(link); event(state, child.id, userId, 'Ouderrelatie aangevraagd · wacht op clubcontrole'); return link; }
function _saveDirectoryAssignment(state: CmsState, userId: string, value: DirectoryAssignment) { requireGlobal(state, userId); const data = ensureDirectory(state); assert(state.people.some(p => p.id === value.personId && !p.deletedAt) && value.name.trim(), 'Kies een bestaande persoon en functienaam.'); assert(isoDate(value.startsAt) && isoDate(value.endsAt) && (!value.startsAt || !value.endsAt || value.startsAt <= value.endsAt), 'Controleer de functieperiode.'); if (value.committeeId)
    assert(state.planning.committees.some(c => c.id === value.committeeId), 'Commissie niet gevonden.'); const index = data.assignments.findIndex(row => row.id === value.id); if (index < 0)
    data.assignments.push(clone(value));
else
    data.assignments[index] = clone(value); event(state, value.personId, userId, 'Clubfunctie bijgewerkt'); return value; }
function _removeDirectoryAssignment(state: CmsState, userId: string, id: string) { requireGlobal(state, userId); const data = ensureDirectory(state), value = data.assignments.find(row => row.id === id); assert(value, 'Functie niet gevonden.'); data.assignments = data.assignments.filter(row => row.id !== id); event(state, value.personId, userId, 'Clubfunctie verwijderd'); }
export function portalDirectoryProjection(state: CmsState, userId: string): DirectoryPortalProjection { const source = effectiveState(state), user = actor(source, userId), person = user ? source.people.find(row => row.id === user.personId || row.backofficeUserId === userId) : null; if (!user || !person || person.deletedAt)
    return { person: null, profile: null, children: [], pendingGuardianRequests: [], sponsorIds: [], functions: [] }; const data = readDirectory(source), profile = getDirectoryProfile(source, person.id), date = stamp().slice(0, 10); const own = data.guardians.filter(row => row.guardianPersonId === person.id); return { person: { id: person.id, name: person.name, email: person.email, phone: person.phone }, profile: { membership: profile.membership, status: profile.status, labels: [...profile.labels], teamIds: [...profile.teamIds] }, children: own.filter(row => row.status === 'approved').flatMap(row => { const child = source.people.find(p => p.id === row.childPersonId && !p.deletedAt); return child ? [{ linkId: row.id, personId: child.id, name: child.name, teamIds: row.permissions.some(permission => permission === 'schedule' || permission === 'attendance') ? getDirectoryProfile(source, child.id).teamIds : [], relationship: row.relationship, permissions: [...row.permissions] }] : []; }), pendingGuardianRequests: own.filter(row => row.status === 'pending').map(row => ({ id: row.id, childName: 'Jeugdlid · verzoek ter beoordeling', status: row.status })), sponsorIds: readSponsorship(source).memberships.filter(row => row.userId === userId).map(row => row.sponsorId), functions: [...source.planning.committees.filter(c => c.active && c.members.some(m => m.personId === person.id)).map(c => `${c.name} · ${c.members.find(m => m.personId === person.id)?.role || 'Lid'}`), ...data.assignments.filter(a => a.personId === person.id && (!a.startsAt || a.startsAt <= date) && (!a.endsAt || a.endsAt >= date)).map(a => a.name)] }; }
function _importDirectoryPeople(state: CmsState, userId: string, rows: DirectoryImportPerson[]) { requireGlobal(state, userId); const data = ensureDirectory(state); const ids = rows.map(row => row.sportlinkId.trim().toUpperCase()); assert(ids.every(Boolean) && new Set(ids).size === ids.length, 'Gebruik unieke Sportlink-referenties.'); for (const row of rows) {
    assert(row.name.trim() && (!row.email || validEmail(row.email.trim())) && isoDate(row.birthDate || ''), 'Controleer de geïmporteerde persoonsregels.');
    guardPublishedContact(state, userId, state.people.find(person => person.sportlinkId?.trim().toUpperCase() === row.sportlinkId.trim().toUpperCase()), row);
} let created = 0, updated = 0; for (const row of rows) {
    let person = state.people.find(p => p.sportlinkId?.trim().toUpperCase() === row.sportlinkId.trim().toUpperCase());
    if (!person) {
        person = { ...directoryPersonTemplate(), name: row.name.trim(), sportlinkId: row.sportlinkId.trim().toUpperCase(), order: state.people.length };
        state.people.push(person);
        data.profiles.push(directoryProfileTemplate(person.id));
        created++;
    }
    else
        updated++;
    person.name = row.name.trim();
    person.email = row.email.trim();
    person.phone = row.phone.trim();
    const linked = state.members.find(member => member.id === person!.backofficeUserId);
    if (linked)
        linked.name = person.name;
    const profile = data.profiles.find(p => p.personId === person!.id)!;
    profile.source = 'sportlink';
    profile.sourceUpdatedAt = stamp();
    profile.updatedAt = stamp();
    if (row.birthDate !== undefined)
        profile.birthDate = row.birthDate;
    if (row.membership !== undefined)
        profile.membership = row.membership;
    if (row.teamIds !== undefined)
        profile.teamIds = [...row.teamIds];
    event(state, person.id, userId, 'Sportlink-brongegevens bijgewerkt');
} return { created, updated }; }
export const saveDirectoryPerson = (...args: Parameters<typeof _saveDirectoryPerson>): ReturnType<typeof _saveDirectoryPerson> => domainMutation('saveDirectoryPerson', args, () => _saveDirectoryPerson(...args));
export const bindDirectoryAccount = (...args: Parameters<typeof _bindDirectoryAccount>): ReturnType<typeof _bindDirectoryAccount> => domainMutation('bindDirectoryAccount', args, () => _bindDirectoryAccount(...args));
export const setDirectoryAccountActive = (...args: Parameters<typeof _setDirectoryAccountActive>): ReturnType<typeof _setDirectoryAccountActive> => domainMutation('setDirectoryAccountActive', args, () => _setDirectoryAccountActive(...args));
export const createDirectoryInvitation = (...args: Parameters<typeof _createDirectoryInvitation>): ReturnType<typeof _createDirectoryInvitation> => domainMutation('createDirectoryInvitation', args, () => _createDirectoryInvitation(...args));
export const revokeDirectoryInvitation = (...args: Parameters<typeof _revokeDirectoryInvitation>): ReturnType<typeof _revokeDirectoryInvitation> => domainMutation('revokeDirectoryInvitation', args, () => _revokeDirectoryInvitation(...args));
export const saveDirectoryGuardian = (...args: Parameters<typeof _saveDirectoryGuardian>): ReturnType<typeof _saveDirectoryGuardian> => domainMutation('saveDirectoryGuardian', args, () => _saveDirectoryGuardian(...args));
export const approveDirectoryGuardian = (...args: Parameters<typeof _approveDirectoryGuardian>): ReturnType<typeof _approveDirectoryGuardian> => domainMutation('approveDirectoryGuardian', args, () => _approveDirectoryGuardian(...args));
export const requestDirectoryGuardian = (...args: Parameters<typeof _requestDirectoryGuardian>): ReturnType<typeof _requestDirectoryGuardian> => domainMutation('requestDirectoryGuardian', args, () => _requestDirectoryGuardian(...args));
export const saveDirectoryAssignment = (...args: Parameters<typeof _saveDirectoryAssignment>): ReturnType<typeof _saveDirectoryAssignment> => domainMutation('saveDirectoryAssignment', args, () => _saveDirectoryAssignment(...args));
export const removeDirectoryAssignment = (...args: Parameters<typeof _removeDirectoryAssignment>): ReturnType<typeof _removeDirectoryAssignment> => domainMutation('removeDirectoryAssignment', args, () => _removeDirectoryAssignment(...args));
export const importDirectoryPeople = (...args: Parameters<typeof _importDirectoryPeople>): ReturnType<typeof _importDirectoryPeople> => domainMutation('importDirectoryPeople', args, () => _importDirectoryPeople(...args));
