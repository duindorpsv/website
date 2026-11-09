import {boardCodePrefixes as prefixes,boardToday,makeBase,type BoardBase,type BoardState,type Proposal,type Meeting,type Decision,type Alv,type BoardActor,type BoardPerson} from '../../lib/cms/board';
import type {BoardValidationContext} from '../../lib/cms/board-transitions';
export const boardExamples = {
  chair:'demo-board-chair',
  secretary:'demo-board-secretary',
  member:'demo-board-member',
  committee:'demo-board-committee',
  activities:'commissie-activiteiten',
};

// Early demo records referenced account IDs. The club directory supplies the person IDs
// used for actual assignments, attendance and role switching.
export function linkBoardExamples(board:BoardState,members:{id:string;personId?:string}[]) {
  const accounts = [boardExamples.chair,boardExamples.secretary,boardExamples.member,boardExamples.committee];
  const ids = new Map(members.filter(member=>accounts.includes(member.id)&&member.personId).map(member=>[member.id,member.personId!]));
  const personId = (id:string)=>ids.get(id)??id;
  for(const records of [board.proposals,board.actions,board.portfolios,board.dossiers,board.alvItems]) {
    for(const row of records) row.ownerId = personId(row.ownerId);
  }
  for(const action of board.actions) action.portfolioOwnerId = personId(action.portfolioOwnerId);
  for(const meeting of board.meetings) {
    meeting.attendeeIds = [...new Set(meeting.attendeeIds.map(personId))];
    for(const point of meeting.points) {
      point.ownerId = personId(point.ownerId);
      for(const [legacy,current] of ids) {
        if(legacy===current) continue;
        if(Object.hasOwn(point.privateNotes,legacy)) {
          point.privateNotes[current] ??= point.privateNotes[legacy];
          delete point.privateNotes[legacy];
        }
        if(Object.hasOwn(point.votes,legacy)) {
          point.votes[current] ??= point.votes[legacy];
          delete point.votes[legacy];
        }
      }
    }
  }
  for(const alv of board.alvs) for(const vote of alv.votes) {
    vote.countedBy = personId(vote.countedBy);
    if(vote.confirmedBy) vote.confirmedBy = personId(vote.confirmedBy);
  }
  return board;
}

const demoDate = '2026-11-09T09:00:00.000Z';

