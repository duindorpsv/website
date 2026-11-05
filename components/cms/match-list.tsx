'use client';
import {useSportlink} from '@/hooks/use-sportlink';

export function CmsMatchList({kind='fixtures',limit=10}:{kind?:string;limit?:number}){
 const {data,loading,error}=useSportlink();const source=kind==='results'?data?.results:data?.fixtures;
 const matches=(source||[]).filter(match=>kind!=='cancellations'||/afgelast|cancel/i.test(match.status)).slice(0,Math.min(50,Math.max(1,limit)));
 if(loading&&!data)return <p role="status">Wedstrijdgegevens worden opgehaald…</p>;
 if(error&&!data)return <p>De wedstrijdgegevens zijn tijdelijk niet beschikbaar.</p>;
 return <div className="cmsp-match-list">{matches.length?matches.map(match=><article key={match.id}><time dateTime={match.kickoff}>{new Date(match.kickoff).toLocaleString('nl-NL',{timeZone:'Europe/Amsterdam',dateStyle:'medium',timeStyle:'short'})}</time><strong>{match.home.name} – {match.away.name}</strong><span>{match.scoreLabel||match.status}</span></article>):<p>{kind==='cancellations'?'Er zijn geen afgelastingen bekend.':'Er zijn geen wedstrijden beschikbaar voor deze selectie.'}</p>}<a href="/clubmuur/wedstrijden">Naar het wedstrijdcentrum</a></div>;
}
