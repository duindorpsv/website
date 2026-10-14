'use client';

import type {ReactNode} from 'react';
import {ArrowUpRight,ChevronDown,ChevronRight,Info} from 'lucide-react';

const groups={club:{label:'Onze club',href:'/clubmuur/club'},teams:{label:'Onze teams',href:'/clubmuur/teams'},wedstrijden:{label:'Wedstrijden',href:'/clubmuur/wedstrijden'},nieuws:{label:'Media',href:'/clubmuur/nieuws'}};

export function ClubPageFrame({title,accent,kicker,intro,group,image,children}:{title:string;accent?:string;kicker:string;intro:string;group:keyof typeof groups;image?:string;children:ReactNode}){
 const parent=groups[group];
 return <main className="cp-page"><header className={`cp-hero${image?' cp-hero-with-image':''}`}>
  <div className="cp-hero-art" aria-hidden="true"/>
  <div className="cp-wrap"><nav className="cp-breadcrumbs" aria-label="Broodkruimelpad"><a href="/clubmuur">Home</a><ChevronRight size={12}/><a href={parent.href}>{parent.label}</a><ChevronRight size={12}/><span aria-current="page">{title}</span></nav>
   <div className="cp-hero-grid"><div><span className="cp-kicker">{kicker}</span><h1>{title}{accent&&<span className="cp-brush">{accent}</span>}</h1><p>{intro}</p></div>{image&&<div className="cp-hero-photo"><img src={image} alt="Sfeerbeeld van het clubleven bij Duindorp SV" width={960} height={640}/><span>ONZE WIJK. ONZE CLUB. ONZE TROTS.</span></div>}</div>
  </div>
 </header><div className="cp-content cp-wrap">{children}</div><div className="cp-endline cp-wrap"><span>MEER DAN EEN CLUB.</span><a href={parent.href}>Terug naar {parent.label.toLowerCase()} <ArrowUpRight size={15}/></a></div></main>;
}

export function PageSectionHeading({eyebrow,title,description}:{eyebrow?:string;title:string;description?:string}){return <header className="cp-section-heading">{eyebrow&&<span className="cp-kicker">{eyebrow}</span>}<h2>{title}</h2>{description&&<p>{description}</p>}</header>;}
export function PageLinkCard({href,title,description,number}:{href:string;title:string;description:string;number?:string}){return <a className="cp-link-card" href={href}>{number&&<span className="cp-card-number">{number}</span>}<h3>{title}</h3><p>{description}</p><span className="cp-card-link">Ontdek meer <ArrowUpRight size={18}/></span></a>;}
export function PageAccordion({items}:{items:{title:string;content:ReactNode}[]}){return <div className="cp-accordion">{items.map((item,index)=><details key={`${index}-${item.title}`}><summary>{item.title}<ChevronDown size={18}/></summary><div className="cp-prose">{item.content}</div></details>)}</div>;}
export function PageNotice({children}:{children:ReactNode}){return <div className="cp-notice"><Info size={17}/><div>{children}</div></div>;}
