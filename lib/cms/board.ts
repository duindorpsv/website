export type BoardTab = 'overview' | 'proposals' | 'meetings' | 'decisions' | 'actions' | 'alv' | 'dossiers';
export type BoardRole = 'chair' | 'secretary' | 'member' | 'committee';
export type BoardPerson = {id:string;name:string;committeeIds:string[];role?:BoardRole;userId?:string;active?:boolean};
export type BoardActor = BoardPerson & {role:BoardRole;userId:string};
export type PointKind = 'info' | 'discussion' | 'decision' | 'risk';
export type BoardBase = {id:string;code:string;createdAt:string;createdBy?:string;createdByUserId?:string};

export type Proposal = BoardBase & {
  title:string;
  kind:PointKind;
  summary:string;
  request:string;
  ownerId:string;
  committeeId:string;
  dossierId?:string;
  status:'draft'|'submitted'|'changes'|'ready'|'scheduled'|'handled';
  versions:{number:number;at:string;summary:string;request:string;hash?:string;personId?:string;userId?:string;snapshot?:{title:string;kind:PointKind;summary:string;request:string;committeeId:string;dossierId?:string;attachment?:string}}[];
  reviewReason?:string;
  attachment?:string;
};

export type MeetingPoint = BoardBase & {
  title:string;
  kind:PointKind;
  description:string;
  ownerId:string;
  proposalId?:string;
  carriedFrom?:string;
  reviewReason?:string;
  notes:string;
  privateNotes:Record<string,string>;
  votes:Record<string,'voor'|'tegen'|'onthouding'|'afwezig'>;
  voteText?:string;
  committeeId?:string;
  portfolioId?:string;
  outcome?:'decided'|'work'|'deferred'|'alv'|'noted';
  result?:string;
  dueDate?:string;
  decisionId?:string;
  actionId?:string;
  alvItemId?:string;
};

export type Meeting = BoardBase & {
  title:string;
  date:string;
  time:string;
  location:string;
  status:'draft'|'review'|'approved'|'live'|'closed';
  points:MeetingPoint[];
  attendeeIds:string[];
  minutesStatus:'draft'|'review'|'approved';
  minutesVersion:number;
  minutesSummary:string;
  feedback?:string;
  agendaVersion:number;
  agendaApprovedAt?:string;
  agendaEstablishedAt?:string;
  closedAt?:string;
  minutesApprovedAt?:string;
  minutesSubmittedAt?:string;
  minutesCode?:string;
  minutesSnapshot?:{attendance:string;sections:{heading:string;text:string}[]};
  agendaHash?:string;agendaSnapshot?:BoardAgendaSnapshot;agendaHistory?:BoardSnapshotVersion<BoardAgendaSnapshot>[];
  minutesHash?:string;minutesHistory?:BoardSnapshotVersion<BoardMinutesSnapshot>[];
};

export type Decision = BoardBase & {
  title:string;
  text:string;
  effectiveFrom:string;
  effectiveUntil:string;
  source:'bestuur'|'alv';
  meetingId?:string;
  pointId?:string;
  proposalId?:string;
  alvItemId?:string;
  dossierId?:string;
  replacesId?:string;
  outcome:'adopted'|'rejected';
  votes?:string;
};

export type Action = BoardBase & {
  title:string;
  description:string;
  ownerId:string;
  committeeId:string;
  portfolioOwnerId:string;
  dueDate:string;
  status:'pending'|'open'|'progress'|'blocked'|'done';
  progress:string;
  helpRequest?:string;
  decisionId?:string;
  meetingId?:string;
  pointId?:string;
  proposalId?:string;
};

export type AlvItem = BoardBase & {
  title:string;
  description:string;
  ownerId:string;
  kind:'info'|'discussion'|'decision';
  status:'work'|'ready'|'scheduled'|'handled';
  alvId?:string;
  meetingId?:string;
  pointId?:string;
  fromItemId?:string;
  stance:string;
  document:string;
  question:string;
  checklist:{stance:boolean;document:boolean;question:boolean};
  documentReleased?:boolean;
  notes:string;
};

export type AlvAgendaPoint = Pick<AlvItem,'id'|'title'|'document'|'question'|'stance'|'documentReleased'> & {kind:PointKind};

export type AlvVote = BoardBase & {
  itemId:string;
  text:string;
  kind:'motion'|'amendment';
  counts:{voor:number;tegen:number;onthouding:number;ongeldig:number};
  countedBy:string;
  countedByUserId?:string;
  confirmedBy?:string;
  confirmedByUserId?:string;
  confirmedAt?:string;
  outcome:'adopted'|'rejected';
  decisionId?:string;
};

