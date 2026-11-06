import type {CmsState} from '../../lib/cms/types';
import * as model from '../../lib/cms/sponsorship';
import {emptyState} from '../../lib/server/records';
export const committee='sponsor-committee-user',signer='sponsor-user-dg';
// Explicit fictitious fixtures stay in tests; the production seed remains empty.
export function sponsorV72Fixture():CmsState{
 const s=emptyState();s.settings.clubName='Duindorp SV';s.settings.season='2026/2027';
 s.roles=[{id:'committee',name:'Sponsorcommissie',description:'',permissions:['sponsors'],teamScoped:false},{id:'sponsor',name:'Sponsor',description:'',permissions:[],teamScoped:false}];
 s.members=[{id:committee,name:'Sam Voorbeeld',email:'commissie@example.invalid',roleId:'committee',active:true,teamIds:[]},{id:signer,name:'Robin Voorbeeld',email:'sponsor@example.invalid',roleId:'sponsor',active:true,teamIds:[]}];
 const data=model.createSponsorshipSeed();s.sponsorship=data;
 data.sponsors=[{id:'sponsor-dg',name:'Fictieve sponsor',companyNumber:'12345678',vatNumber:'',address:'Teststraat 1',postalCode:'1234 AB',city:'Teststad',email:'sponsor@example.invalid',phone:'',website:'',description:'',logoUrl:'',ownerId:committee,stage:'lead',notes:'',publicProfile:{name:'Fictief publiek',description:'',website:'',logoUrl:''},publicEnabled:false,publicFrom:'',publicUntil:'',createdAt:'2026-11-05T12:00:00.000Z',updatedAt:'2026-11-05T12:00:00.000Z',demo:false}];
 data.memberships=[{id:'test-membership',sponsorId:'sponsor-dg',userId:signer,roles:['signer','billing','marketing']}];
 data.items=[{id:'item-board-1',name:'Reclamebord hoofdveld',description:'Langs het hoofdveld',kind:'board',priceCents:30000,taxRate:'21',capacity:10,period:'season',active:true},{id:'item-website',name:'Website',description:'Sponsorvermelding',kind:'website',priceCents:5000,taxRate:'21',capacity:0,period:'season',active:true}];
 data.packages=[{id:'package-clubvriend',name:'Clubvriend',description:'Fictief pakket',itemIds:['item-board-1','item-website'],priceCents:32500,taxRate:'21',active:true}];
 model.saveSponsorBusinessDetails(s,committee,'sponsor-dg',{...model.getSponsorBusinessDetails(data.sponsors[0]),contactName:'Robin Voorbeeld',contactFunction:'Directeur'},true);
 return s;
}
