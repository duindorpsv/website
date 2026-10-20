import assert from 'node:assert/strict';
import test from 'node:test';
import type {CmsMatchPreview,MatchPreviewContent} from '../../lib/cms/types';
import type {SportlinkMatch,SportlinkTeam} from '../../lib/sportlink-types';
const {emptyMatchPreviewContent,getPublishedMatchPreview,isFirstTeamMatch,previewLocalDate,previewUtcDate,settleMatchPreviewPublication,validateMatchPreview}=await import(new URL('../../lib/cms/match-preview.ts',import.meta.url).href) as typeof import('../../lib/cms/match-preview');
const {parseCmsState}=await import(new URL('../../lib/cms/validation.ts',import.meta.url).href) as typeof import('../../lib/cms/validation');
const {createDefaultHeroSlider}=await import(new URL('../../lib/cms/hero-slider.ts',import.meta.url).href) as typeof import('../../lib/cms/hero-slider');

const first:SportlinkTeam={id:'218380:-1',teamCode:'218380',localTeamCode:'-1',name:'Duindorp sv 1',category:'Senioren',gender:'man',sport:'veld',day:'zaterdag',competitions:[]};
const match:SportlinkMatch={id:'12345',kickoff:'2026-10-24T12:30:00Z',home:{id:'218380',name:'Duindorp SV 1',clubCode:'BBGV51U',own:true,logoUrl:null},away:{id:'129',name:'Die Haghe 1',clubCode:'OTHER',own:false,logoUrl:null},homeScore:null,awayScore:null,scoreLabel:null,status:'Te spelen',venue:'Sportpark Duindorp',competitionId:'826233',competitionLabel:'4e klasse C'};
const content:MatchPreviewContent={...emptyMatchPreviewContent(),enabled:true,speaker:'Trainer',role:'Trainer eerste elftal',whatAtStake:'Een belangrijke wedstrijd.'};
const entry=(patch:Partial<CmsMatchPreview>={}):CmsMatchPreview=>({...content,id:'preview-12345',matchId:match.id,teamId:first.id,status:'published',publishAt:'',updatedAt:'2026-10-20T18:00:00Z',live:{...content},...patch});
const now=new Date('2026-10-20T18:00:00Z');

test('only confirmed first-team fixtures are eligible, including away and legacy identifier fallback',()=>{
 assert.equal(isFirstTeamMatch(match,first),true);
 assert.equal(isFirstTeamMatch({...match,home:match.away,away:match.home},first),true);
 assert.equal(isFirstTeamMatch({...match,home:{...match.home,id:first.id}},first),true);
 assert.equal(isFirstTeamMatch({...match,home:{...match.home,id:'BBGV51U:duindorp sv 1'}},first),true);
 assert.equal(isFirstTeamMatch(match,null),false);
 assert.equal(isFirstTeamMatch({...match,home:{...match.home,id:'999',name:'Duindorp SV 1'}},first),false);
 assert.equal(isFirstTeamMatch({...match,home:{...match.home,id:'999',name:'Duindorp SV 2'}},first),false);
 assert.equal(isFirstTeamMatch({...match,home:{...match.home,id:'999',name:'Duindorp SV JO11-1'}},first),false);
 assert.equal(isFirstTeamMatch({...match,home:{...match.home,own:false}},first),false);
});

test('draft edits never replace the independent publication snapshot',()=>{
 const changed=entry({speaker:'Nieuw concept',whatAtStake:'Nog niet gepubliceerd.',status:'draft'});
 assert.equal(getPublishedMatchPreview([changed],match,first,now)?.whatAtStake,content.whatAtStake);
 assert.equal(getPublishedMatchPreview([changed],match,first,now)?.speaker,content.speaker);
 assert.equal(getPublishedMatchPreview([entry({live:undefined,status:'draft'})],match,first,now),null);
});

test('publication stays scoped to this match and first-team record',()=>{
 assert.equal(getPublishedMatchPreview([entry()],match,first,now)?.speaker,'Trainer');
 assert.equal(getPublishedMatchPreview([entry({matchId:'other'})],match,first,now),null);
 assert.equal(getPublishedMatchPreview([entry({teamId:'999:-1'})],match,first,now),null);
 assert.equal(getPublishedMatchPreview([entry()],{...match,id:'other'},first,now),null);
 assert.equal(getPublishedMatchPreview(undefined,match,first,now),null);
 assert.equal(getPublishedMatchPreview([entry()],match,null,now),null);
});