export type Alv = BoardBase & {
  title:string;
  date:string;
  time:string;
  location:string;
  status:'draft'|'approved'|'live'|'closed';
  agendaIds:string[];
  agendaSnapshot:AlvAgendaPoint[];
  agendaHash?:string;agendaApprovedAt?:string;agendaApprovedBy?:string;agendaApprovedByUserId?:string;
  previousId?:string;
  minutes:string;
  votes:AlvVote[];
  promises:string[];
  minutesVersion?:number;minutesHash?:string;minutesHistory?:BoardSnapshotVersion<BoardAlvMinutesSnapshot>[];
};

export type Communication = BoardBase & {decisionId:string;title:string;body:string;audience:string;status:'draft'|'ready';campaignId?:string};
export type Handoff = BoardBase & {decisionId:string;activityId:string;date:string};
export type Portfolio = BoardBase & {title:string;ownerId:string;committeeId:string;description:string;status:'info'|'issue'|'decision';update:string};
export type Dossier = BoardBase & {title:string;description:string;ownerId:string;committeeId:string};

export type BoardState = {
  counters:Record<string,number>;
  meetings:Meeting[];
  proposals:Proposal[];
  decisions:Decision[];
  actions:Action[];
  alvs:Alv[];
  alvItems:AlvItem[];
  communications:Communication[];
  handoffs:Handoff[];
  portfolios:Portfolio[];
  dossiers:Dossier[];
};

export type BoardPageProps = {
  board:BoardState;
  actor:BoardActor;
  people:BoardPerson[];
  committees:{id:string;name:string}[];
  change:(recipe:(draft:BoardState)=>void,message?:string)=>Promise<boolean>;
  saveCommunication:(input:BoardCommunicationInput)=>Promise<boolean>;
  focusId?:string;
  onNavigate:(tab:BoardTab,id?:string)=>void;
};

export const pointLabels:Record<PointKind,string> = {
  info:'Ter kennisname', discussion:'Ter bespreking', decision:'Ter besluitvorming', risk:'Risico of escalatie',
};

const prefixes = {
  meeting:'VER', point:'AGP', proposal:'VST', decision:'BES', action:'ACT', alv:'ALV',
  alvItem:'ALP', vote:'STM', communication:'COM', handoff:'UIT', portfolio:'POR', dossier:'DOS', minutes:'NOT',
};

export function boardToday(now:Date|string = new Date()) {
  return new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Amsterdam'}).format(typeof now==='string'?new Date(now):now);
}

export function makeBase(draft:BoardState,kind:keyof typeof prefixes):BoardBase {
  const key = prefixes[kind] + '-' + boardToday().slice(0,4);
  const sequence = (draft.counters[key] ?? 0) + 1;
  draft.counters[key] = sequence;
  return {id:crypto.randomUUID(),code:key+'-'+String(sequence).padStart(4,'0'),createdAt:new Date().toISOString()};
}

export function formatBoardDate(value:string) {
  if (!value) return 'Nog te bepalen';
  if(!Number.isFinite(Date.parse(value))) return 'Ongeldige datum';
  return new Intl.DateTimeFormat('nl-NL',{day:'numeric',month:'short',year:'numeric',timeZone:'Europe/Amsterdam'}).format(new Date(value));
}


export type BoardCommunicationInput={communicationId?:string;decisionId:string;title:string;audience:string;body:string;status:'draft'|'ready'};
export type BoardAgendaSnapshot={title:string;date:string;time:string;location:string;version:number;points:{id:string;code:string;title:string;kind:PointKind;description:string;ownerId:string;proposalId?:string;carriedFrom?:string;portfolioId?:string;committeeId?:string}[]};
export type BoardMinutesSnapshot={title:string;date:string;time:string;location:string;code:string;version:number;summary:string;attendance:string;sections:{heading:string;text:string}[]};
export type BoardSnapshotVersion<T>={version:number;at:string;personId:string;userId:string;hash:string;snapshot:T};
export function createEmptyBoard():BoardState{return {counters:{},meetings:[],proposals:[],decisions:[],actions:[],alvs:[],alvItems:[],communications:[],handoffs:[],portfolios:[],dossiers:[]};}
export const boardCodePrefixes=prefixes;

export type BoardAlvMinutesSnapshot={title:string;date:string;time:string;location:string;code:string;version:number;minutes:string;promises:string[];sections:{heading:string;text:string}[]};
