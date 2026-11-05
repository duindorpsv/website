import assert from 'node:assert/strict';
import test from 'node:test';
import type {CmsState} from '../lib/cms/types';
const {parseCmsState}=await import(new URL('../lib/cms/validation.ts',import.meta.url).href) as typeof import('../lib/cms/validation');

function state():CmsState{return {schemaVersion:1,matchPreviews:[],planning:{committees:[],locations:[],activities:[],lastSportlinkSync:null},articles:[],pages:[],people:[],media:[],folders:[],albums:[],departments:[],forms:[],submissions:[],roles:[{id:'admin',name:'Beheerder',description:'',permissions:['news','pages','media','people','forms','settings','users','publish'],teamScoped:false}],members:[{id:'administrator',name:'Beheerder',email:'',roleId:'admin',teamIds:[],active:true}],documents:[],settings:{clubName:'Duindorp SV',siteDescription:'',contactEmail:'secretariaat@duindorpsv.nl',season:'2026/2027',newsCategories:['Clubnieuws'],teams:[],homepageArticleIds:[],homepageStoryIds:[],homepageAlbumIds:[],homepagePhotoIds:[],homepageHeading:'Dit zijn wij',newsletterEnabled:true,newsletterLabel:'Blijf op de hoogte',socials:[]},redirects:[],audit:[]};}

test('a complete backup round-trips without losing the structured state',()=>{const value=state();assert.deepEqual(parseCmsState(JSON.stringify(value)),value);});
test('missing nested settings and malformed permissions are rejected before storage',()=>{const seed=state();const cases=[{...seed,settings:{...seed.settings,socials:undefined}},{...seed,roles:[{...seed.roles[0],permissions:'users'}]},{...seed,members:[{...seed.members[0],teamIds:null}]}];for(const value of cases)assert.throws(()=>parseCmsState(JSON.stringify(value)),/ongeldig/);});
test('invalid dates and duplicate identifiers cannot poison list rendering',()=>{const value=state();value.audit.push({id:'audit',at:'geen-datum',role:'Beheerder',action:'Test'});assert.throws(()=>parseCmsState(JSON.stringify(value)),/audit.0.at/);value.audit=[];value.members.push({...value.members[0]});assert.throws(()=>parseCmsState(JSON.stringify(value)),/members/);});
test('malformed widget data is rejected even in a revision or live snapshot',()=>{const value=state();const page={id:'page',title:'Een pagina',slug:'club/test',intro:'',body:{type:'doc',content:[{type:'cmsWidget',attrs:{kind:'people',data:{ids:'not-an-array'}}}]},parentId:'',menuGroup:'club',menuVisible:true,order:0,seo:{title:'',description:'',noIndex:false},useBuilder:true,status:'draft',updatedAt:'2026-10-13T10:00:00.000Z',revisions:[]};const serialized=JSON.stringify({...value,pages:[page]});assert.throws(()=>parseCmsState(serialized),/pages.0.body/);});
test('administration stays recoverable, including a custom full administrator role',()=>{const value=state();value.roles.push({...value.roles[0],id:'custom-admin'});value.members[0].roleId='custom-admin';assert.equal(parseCmsState(JSON.stringify(value)).members[0].roleId,'custom-admin');value.members[0].active=false;assert.throws(()=>parseCmsState(JSON.stringify(value)),/actief beheerdersprofiel/);});
test('profiles cannot refer to absent roles',()=>{const value=state();value.members.push({id:'editor',name:'Redacteur',email:'',roleId:'missing',teamIds:[],active:true});assert.throws(()=>parseCmsState(JSON.stringify(value)),/ontbrekende rol/);});

test('legacy backups keep all articles, public snapshots and revisions as news without guessing from category or title',()=>{
 const value=state();
 const legacyContent={title:'Column: een zaterdag bij de club',slug:'zaterdag',intro:'Een verhaal',body:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Bewaarde inhoud.'}]}]},coverId:'',author:'Redactie',category:'Verhalen',tags:['column'],teamId:'',season:'2026/2027',seo:{title:'',description:'',noIndex:false},featured:true,publishedAt:'2026-10-13T10:00:00.000Z'};
 const legacy={...value,settings:{...value.settings,homepageStoryIds:undefined,homepageArticleIds:['old']},articles:[{...legacyContent,id:'old',status:'draft',updatedAt:'2026-10-13T11:00:00.000Z',scheduledAt:'',live:{...legacyContent,title:'Gepubliceerde titel'},revisions:[{id:'revision',at:'2026-10-13T09:00:00.000Z',label:'Eerder',data:{...legacyContent,title:'Oude titel'}}]}]};
 const migrated=parseCmsState(JSON.stringify(legacy)),a=migrated.articles[0];
 assert.equal(a.contentType,'news');assert.equal(a.storyFormat,'story');assert.equal(a.live?.contentType,'news');assert.equal(a.revisions[0].data.contentType,'news');
 assert.equal(a.live?.title,'Gepubliceerde titel');assert.equal(a.revisions[0].data.title,'Oude titel');assert.deepEqual(a.body,legacyContent.body);
 assert.deepEqual(migrated.settings.homepageArticleIds,['old']);assert.deepEqual(migrated.settings.homepageStoryIds,[]);
});

test('legacy submissions migrate to contact snapshots, while new registration snapshots survive later form changes',()=>{
 const value=state();const at='2026-10-13T10:00:00.000Z';
 const legacyForm={id:'contact',name:'Contact',departmentId:'secretariat',active:true,retentionDays:90,fields:[{id:'message',label:'Vraag',type:'textarea',required:true}]};
 const legacySubmission={id:'old',formId:'contact',departmentId:'secretariat',name:'Oud bericht',email:'club@example.com',message:'Bewaarde vraag',createdAt:at,status:'new',note:'Interne notitie',demo:true};
 const registration={...legacySubmission,id:'registration',kind:'registration',formName:'Aanmelden proeftraining',answers:[{fieldId:'team',label:'Gewenst team',type:'text',value:'JO11'}],status:'accepted'};
 const migrated=parseCmsState(JSON.stringify({...value,forms:[legacyForm],submissions:[legacySubmission,registration]}));
 assert.equal(migrated.forms[0].kind,'contact');assert.equal(migrated.submissions[0].kind,'contact');assert.equal(migrated.submissions[0].formName,'Contact');
 assert.equal(migrated.submissions[0].answers.find(a=>a.fieldId==='message')?.value,'Bewaarde vraag');assert.equal(migrated.submissions[0].note,'Interne notitie');
 assert.deepEqual(migrated.submissions[1],registration);
 migrated.forms[0].name='Andere formuliernaam';migrated.forms[0].kind='request';
 const roundTrip=parseCmsState(JSON.stringify(migrated));assert.equal(roundTrip.submissions[0].kind,'contact');assert.equal(roundTrip.submissions[0].formName,'Contact');assert.deepEqual(roundTrip.submissions[1],registration);
});
