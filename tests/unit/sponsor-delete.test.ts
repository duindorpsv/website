import test from 'node:test';
import assert from 'node:assert/strict';
import {sponsorV72Fixture,committee,signer} from '../helpers/sponsor-v72-fixture';
import * as model from '../../lib/cms/sponsorship';
import {captureDomainCommands,domainCommandVersionKey} from '../../lib/cms/domain-commands';
import {directoryProfileTemplate} from '../../lib/cms/directory';
import {commandArgs} from '../../lib/server/sponsor-command-input';

test('forced relationship deletion clears active dossiers, access and event places while preserving other relationships and people',()=>{
 const state=sponsorV72Fixture(),data=state.sponsorship!,sponsor=data.sponsors[0];
 data.sponsors.push({...structuredClone(sponsor),id:'other-company'});
 const draft=model.createSponsorProposal(state,committee,sponsor.id,'package-clubvriend');
 const agreement=model.createSponsorAgreementFromDraft(state,committee,draft.id);
 data.tasks.push({id:'deleted-task',sponsorId:sponsor.id,agreementId:agreement.id,title:'Materiaal',kind:'board',status:'open',ownerId:committee,dueDate:'2027-01-01',note:'',proofUrl:'',visibleToSponsor:true,createdAt:new Date().toISOString(),completedAt:''});
 data.tasks.push({...data.tasks[0],id:'kept-task',sponsorId:'other-company'});
 data.events.push({id:'event',title:'Clubavond',description:'',date:'2027-01-01',location:'Club',capacity:2,registrations:[{userId:signer,sponsorId:sponsor.id,guests:1,at:''},{userId:signer,sponsorId:'other-company',guests:1,at:''}]});
 state.directory={version:1,profiles:[{...directoryProfileTemplate('person'),sponsorIds:[sponsor.id,'other-company']}],assignments:[],guardians:[],invitations:[],events:[]};
 const members=structuredClone(state.members),sealed=JSON.stringify(agreement);
 const operation=crypto.randomUUID(),captured=captureDomainCommands(operation,()=>model.deleteSponsor(state,committee,sponsor.id));
 assert.equal(captured.value.id,sponsor.id);
 assert.deepEqual(captured.commands,[{name:'deleteSponsor',args:[sponsor.id],offset:0}]);
 assert.equal(domainCommandVersionKey('deleteSponsor',[sponsor.id]),'company:'+sponsor.id);
 for(const kind of ['sponsors','memberships','proposals','agreements','tasks','activities'] as const)assert.ok(data[kind].every(row=>('sponsorId' in row?row.sponsorId:row.id)!==sponsor.id),kind);
 assert.deepEqual(data.tasks.map(row=>row.id),['kept-task']);
 assert.deepEqual(data.events[0].registrations.map(row=>row.sponsorId),['other-company']);
 assert.deepEqual(state.directory.profiles[0].sponsorIds,['other-company']);
 assert.deepEqual(state.members,members);
 assert.equal(JSON.stringify(agreement),sealed,'Sealed document contents are left intact for persistence archives');
 assert.equal(model.canAccessSponsor(state,signer,sponsor.id),false);
 assert.equal(model.sponsorItemAvailability(state,'item-board-1',draft.startDate,draft.endDate).reserved,0);
 assert.throws(()=>model.createSponsorProposal(state,committee,sponsor.id),/Sponsor niet gevonden/);
});

test('relationship deletion requires sponsor management and one valid company identifier',()=>{
 const state=sponsorV72Fixture(),before=JSON.stringify(state);
 assert.throws(()=>model.deleteSponsor(state,signer,'sponsor-dg'),/sponsorbeheerrechten/);
 assert.equal(JSON.stringify(state),before);
 assert.deepEqual(commandArgs.deleteSponsor.parse(['sponsor-dg']),['sponsor-dg']);
 for(const args of [[],[''],['sponsor-dg',true],['/company'],[null]])assert.equal(commandArgs.deleteSponsor.safeParse(args).success,false);
});