test('scheduled snapshots appear at their own publication time and future edits do not leak',()=>{
 const scheduled={...content,whatAtStake:'De nieuwe vooruitblik.'};
 const value=entry({status:'scheduled',scheduled,publishAt:'2026-10-21T08:00:00Z',whatAtStake:'Ongepubliceerde wijziging'});
 assert.equal(getPublishedMatchPreview([value],match,first,now)?.whatAtStake,content.whatAtStake);
 assert.equal(getPublishedMatchPreview([value],match,first,new Date('2026-10-21T08:00:00Z'))?.whatAtStake,scheduled.whatAtStake);
 assert.equal(getPublishedMatchPreview([entry({...value,live:undefined})],match,first,now),null);
 assert.equal(getPublishedMatchPreview([entry({...value,live:undefined,publishAt:'invalid'})],match,first,new Date('2030-01-01')),null);
});

test('disabled, empty or unattributed publication snapshots hide the optional tab',()=>{
 for(const live of [{...content,enabled:false},{...content,whatAtStake:''},{...content,speaker:' '},{...content,role:''}])assert.equal(getPublishedMatchPreview([entry({live})],match,first,now),null);
 assert.equal(validateMatchPreview({...content,whatAtStake:'',intro:'Een korte inleiding.'}).length,0);
});

test('editing after a schedule elapsed keeps the newly published snapshot instead of reviving older live content',()=>{
 const value=entry({status:'scheduled',scheduled:{...content,whatAtStake:'Net gepubliceerd.'},publishAt:'2026-10-20T17:00:00Z'});
 settleMatchPreviewPublication(value,now);
 assert.equal(value.live?.whatAtStake,'Net gepubliceerd.');assert.equal(value.status,'published');assert.equal(value.scheduled,undefined);
 value.status='draft';value.whatAtStake='Nieuw concept.';
 assert.equal(getPublishedMatchPreview([value],match,first,now)?.whatAtStake,'Net gepubliceerd.');
});

test('Amsterdam scheduling converts summer and winter time independently from device timezone',()=>{
 assert.equal(previewUtcDate('2026-10-24T14:30'),'2026-10-24T12:30:00.000Z');
 assert.equal(previewUtcDate('2026-11-01T14:30'),'2026-11-01T13:30:00.000Z');
 assert.equal(previewLocalDate('2026-11-01T13:30:00Z'),'2026-11-01T14:30');
 assert.equal(previewUtcDate('2027-03-28T02:30'),'');
 assert.equal(previewUtcDate('invalid'),'');assert.equal(previewLocalDate('invalid'),'');
});

test('legacy CMS backups accept the new independent collection without moving it into settings',async()=>{
 const {createCmsSeed}=await import('../../lib/cms/seed');
 const seed=createCmsSeed();const old=JSON.parse(JSON.stringify(seed));delete old.matchPreviews;
 const migrated=parseCmsState(JSON.stringify(old));assert.deepEqual(migrated.matchPreviews,[]);assert.deepEqual(migrated.settings,seed.settings);
 const record={...entry(),teamId:'',firstTeamId:first.id,title:'Duindorp SV 1 – Die Haghe 1'};
 const snapshot={...emptyMatchPreviewContent(),...content,id:record.id,matchId:match.id,teamId:'',firstTeamId:first.id,title:record.title};
 const value={...seed,matchPreviews:[{...record,live:snapshot,scheduled:{...content,speaker:'Aanvoerder'},status:'scheduled',publishAt:'2026-10-21T08:00:00Z'}]};
 assert.deepEqual(parseCmsState(JSON.stringify(value)).matchPreviews,value.matchPreviews);
 assert.throws(()=>parseCmsState(JSON.stringify({...value,matchPreviews:[record,{...record,id:'second'}]})),/matchPreviews/);
 assert.throws(()=>parseCmsState(JSON.stringify({...value,matchPreviews:[{...record,live:{...snapshot,speaker:'x'.repeat(121)}}]})),/matchPreviews/);
});
