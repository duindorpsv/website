import type {BoardActor,BoardState,BoardTab,Meeting} from './board';

export type BoardLocation = {
  tab:BoardTab;
  id?:string;
  meetingSection?:'agenda'|'summary'|'minutes';
  alvPane?:'prep'|'agenda'|'votes'|'minutes';
};

export type BoardWorkGroup = 'Vergaderen'|'Beoordelen'|'Opvolgen';
export type BoardWorkItem = {
  key:string;
  title:string;
  detail:string;
  step:string;
  group:BoardWorkGroup;
  date?:string;
  tone:'blue'|'warning'|'live';
  priority:number;
  target:BoardLocation;
};

const amount=(value:number,singular:string,plural:string)=>value+' '+(value===1?singular:plural);

export function boardWork(board:BoardState,actor:BoardActor,today:string):BoardWorkItem[] {
  const chair=actor.role==='chair';
  if (!chair&&actor.role!=='secretary') return [];

  const items:BoardWorkItem[]=[];
  const ready=board.proposals.filter(proposal=>proposal.status==='ready').length;
  for (const meeting of board.meetings) {
    const base={key:meeting.id,title:meeting.title,date:meeting.date};
    const meetingTarget=(meetingSection:BoardLocation['meetingSection']):BoardLocation=>({tab:'meetings',id:meeting.id,meetingSection});

    if (meeting.status==='live') {
      const open=meeting.points.filter(point=>!point.outcome).length;
      items.push({...base,step:chair?(open?'Vergadering leiden':'Vergadering afsluiten'):'Notulen bijhouden',
        detail:open?amount(open,'open agendapunt','open agendapunten'):'Alle agendapunten zijn afgehandeld',
        group:'Vergaderen',tone:'live',priority:0,target:meetingTarget(chair&&!open?'summary':'agenda')});
    } else if (chair&&meeting.status==='review') {
      items.push({...base,step:'Agenda beoordelen',detail:amount(meeting.points.length,'agendapunt','agendapunten')+' · ingediend door de secretaris',
        group:'Beoordelen',tone:'blue',priority:1,target:meetingTarget('agenda')});
    } else if (chair&&meeting.status==='approved'&&meeting.date<=today) {
      items.push({...base,step:'Vergadering openen',detail:'Agenda goedgekeurd · klaar voor vaststelling bij opening',
        group:'Vergaderen',tone:'blue',priority:1,target:meetingTarget('agenda')});
    } else if (!chair&&meeting.status==='draft') {
      const requests=meeting.points.filter(point=>point.kind==='info'&&point.reviewReason).length;
      const detail=meeting.feedback?'Aanpassing gevraagd door de voorzitter':requests?
        amount(requests,'bespreekverzoek','bespreekverzoeken')+' te verwerken':ready?
        amount(ready,'vrijgegeven voorstel','vrijgegeven voorstellen')+' in de werkvoorraad':
        meeting.points.length?'Controleer de agenda en dien die in':'Vul de conceptagenda aan';
      items.push({...base,step:'Agenda voorbereiden',detail,group:'Vergaderen',tone:requests||meeting.feedback?'warning':'blue',
        priority:meeting.date<=today?1:4,target:meetingTarget('agenda')});
    }

    if (meeting.status==='closed'&&chair&&meeting.minutesStatus==='review') {
      items.push({...base,step:'Notulen goedkeuren',detail:'Versie '+meeting.minutesVersion+' · ter beoordeling',
        group:'Beoordelen',tone:'blue',priority:2,target:meetingTarget('minutes')});
    } else if (meeting.status==='closed'&&!chair&&meeting.minutesStatus==='draft') {
      items.push({...base,step:'Conceptnotulen afronden',detail:meeting.feedback?'Aanpassing gevraagd door de voorzitter':'Controleer het verslag en dien het in',
        group:'Vergaderen',tone:meeting.feedback?'warning':'blue',priority:2,target:meetingTarget('minutes')});
    }
  }

  if (chair) for (const proposal of board.proposals.filter(row=>row.status==='submitted')) {
    items.push({key:proposal.id,title:proposal.title,step:'Voorstel beoordelen',detail:proposal.code+' · ingediend ter beoordeling',
      group:'Beoordelen',tone:'blue',priority:3,target:{tab:'proposals',id:proposal.id}});
  }

  for (const alv of board.alvs.filter(row=>row.status!=='closed')) {
    const base={key:'alv-'+alv.id,title:alv.title,date:alv.date};
    const awaiting=alv.votes.filter(vote=>!vote.confirmedAt&&vote.countedBy!==actor.id).length;
    if (alv.status==='live'&&awaiting) {
      items.push({...base,step:'ALV-telling controleren',detail:amount(awaiting,'telling','tellingen')+' wacht op een tweede persoon',
        group:'Beoordelen',tone:'warning',priority:1,target:{tab:'alv',id:alv.id,alvPane:'votes'}});
    } else if (alv.status==='draft'&&!chair) {
      const preparation=board.alvItems.filter(point=>point.alvId===alv.id&&point.status==='work').length;
      const intake=board.alvItems.filter(point=>!point.alvId).length;
      const detail=preparation?amount(preparation,'punt','punten')+' in voorbereiding':intake?
        amount(intake,'bestuurspunt','bestuurspunten')+' toe te voegen':alv.agendaIds.length?
        'Conceptagenda ligt klaar':'Verzamel de punten en controleer de stukken';
      items.push({...base,step:'ALV voorbereiden',detail,group:'Vergaderen',tone:'blue',priority:5,target:{tab:'alv',id:alv.id,alvPane:'prep'}});
    } else if (alv.status==='draft'&&chair&&alv.agendaIds.length) {
      items.push({...base,step:'ALV-agenda vaststellen',detail:amount(alv.agendaIds.length,'agendapunt','agendapunten')+' in het concept',
        group:'Beoordelen',tone:'blue',priority:3,target:{tab:'alv',id:alv.id,alvPane:'agenda'}});
    }
  }

  for (const action of board.actions) {
    if (action.status==='done') continue;
    const mine=action.ownerId===actor.id;
    const help=action.status==='blocked'&&!!action.helpRequest;
    const late=!!action.dueDate&&action.dueDate<today;
    if (!mine&&!(help&&(chair||action.portfolioOwnerId===actor.id))&&!(chair&&late)) continue;
    const step=help?'Hulpvraag opvolgen':late?'Actie over termijn':action.status==='pending'?'Opdracht bevestigen':'Eigen actie opvolgen';
    items.push({key:action.id,title:action.title,step,detail:action.code+(help?' · '+action.helpRequest:''),
      group:'Opvolgen',date:action.dueDate,tone:help||late?'warning':'blue',priority:help||late?2:6,target:{tab:'actions',id:action.id}});
  }

  return items.sort((a,b)=>a.priority-b.priority||(a.date||'9999').localeCompare(b.date||'9999')||a.title.localeCompare(b.title,'nl'));
}

export function nextBoardMeeting(meetings:Meeting[],today:string) {
  const planned=meetings.filter(meeting=>meeting.status!=='closed')
    .sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time));
  return planned.find(meeting=>meeting.status==='live')??planned.find(meeting=>meeting.date>=today)??planned.at(-1);
}
