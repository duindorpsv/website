'use client';
import {useEffect,useRef,useState} from 'react';
import {Dialog} from 'radix-ui';
import {X,CloudDownload} from 'lucide-react';
import {useCMS} from './sponsor-workspace-provider';

type ImportPreview={
 previewId:string;
 counts:{created:number;updated:number};
 columns:string[];
 people:{sourceId:string;name:string;status:string}[];
 fieldOwnership:string;
};

export function DirectoryImportPanel({onClose}:{onClose:()=>void}){
 const {request,reload}=useCMS();
 const [status,setStatus]=useState<{clubCode:string;message:string}|null>(null);
 const [file,setFile]=useState<File|null>(null),[preview,setPreview]=useState<ImportPreview|null>(null);
 const [error,setError]=useState(''),[busy,setBusy]=useState<'preview'|'apply'|null>(null);
 const generation=useRef(0);
 useEffect(()=>{
  const controller=new AbortController();
  fetch('/api/sponsorship/import',{signal:controller.signal,cache:'no-store'}).then(async r=>{
   const data=await r.json();if(!r.ok)throw Error(data.message);setStatus(data);
  }).catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Bronconfiguratie laden is mislukt.');});
  return()=>{controller.abort();generation.current++;};
 },[]);
 async function check(){
  if(!file||!status||busy)return;
  const current=++generation.current;
  setPreview(null);setBusy('preview');setError('');
  try{
   if(file.size>5_000_000)throw Error('Het bronbestand mag maximaal 5 MB groot zijn.');
   const raw=await file.text();
   if(current!==generation.current)return;
   const data=await request<ImportPreview>('/api/sponsorship/import',{action:'preview',clubCode:status.clubCode,...(file.name.toLowerCase().endsWith('.json')?{people:JSON.parse(raw)}:{csv:raw})});
   if(current===generation.current)setPreview(data);
  }catch(e){if(current===generation.current)setError(e instanceof Error?e.message:'Controleer het bestand.');}
  finally{if(current===generation.current)setBusy(null);}
 }
 async function apply(){
  if(!preview||busy)return;
  const current=++generation.current;
  setBusy('apply');setError('');
  try{
   await request('/api/sponsorship/import',{action:'apply',previewId:preview.previewId});
   await reload();
   if(current===generation.current)onClose();
  }catch(e){if(current===generation.current)setError(e instanceof Error?e.message:'Importeren is mislukt.');}
  finally{if(current===generation.current)setBusy(null);}
 }
 return <Dialog.Root open onOpenChange={v=>!v&&onClose()}><Dialog.Portal><Dialog.Overlay className="dr-overlay"/><Dialog.Content className="dr-modal wide"><header className="dr-modal-head"><div><Dialog.Title>Sportlink-ledenexport importeren</Dialog.Title><Dialog.Description>Alle leden en bronkolommen gecontroleerd toevoegen en bijwerken.</Dialog.Description></div><Dialog.Close className="cms-button" aria-label="Import sluiten"><X size={18}/></Dialog.Close></header><div className="dr-modal-body">
  <p>{status?.message||'Bronconfiguratie laden…'}</p>
  <p><strong>Eigen club:</strong> {status?.clubCode||'Nog niet bevestigd bij Sportlink-instellingen'}</p>
  <p>Upload de volledige Sportlink-CSV zonder kolommen te hernoemen, inclusief de kolom Rel. code. Alle bronkolommen blijven bewaard en zijn na import per lid te bekijken onder Brongegevens. Maximaal 2.000 personen en 5 MB per bestand.</p>
  <p>CSV met bronId, naam, email en telefoon en het bestaande JSON-formaat blijven ook ondersteund. Gebruik een geautoriseerde export van de eigen club.</p>
  <label className="cms-field">Bronbestand<input type="file" accept=".csv,.json,text/csv,application/json" disabled={busy==='apply'} onChange={e=>{generation.current++;setFile(e.target.files?.[0]||null);setPreview(null);setError('');setBusy(null);}}/></label>
  <button className="cms-button primary" disabled={!!busy||!file||!status?.clubCode} onClick={check}><CloudDownload size={16}/>{busy==='preview'?'Voorvertoning controleren…':'Voorvertoning controleren'}</button>
  {preview&&<>
   <p>{preview.counts.created} toevoegen · {preview.counts.updated} bijwerken · {preview.columns.length} bronkolommen</p>
   {!!preview.columns.length&&<details style={{marginBottom:16}}><summary>Alle {preview.columns.length} bronkolommen bekijken</summary><ul style={{maxHeight:220,overflow:'auto',overflowWrap:'anywhere',paddingLeft:24}}>{preview.columns.map(column=><li key={column}>{column}</li>)}</ul></details>}
   <p>{preview.fieldOwnership}</p>
   <div style={{maxHeight:320,overflow:'auto'}}><table className="sb-table"><thead><tr><th>Bron-ID</th><th>Naam</th><th>Actie</th></tr></thead><tbody>{preview.people.map(p=><tr key={p.sourceId}><td>{p.sourceId}</td><td>{p.name}</td><td>{p.status}</td></tr>)}</tbody></table></div>
   <button className="cms-button primary" disabled={!!busy} onClick={apply}>{busy==='apply'?'Import uitvoeren…':'Gecontroleerde import uitvoeren'}</button>
  </>}
  {error&&<p role="alert" className="sb-error">{error}</p>}
 </div></Dialog.Content></Dialog.Portal></Dialog.Root>;
}
