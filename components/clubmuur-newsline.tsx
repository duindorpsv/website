'use client';

import {Plus} from 'lucide-react';
import type {Article} from '@/lib/club-data';
import {sortedClubArticles} from '@/lib/clubmuur-articles';

export function ClubmuurNewsline({items,onOpen}:{items:Article[];onOpen:(article:Article)=>void}){
  return <div className="cm-newsline" id="clubmuur-nieuws">
    {sortedClubArticles(items).slice(0,2).map(item=><a key={item.id} href="/clubmuur/nieuws" onClick={event=>{event.preventDefault();onOpen(item);}}>
      <div className="cm-newsline-photo"><img src={item.image} alt="" width={200} height={200}/></div>
      <div className="cm-newsline-copy"><span>{item.category}</span><h3>{item.title}</h3><p>{item.intro}</p></div>
      <span className="cm-circle"><Plus size={17}/></span>
    </a>)}
    <a href="/clubmuur/teams">
      <div className="cm-newsline-photo"><img src="/assets/team.png" alt="Duindorp SV spelers" width={200} height={200}/></div>
      <div className="cm-newsline-copy"><span>TEAMS</span><h3>Van jeugd tot<br/>Walking Football</h3><p>Voor iedereen die van voetbal houdt.</p></div>
      <span className="cm-circle"><Plus size={17}/></span>
    </a>
  </div>;
}
