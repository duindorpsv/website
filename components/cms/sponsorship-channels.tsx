'use client';
import { useState } from 'react';
import { ArrowUpRight, Download, Globe, Mail, MonitorPlay, Newspaper, Check } from 'lucide-react';
import { useCMS } from './sponsor-workspace-provider';
import { getPublicSponsors, readSponsorship, canManageSponsorship } from '@/lib/cms/sponsorship';
import { createCampaign, ensureNewsletterState } from '@/lib/cms/newsletter';
import { emptySEO, textDoc, uid, now, slugify } from '@/lib/cms/model';
import type { CmsArticle } from '@/lib/cms/types';
export function SponsorshipChannels({ sponsorId }: {
    sponsorId?: string;
}) {
    const { state, userId, update, notify, can, request } = useCMS();
    const data = readSponsorship(state);
    const [selection, setSelection] = useState(sponsorId || data.sponsors[0]?.id || '');
    const [created, setCreated] = useState<'news' | 'newsletter' | null>(null);
    const selected = data.sponsors.find(s => s.id === (sponsorId || selection));
    if (!canManageSponsorship(state, userId))
        return null;
    const publicSponsors = getPublicSponsors(state);
    async function create(kind:'news'|'newsletter'){if(!selected)return;try{const result=await request('/api/sponsorship/channels',{operationId:crypto.randomUUID(),companyId:selected.id,kind});setCreated(kind);notify(result.message);}catch(e){notify(e instanceof Error?e.message:'Concept maken is mislukt.');}}
    function exportFeed() {
        const content = { type: 'duindorp-sponsors', version: 1, generatedAt: now(), note: 'Export van goedgekeurde publieke sponsorprofielen. VeyoCast API is niet geconfigureerd.', sponsors: publicSponsors.map(s => ({ id: s.id, ...s.publicProfile, from: s.publicFrom, until: s.publicUntil })) };
        const url = URL.createObjectURL(new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = 'duindorp-sponsoren-veyocast.json';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    return <section className="sp-channels"><div className="cms-toolbar"><div><h3>Eén profiel. Overal onze partners.</h3><p>Alle kanalen gebruiken het goedgekeurde bedrijfsprofiel. Nieuwe sponsorinhoud gaat eerst naar de redactie.</p></div>{!sponsorId && <label className="cms-field"><span>Bedrijf voor concepten</span><select value={selection} onChange={e => { setSelection(e.target.value); setCreated(null); }}>{data.sponsors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}</div><div className="sp-channel-grid">
  <article className="cms-panel"><Globe size={24}/><h3>Website & sponsorstrip</h3><p>{publicSponsors.length} goedgekeurde profielen binnen hun publicatieperiode. De sponsorstrip en sponsorpagina volgen dezelfde gegevens.</p><a className="cms-button" href="/clubmuur/club/sponsoren" target="_blank" rel="noreferrer">Bekijk onze sponsoren <ArrowUpRight size={15}/></a></article>
  <article className="cms-panel"><Newspaper size={24}/><h3>Nieuws van een samenwerking</h3><p>Bereid een zelfstandig nieuwsbericht voor met de goedgekeurde naam en bedrijfstekst. Publiceren blijft bij de redactie.</p><button className="cms-button" disabled={!selected} onClick={async () => await create('news')}>Nieuwsconcept maken</button>{created === 'news' && <p role="status"><Check size={14}/>Klaar voor beoordeling {can('news') && <a href="/beheer#nieuws">Open nieuws</a>}</p>}</article>
  <article className="cms-panel"><Mail size={24}/><h3>Een plek in de clubpost</h3><p>Maak een e-mailconcept met tekst, logo en knop. Er worden geen contacten ingeschreven of e-mails verstuurd.</p><button className="cms-button" disabled={!selected} onClick={async () => await create('newsletter')}>Nieuwsbriefconcept maken</button>{created === 'newsletter' && <p role="status"><Check size={14}/>Concept aangemaakt {can('news') && <a href="/beheer#nieuwsbrieven">Open nieuwsbrieven</a>}</p>}</article>
  <article className="cms-panel"><MonitorPlay size={24}/><h3>Kantinescherm & VeyoCast</h3><p>Bekijk een schermweergave vanuit dezelfde sponsorprofielen of exporteer de publiceerbare gegevens voor de toekomstige VeyoCast-koppeling.</p><a className="cms-button" href="/sponsorscherm" target="_blank" rel="noreferrer">Schermvoorbeeld <ArrowUpRight size={15}/></a><button className="cms-button" onClick={exportFeed}><Download size={15}/>Feedvoorbeeld</button></article>
 </div><style>{`.sp-channel-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.sp-channel-grid>article{padding:22px;min-width:0}.sp-channel-grid>article>svg{color:#0755a8}.sp-channel-grid h3{margin:14px 0 8px}.sp-channel-grid p{font-size:13px;line-height:1.7;color:#65758a}.sp-channel-grid .cms-button{margin:4px 5px 0 0}.sp-channel-grid p[role=status]{display:flex;gap:6px;align-items:center;color:#24785b}.sp-channels select{max-width:100%}@media(max-width:700px){.sp-channel-grid{grid-template-columns:1fr}}`}</style></section>;
}
