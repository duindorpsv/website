export const headerDesigns = [
 {id:'signatuur',number:'01',name:'Signatuur',slogan:'MEER DAN EEN CLUB',description:'Wit, open navigatie en één rustige horizontale lijn.'},
 {id:'clubblauw',number:'02',name:'Clubblauw',slogan:'ONZE CLUB. ONZE TROTS.',description:'Diep clubblauw, witte typografie en een helder clubembleem.'},
 {id:'tribune',number:'03',name:'Tribune',slogan:'ONZE WIJK. ONZE CLUB. ONZE TROTS.',description:'Grote, compacte navigatie met de energie van een tribune.'},
 {id:'vaandel',number:'04',name:'Vaandel',slogan:'MEER DAN EEN CLUB',description:'Een blauw clubvaandel links, met een open witte navigatie.'},
 {id:'middenstip',number:'05',name:'Middenstip',slogan:'ONZE CLUB. ONZE TROTS.',description:'Het clubmerk centraal, met navigatie en bediening in balans.'},
 {id:'kustlijn',number:'06',name:'Kustlijn',slogan:'ONZE WIJK. ONZE CLUB. ONZE TROTS.',description:'Een witte clubstrook met blauwe accenten en een verfijnde onderlijn.'},
 {id:'clubband',number:'07',name:'Clubband',slogan:'ONZE WIJK. ONZE CLUB. ONZE TROTS.',description:'De blauwe clubbalk als header, met muurtextuur en de navigatie van Tribune.'},
] as const;
export type HeaderDesign = typeof headerDesigns[number]['id'];
export function resolveHeader(value:unknown):HeaderDesign{return headerDesigns.some(x=>x.id===value)?value as HeaderDesign:'clubband';}
export const heroPositions=['Nieuws · volle hoogte','Uitgelicht naast de spelers','Rechtsboven','Rechtsonder'] as const;
export type HeroCardKind='page'|'article'|'team'|'match'|'news';
export type HeroCardConfig={id:string;kind:HeroCardKind;target:string;title:string;kicker:string;description:string;image:string;layout:'photo'|'split'};
export const heroImages=[
 {value:'/assets/clubmuur-portrait.webp',label:'Spelersportret'},
 {value:'/assets/team.png',label:'Spelers op het veld'},
 {value:'/assets/clubmuur-walking.jpg',label:'Walking Football'},
 {value:'/assets/terrace.webp',label:'Supporters'},
 {value:'/assets/kit.png',label:'Clubtenue'},
 {value:'/assets/crest-close.webp',label:'Clubembleem'},
];
export const heroPages=[{value:'club',label:'De club'},{value:'club/vrijwilligers',label:'Vrijwilligers'},{value:'nieuws',label:'Nieuws'},{value:'teams',label:'Teams'},{value:'wedstrijden',label:'Wedstrijden'}];
export const defaultHeroCards:HeroCardConfig[]=[
 {id:'top-left',kind:'news',target:'latest',title:'Laatste nieuws.',kicker:'VAN DE CLUB',description:'',image:'/assets/clubmuur-portrait.webp',layout:'photo'},
 {id:'top-right',kind:'match',target:'next',title:'Volgende wedstrijd',kicker:'THUIS',description:'',image:'/assets/team.png',layout:'photo'},
 {id:'bottom-left',kind:'page',target:'club/vrijwilligers',title:'De kracht van\nvrijwilligers',kicker:'ONZE MENSEN',description:'',image:'/assets/team.png',layout:'photo'},
 {id:'bottom-right',kind:'team',target:'walking',title:'Walking\nFootball',kicker:'EEN LEVEN LANG',description:'Voetbalplezier\nvoor iedereen',image:'/assets/clubmuur-walking.jpg',layout:'split'},
];
export function validHeroCards(value:unknown):value is HeroCardConfig[]{
 return Array.isArray(value)&&value.length===4&&value.every((c,i)=>c&&c.id===defaultHeroCards[i].id&&['page','article','team','match','news'].includes(c.kind)&&['photo','split'].includes(c.layout)&&['target','title','kicker','description','image'].every(k=>typeof c[k]==='string')&&c.title.trim().length>0&&c.title.length<=64&&c.kicker.length<=40&&c.description.length<=100&&heroImages.some(im=>im.value===c.image)&&(['article','team'].includes(c.kind)||c.kind==='match'&&c.target==='next'||c.kind==='news'&&c.target==='latest'||c.kind==='page'&&heroPages.some(p=>p.value===c.target)));
}
