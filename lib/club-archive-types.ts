export type ArchiveCategory='Kampioenschappen'|'Accommodatie'|'Teams'|'Clubmensen'|'Clubleven';
export type ArchiveDate={year?:number;month?:number;endYear?:number;approximate?:boolean;season?:string;unknown?:boolean;precision?:'month'|'year'|'season'|'circa'|'unknown'};
export type ArchiveMedia={id:string;kind:'image'|'video'|'audio';src:string;bytes?:number;name:string;caption:string;credit:string;approved?:boolean};
export type ArchiveLinks={personIds?:string[];teamIds?:string[];articleIds?:string[];version?:number;live?:boolean;links?:{id:string;name:string;href:string}[]};
export type ArchiveMoment=ArchiveLinks & {id:string;slug:string;title:string;intro:string;story:string[];date:ArchiveDate;category:ArchiveCategory;cover:string;media:ArchiveMedia[];people:string[];team?:string;objectIds:string[];relatedMomentIds:string[];sourceLabel:string;sourceUrl:string;published:boolean;comparison?:{before:string;after:string;beforeLabel:string;afterLabel:string;caption:string;illustrative?:boolean;beforeFocusX?:number;beforeFocusY?:number;afterFocusX?:number;afterFocusY?:number;source?:string;published?:boolean}};
export type MuseumObject=ArchiveLinks & {id:string;slug:string;title:string;intro:string;story:string[];date:ArchiveDate;collection:string;kind:string;cover:string;media:ArchiveMedia[];provenance:string;maker?:string;owner?:string;collectionIds?:string[];people:string[];momentIds:string[];sourceLabel:string;sourceUrl:string;published:boolean;illustrative?:boolean};
export type ContributionKind='moment'|'addition'|'correction'|'object';
export type ArchiveContribution=ArchiveLinks & {id:string;kind:ContributionKind;targetId?:string;targetType?:'moment'|'object';title:string;description:string;date:ArchiveDate;category:ArchiveCategory;media:ArchiveMedia[];name:string;anonymous:boolean;email:string;source:string;people:string;offer?:'digital'|'photograph'|'loan'|'donation';status:'pending'|'info'|'published'|'rejected';createdAt:string;note:string;publishedId?:string};
export type ContributionContext={kind?:ContributionKind;targetId?:string;targetType?:'moment'|'object';date?:ArchiveDate};
export type ArchiveCollection={id:string;title:string;description:string;cover:string;published:boolean;version?:number};
export type ArchiveState={version:1;collections?:ArchiveCollection[];settingsVersion?:number;moments:ArchiveMoment[];objects:MuseumObject[];contributions:ArchiveContribution[];featuredMomentId:string;featuredObjectId:string;widgetEnabled:boolean};
export const ARCHIVE_CATEGORIES:ArchiveCategory[]=['Kampioenschappen','Accommodatie','Teams','Clubmensen','Clubleven'];
export const ARCHIVE_MONTHS=['Januari','Februari','Maart','April','Mei','Juni','Juli','Augustus','September','Oktober','November','December'];
export function archiveDateLabel(date:ArchiveDate){if(date.unknown||!date.year)return 'Nog te dateren';if(date.season)return `Seizoen ${date.season}`;return `${date.approximate?'Circa ':''}${date.month?`${ARCHIVE_MONTHS[date.month-1]} `:''}${date.year}${date.endYear?`–${date.endYear}`:''}`;}
export function archiveDateOverlaps(date:ArchiveDate,start:number,end=start){return !date.unknown&&typeof date.year==='number'&&date.year<=end&&(date.endYear??date.year)>=start;}
export const momentHref=(slug:string)=>`/clubmuur/club/tijdlijn/${slug}`;
export const objectHref=(slug:string)=>`/clubmuur/club/museum/${slug}`;
export const archiveId=(prefix='archief')=>`${prefix}-${crypto.randomUUID()}`;

export function archiveCompareDate(a:{id:string;date:ArchiveDate},b:{id:string;date:ArchiveDate},newest=false){const unknown=(d:ArchiveDate)=>!d.year||d.unknown?1:0;return unknown(a.date)-unknown(b.date)||((a.date.year??9999)-(b.date.year??9999)||(a.date.month??(a.date.season?13:0))-(b.date.month??(b.date.season?13:0))||a.id.localeCompare(b.id))*(newest?-1:1);}

/** Search includes the current names of linked existing registers as well as historical text. */
export function archiveSearchText(item:ArchiveMoment|MuseumObject){return `${item.title} ${item.intro} ${item.story.join(' ')} ${item.people.join(' ')} ${'team'in item?item.team||'':''} ${'collection'in item?item.collection:''} ${(item.links||[]).map(link=>link.name).join(' ')}`.toLocaleLowerCase('nl');}
