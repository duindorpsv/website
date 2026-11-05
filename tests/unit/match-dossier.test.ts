import assert from 'node:assert/strict';
import test from 'node:test';
import type {SportlinkMatch,SportlinkSide,SportlinkStanding} from '../../lib/sportlink-types';
const {buildMatchDossier,dossierHistoryAvailable,matchSeason,sameDossierTeam,supportsPublicMatchResults}=await import(new URL('../../lib/match-dossier.ts',import.meta.url).href) as typeof import('../../lib/match-dossier');

const club:SportlinkSide={id:'218380',name:'Duindorp sv 1',clubCode:'BBGV51U',logoUrl:null,own:true};
const opponent:SportlinkSide={id:'128614',name:'Die Haghe 1',clubCode:'BBGV42S',logoUrl:null,own:false};
const third:SportlinkSide={id:'100000',name:'Quick 1',clubCode:'OTHER',logoUrl:null,own:false};
const now=new Date('2026-10-20T12:00:00Z');
const game=(id:string,kickoff='2026-10-17T12:30:00Z',home=club,away=opponent,score:[number|null,number|null]=[2,1],status='Uitgespeeld'):SportlinkMatch=>({id,kickoff,home,away,homeScore:score[0],awayScore:score[1],scoreLabel:null,status,venue:'Sportpark Duindorp',competitionId:'826233',competitionLabel:'4e klasse C'});
const target=game('target','2026-10-24T12:30:00Z',club,opponent,[null,null],'Te spelen');

test('team identity keeps numeric IDs, club identities and exact full team names separate',()=>{
 assert.ok(sameDossierTeam(club,{...club,name:' DUINDORP S.V. 1 '}));
 assert.ok(!sameDossierTeam(club,{...club,id:'999999'}));
 assert.ok(!sameDossierTeam(club,{...club,clubCode:'ANOTHER'}));
 assert.ok(!sameDossierTeam(club,{...club,name:'Duindorp sv 2'}));
 assert.ok(!sameDossierTeam(club,{...club,name:'Duindorp sv JO11-1'}));
 assert.ok(!sameDossierTeam(club,{...club,name:'Duindorp sv VR1'}));
});

test('fallback identity accepts an absent source team ID only within the same known club',()=>{
 assert.ok(sameDossierTeam(club,{...club,id:'BBGV51U:duindorp sv 1'}));
 assert.ok(!sameDossierTeam({...club,id:'',clubCode:''},{...club,id:'',clubCode:''}));
 assert.ok(!sameDossierTeam(club,{...club,id:'',clubCode:'OTHER'}));
});

test('only completed scored matches form the comparison; pending zeros and walkovers do not',()=>{
 const rows=[game('draw',undefined,club,opponent,[0,0]),game('scheduled',undefined,club,opponent,[0,0],'Te spelen'),game('cancelled',undefined,club,opponent,[3,0],'Afgelast'),game('walkover',undefined,club,opponent,[3,0],'Reglementair'),game('unknown',undefined,club,opponent,[1,0],''),game('missing',undefined,club,opponent,[null,null]),game('abandoned',undefined,club,opponent,[3,2],'Gestaakt')];
 const result=buildMatchDossier(target,rows,[],now);
 assert.deepEqual(result.home.form,['GL']);
 assert.deepEqual(result.home.matches.map(match=>match.id),['draw']);
});

test('latest payload replaces old data before filtering, including cancellation and corrected scores',()=>{
 const old=game('same',undefined,club,opponent,[5,0]);
 const cancelled={...old,status:'Afgelast',homeScore:null,awayScore:null};
 assert.equal(buildMatchDossier(target,[old,cancelled],[],now).home.played,0);
 const corrected={...old,homeScore:0,awayScore:2};
 const result=buildMatchDossier(target,[old,corrected],[],now);
 assert.deepEqual(result.home.form,['V']);assert.equal(result.home.goalsFor,0);assert.equal(result.home.goalsAgainst,2);
});

test('form uses the latest known games while H2H stays before the selected match and future games stay excluded',()=>{
 const prior=game('before','2026-10-01T12:30:00Z');
 const after=game('after','2026-10-15T12:30:00Z');
 const future=game('future','2026-10-22T12:30:00Z');
 assert.deepEqual(buildMatchDossier(target,[prior,after,future,{...target,homeScore:5,awayScore:0,status:'Uitgespeeld'}],[],now).home.matches.map(match=>match.id),['after','before']);
 const historical={...target,kickoff:'2026-10-10T12:30:00Z'};
 const selectedPlayed={...historical,homeScore:1,awayScore:1,status:'Uitgespeeld'};
 const result=buildMatchDossier(historical,[prior,selectedPlayed,after,future],[],now);
 assert.deepEqual(result.home.matches.map(match=>match.id),['after','target','before']);
 assert.deepEqual(result.encounters.map(match=>match.id),['before']);
});

test('public result support suppresses O10 and younger without misclassifying older youth or senior teams',()=>{
 for(const name of ['HMSH O9-3','Duindorp sv O10-1','Club JO9-1','Club MO10-1','Club U8-2','Club Onder 10-1','Club O09-1'])assert.equal(supportsPublicMatchResults({name}),false,name);
 for(const name of ['Duindorp sv O11-1','Quintus O12-1','Club JO19-1','Duindorp sv 35+1','Duindorp sv 1','Club VR1','Team onbekend'])assert.equal(supportsPublicMatchResults({name}),true,name);
});