export function createBoardSeed():BoardState {
  const {chair,secretary,member,committee,activities} = boardExamples;
  const board:BoardState = {
    counters:{}, meetings:[], proposals:[], decisions:[], actions:[], alvs:[],
    alvItems:[], communications:[], handoffs:[], portfolios:[], dossiers:[],
  };
  function example(kind:keyof typeof prefixes,id:string):BoardBase {
    const key = prefixes[kind]+'-2026';
    const sequence = (board.counters[key] ?? 0) + 1;
    board.counters[key] = sequence;
    return {id:'board-demo-'+id,code:key+'-'+String(sequence).padStart(4,'0'),createdAt:demoDate};
  }
  const dossier = {
    ...example('dossier','clubdagen'),title:'Vrijwilligers op clubdagen',ownerId:member,committeeId:activities,
    description:'Voorbeelddossier over de bezetting rond clubdagen, met opvolging vanuit bestuur en commissie.',
  };
  board.dossiers.push(dossier);
  board.portfolios.push({
    ...example('portfolio','activiteiten'),title:'Clubactiviteiten',ownerId:member,committeeId:activities,
    description:'Planning, vrijwilligers en ondersteuning rond clubactiviteiten.',status:'info',
    update:'De commissie werkt aan één overzicht voor ontvangst en barbezetting op clubdagen.',
  },{
    ...example('portfolio','portfolio-clubhuis'),title:'Clubhuis',ownerId:chair,committeeId:'',
    description:'Beheer en gebruik van het clubhuis.',status:'issue',
    update:'De commissie wil één aanspreekpunt voor sleuteloverdracht.',
  });
  const proposal:Proposal = {
    ...example('proposal','bezetting'),title:'Eén vrijwilligersrooster voor clubdagen',kind:'decision',
    summary:'De commissie stelt voor om ontvangst en bar op één rooster te zetten.',
    request:'Het bestuur stemt in met een proef waarbij de commissie voor twee clubdagen één vrijwilligersrooster bijhoudt.',
    ownerId:committee,committeeId:activities,dossierId:dossier.id,status:'ready',versions:[],
  };
  proposal.versions.push({number:1,at:demoDate,summary:proposal.summary,request:proposal.request});
  board.proposals.push(proposal);
  board.proposals.push({
    ...example('proposal','clubupdate'),title:'Stand van zaken vrijwilligerspool',kind:'info',
    summary:'De eerste aanmeldingen zijn binnen. De commissie inventariseert beschikbaarheid.',
    request:'',ownerId:member,committeeId:activities,dossierId:dossier.id,status:'ready',
    versions:[{number:1,at:demoDate,summary:'De eerste aanmeldingen zijn binnen. De commissie inventariseert beschikbaarheid.',request:''}],
  });
  const meeting:Meeting = {
    ...example('meeting','volgend'),title:'Bestuursvergadering november',date:'2026-11-16',time:'20:00',
    location:'Bestuurskamer',status:'draft',attendeeIds:[chair,secretary,member],
    agendaVersion:1,minutesStatus:'draft',minutesVersion:1,minutesSummary:'',
    points:[{
      ...example('point','opening'),title:'Opening en vaststelling agenda',kind:'info',
      description:'Aanwezigheid en agenda vastleggen.',ownerId:secretary,notes:'',privateNotes:{},votes:{},
    }],
  };
  board.meetings.push(meeting);
  const oldDecision:Decision = {
    ...example('decision','clubhuis-v1'),title:'Sleuteloverdracht clubhuis',source:'bestuur',
    text:'De sleutel wordt voor iedere activiteit bij de dienstdoende vrijwilliger opgehaald.',
    effectiveFrom:'2026-08-01',effectiveUntil:'',outcome:'adopted',
  };
  const currentDecision:Decision = {
    ...example('decision','clubhuis-v2'),title:'Sleuteloverdracht clubhuis',source:'bestuur',
    text:'De activiteitencommissie wijst per activiteit één contactpersoon aan voor het ophalen en terugbrengen van de sleutel.',
    effectiveFrom:'2026-11-01',effectiveUntil:'',replacesId:oldDecision.id,outcome:'adopted',
  };
  const clubDay:Decision = {
    ...example('decision','clubdag'),title:'Clubdag met vrijwilligersontvangst',source:'bestuur',
    text:'De activiteitencommissie organiseert een ontvangst voor vrijwilligers. Het bestuur ontvangt de planning zodra de bezetting rond is.',
    effectiveFrom:'2026-11-01',effectiveUntil:'',dossierId:dossier.id,outcome:'adopted',
  };
  board.decisions.push(clubDay,currentDecision,oldDecision);
  board.actions.push({
    ...example('action','ontvangst'),title:'Maak een eerste rooster voor de ontvangst',
    description:'Stem de diensten af en zet de open plekken in het overzicht.',ownerId:committee,committeeId:activities,
    portfolioOwnerId:member,dueDate:'2026-11-18',status:'pending',progress:'',decisionId:clubDay.id,
  },{
    ...example('action','clubhuis'),title:'Geef de sleutelafspraak door aan de commissie',
    description:'Controleer of er per activiteit een contactpersoon is aangewezen.',ownerId:member,committeeId:activities,
    portfolioOwnerId:chair,dueDate:'2026-11-20',status:'blocked',progress:'Afstemming met de commissie gestart.',
    helpRequest:'Wie beheert de reservesleutel op zaterdag?',decisionId:currentDecision.id,
  });
  const alv:Alv = {
    ...example('alv','najaar'),title:'Algemene ledenvergadering najaar',date:'2026-11-19',time:'20:00',
    location:'Clubhuis',status:'draft',agendaIds:[],agendaSnapshot:[],minutes:'',votes:[],promises:[],
  };
  board.alvs.push(alv);
  board.alvItems.push({
    ...example('alvItem','vrijwilligers'),title:'Terugkoppeling vrijwilligersaanpak',description:'Voorbeeldpunt voor de ledenvergadering.',
    ownerId:member,kind:'info',status:'ready',alvId:alv.id,stance:'Het bestuur geeft een korte terugkoppeling.',
    document:'Samenvatting van de aanpak en vervolgstappen voor vrijwilligers.',documentReleased:true,
    question:'',checklist:{stance:true,document:true,question:false},notes:'',
  },{
    ...example('alvItem','ledeninbreng'),title:'Vaste manier voor ledeninbreng',description:'Voorbeeld van een punt waar een formeel voorstel bij hoort.',
    ownerId:secretary,kind:'decision',status:'work',alvId:alv.id,stance:'Positief over een proefperiode.',
    document:'',question:'Stemt de ALV in met een proef waarbij leden vooraf agendapunten kunnen indienen?',
    checklist:{stance:true,document:false,question:true},notes:'',
  });
  return board;
}

export function createBoardTestFixture(){
 const board=createBoardSeed();
 const actors=Object.fromEntries((['chair','secretary','member','committee'] as const).map(role=>[role,{id:boardExamples[role],userId:'board-test-user-'+role,name:{chair:'Mara',secretary:'Iris',member:'Joris',committee:'Liv'}[role],role,committeeIds:role==='committee'||role==='member'?[boardExamples.activities]:[]}] as const)) as Record<'chair'|'secretary'|'member'|'committee',BoardActor>;
 const people:BoardPerson[]=Object.values(actors);const committees=[{id:boardExamples.activities,name:'Activiteiten & ontmoeting'}];
 const context:BoardValidationContext={people,committees,now:'2026-11-09T09:00:00.000Z',planning:[]};
 return {board,actors,people,committees,context};
}
