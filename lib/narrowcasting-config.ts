export const narrowcastKinds = ['wedstrijd', 'programma', 'uitslagen', 'stand', 'kantine', 'clubnieuws', 'partners', 'welkom'] as const;
export type NarrowcastKind = typeof narrowcastKinds[number];
export type NarrowcastSportsConfig = {scope:'competition'|'teams'|'club';teamIds:string[];venue:'all'|'home'|'away';layout:'auto'|'stacked'|'side-by-side'};
export type NarrowcastSlide = {id:string;kind:NarrowcastKind;title:string;config:NarrowcastSportsConfig};
export type NarrowcastGroup = {id:string;name:string;portrait:boolean;slides:NarrowcastSlide[]};
export const defaultSportsConfig:NarrowcastSportsConfig = {scope:'competition',teamIds:[],venue:'all',layout:'auto'};
export const kindTitles:Record<NarrowcastKind,string> = {wedstrijd:'Volgende wedstrijd · het eerste',programma:'Programma',uitslagen:'Uitslagen',stand:'Standen',kantine:'Prijslijst kantine',clubnieuws:'Clubnieuws',partners:'Partners',welkom:'Welkom'};
export function initialGroups():NarrowcastGroup[]{return [{id:'clubmuur',name:'Clubmuur',portrait:false,slides:narrowcastKinds.map(kind=>({id:kind,kind,title:kindTitles[kind],config:{...defaultSportsConfig,teamIds:[]}}))}];}

/** Both persisted preferences and portable screen links are untrusted input. */
export function parseGroups(value:unknown):NarrowcastGroup[]{
 if(!Array.isArray(value))return [];
 const ids=new Set<string>();
 return value.flatMap(raw=>{
  if(!raw||typeof raw!=='object'||typeof raw.id!=='string'||!raw.id||raw.id.length>150||ids.has(raw.id)||!Array.isArray(raw.slides))return [];
  const seen=new Set<string>();
  const slides:NarrowcastSlide[]=raw.slides.slice(0,100).flatMap((slide:unknown)=>{
   if(!slide||typeof slide!=='object')return [];
   const item=slide as Record<string,unknown>;
   if(typeof item.id!=='string'||!item.id||item.id.length>150||seen.has(item.id)||!narrowcastKinds.includes(item.kind as NarrowcastKind))return [];
   seen.add(item.id);
   const c=(item.config&&typeof item.config==='object'?item.config:{}) as Partial<NarrowcastSportsConfig>;
   return [{id:item.id.slice(0,150),kind:item.kind as NarrowcastKind,title:typeof item.title==='string'?item.title.slice(0,120):kindTitles[item.kind as NarrowcastKind],config:{scope:c.scope==='teams'||c.scope==='club'?c.scope:'competition',teamIds:Array.isArray(c.teamIds)?[...new Set(c.teamIds.filter((id):id is string=>typeof id==='string'&&id.length>0&&id.length<100))].slice(0,100):[],venue:c.venue==='home'||c.venue==='away'?c.venue:'all',layout:c.layout==='stacked'||c.layout==='side-by-side'?c.layout:'auto'}}];
  });
  if(!slides.length)return [];
  ids.add(raw.id);
  return [{id:raw.id.slice(0,150),name:typeof raw.name==='string'?raw.name.slice(0,80):'Schermgroep',portrait:raw.portrait===true,slides}];
 });
}