test('younger source placeholders never create form, recent matches or H2H; unavailable data hides the history',()=>{
 const youngHome={...club,name:'Duindorp sv O9-2'},youngAway={...opponent,name:'HMSH O9-3'};
 const youngerTarget=game('young-target','2026-10-24T12:30:00Z',youngHome,youngAway,[null,null],'Te spelen');
 const sourceZero=game('zero',undefined,youngHome,youngAway,[0,0]);
 const result=buildMatchDossier(youngerTarget,[sourceZero],[],now);
 assert.deepEqual(result.home.matches,[]);assert.deepEqual(result.away.form,[]);assert.deepEqual(result.encounters,[]);
 assert.equal(dossierHistoryAvailable(result),false);
 assert.equal(dossierHistoryAvailable(buildMatchDossier(target,[],[],now)),false);
});

test('only the side with known published results is available when the other side has none',()=>{
 const result=buildMatchDossier(target,[game('known',undefined,club,third)],[],now);
 assert.equal(result.home.matches.length,1);assert.equal(result.away.matches.length,0);
 assert.equal(dossierHistoryAvailable(result),true);
 const olderHome={...club,name:'Duindorp sv O12-2'},olderAway={...opponent,name:'Quintus O12-1'};
 assert.deepEqual(buildMatchDossier(game('older-target','2026-10-24T12:30:00Z',olderHome,olderAway),[game('older',undefined,olderHome,olderAway,[0,0])],[],now).home.form,['GL']);
});

test('comparison is limited to the selected competition and season',()=>{
 const league=game('league');
 const cup={...game('cup'),competitionId:'999999',competitionLabel:'Beker'};
 const old=game('last-season','2026-06-01T12:30:00Z');
 assert.deepEqual(buildMatchDossier(target,[league,cup,old],[],now).home.matches.map(match=>match.id),['league']);
 assert.equal(matchSeason('2026-06-30T21:59:59Z'),'2025/2026');
 assert.equal(matchSeason('2026-06-30T22:00:00Z'),'2026/2027');
});

test('last five are newest first with perspective-correct form and goal totals',()=>{
 const rows=[
  game('one','2026-09-01T12:30:00Z',club,third,[9,0]),
  game('two','2026-09-08T12:30:00Z',third,club,[0,2]),
  game('three','2026-09-15T12:30:00Z',club,third,[1,1]),
  game('four','2026-09-22T12:30:00Z',third,club,[3,1]),
  game('five','2026-10-01T12:30:00Z',club,third,[4,0]),
  game('six','2026-10-15T12:30:00Z',third,club,[0,0]),
 ];
 const result=buildMatchDossier(target,rows,[],now).home;
 assert.deepEqual(result.matches.map(match=>match.id),['six','five','four','three','two']);
 assert.deepEqual(result.form,['GL','W','V','GL','W']);
 assert.deepEqual([result.played,result.won,result.drawn,result.lost,result.goalsFor,result.goalsAgainst],[5,2,2,1,8,4]);
});

test('head-to-head matches include both venue directions but no other reserve or youth teams',()=>{
 const rows=[game('home'),game('away','2026-10-10T12:30:00Z',opponent,club),game('other','2026-10-03T12:30:00Z',club,third),game('reserve','2026-10-04T12:30:00Z',{...club,id:'777777',name:'Duindorp sv 2'},opponent)];
 const result=buildMatchDossier(target,rows,[],now);
 assert.deepEqual(result.encounters.map(match=>match.id),['home','away']);
 assert.equal(result.home.played,3);assert.equal(result.away.played,3);
});

test('archived head-to-head spans seasons and pools while form stays in the target season and pool',()=>{
 const current=game('league','2026-10-10T12:30:00Z');
 const cup={...game('cup','2026-09-01T12:30:00Z',opponent,club),competitionId:'827204',competitionLabel:'Beker'};
 const old={...game('old','2025-10-01T12:30:00Z'),competitionId:'765432'};
 const future=game('future','2026-10-22T12:30:00Z');
 const wrongTeam=game('reserves','2025-11-01T12:30:00Z',{...club,name:'Duindorp sv 2',id:'777777'},opponent);
 const result=buildMatchDossier(target,[old,current,cup,future,wrongTeam],[],now);
 assert.deepEqual(result.home.matches.map(match=>match.id),['league']);
 assert.deepEqual(result.away.matches.map(match=>match.id),['league']);
 assert.deepEqual(result.encounters.map(match=>match.id),['league','cup','old']);
});

test('standings match the full team identity instead of picking another own-club side',()=>{
 const row=(team:SportlinkSide,rank:number):SportlinkStanding=>({rank,team,played:5,won:3,drawn:1,lost:1,goalsFor:10,goalsAgainst:5,goalDifference:5,points:10,form:[]});
 const result=buildMatchDossier(target,[],[row({...club,id:'777777',name:'Duindorp sv 2'},1),row(club,4),row(opponent,6)],now);
 assert.equal(result.home.standing?.rank,4);assert.equal(result.away.standing?.rank,6);
});

test('malformed dates and scores never enter statistics',()=>{
 const rows=[game('bad-date','not-a-date'),game('negative',undefined,club,opponent,[-1,0]),game('decimal',undefined,club,opponent,[1.5,0]),game('infinite',undefined,club,opponent,[Infinity,0])];
 assert.equal(buildMatchDossier(target,rows,[],now).home.played,0);
 assert.equal(buildMatchDossier({...target,kickoff:'invalid'},[game('valid')],[],now).home.played,0);
 assert.equal(matchSeason('invalid'),null);
});

test('fallback competition labels do not accidentally include a known different pool',()=>{
 const withoutId={...target,competitionId:''};
 const rows=[{...game('same-label'),competitionId:'',competitionLabel:'4e klasse C'},game('known-pool'),{...game('other-label'),competitionId:'',competitionLabel:'4e klasse D'}];
 assert.deepEqual(buildMatchDossier(withoutId,rows,[],now).home.matches.map(match=>match.id),['same-label']);
});
