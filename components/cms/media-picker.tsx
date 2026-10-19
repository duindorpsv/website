'use client';
import {Pagination,usePagination} from './pagination';

import {useState} from 'react';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {useCMS} from './provider';
import type {CmsMedia} from '@/lib/cms/types';

export function MediaPicker({value,onSelect,label='Afbeelding kiezen'}:{value?:string;onSelect:(media:CmsMedia)=>void;label?:string}){
 const {state,loadMoreMedia}=useCMS();const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[loading,setLoading]=useState(false);
 const photos=state.media.filter(media=>media.published&&!media.deletedAt&&media.src&&`${media.name} ${media.alt} ${media.caption}`.toLocaleLowerCase('nl').includes(query.toLocaleLowerCase('nl')));
 const pagination=usePagination(photos,query);
 return <><button type="button" className="cms-button" onClick={()=>setOpen(true)}>{label}</button><Dialog open={open} onOpenChange={setOpen}><DialogContent className="club-dialog cms-media-picker"><DialogHeader><DialogTitle>Kies uit de mediabibliotheek</DialogTitle><DialogDescription>Gebruik een gepubliceerde afbeelding. Nieuwe foto’s voeg je toe in de mediabibliotheek.</DialogDescription></DialogHeader><label className="cms-field">Afbeeldingen zoeken<input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Zoek op naam of beschrijving"/></label><div className="cms-rich-media">{pagination.items.map(photo=><button type="button" aria-pressed={photo.id===value} key={photo.id} onClick={()=>{onSelect(photo);setOpen(false);}}><img src={photo.src} alt={photo.alt||photo.name}/><span>{photo.name}</span></button>)}</div><Pagination label="Afbeelding kiezen" {...pagination}/>{!photos.length&&<p>Geen gepubliceerde afbeeldingen gevonden.</p>}<button type="button" className="cms-button" disabled={loading} onClick={async()=>{setLoading(true);try{await loadMoreMedia();}finally{setLoading(false);}}}>{loading?'Laden…':'Meer afbeeldingen laden'}</button><a href="/beheer#media">Mediabibliotheek beheren</a></DialogContent></Dialog></>;
}
