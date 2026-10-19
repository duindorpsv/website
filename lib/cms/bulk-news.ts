import {articleContent,validateArticle} from './model';
import type {CmsArticle,CmsCommand,CmsState,CmsUpdate,Permission} from './types';

type CanPublish=(permission:Permission,teamId?:string,module?:string)=>boolean;
export type NewsPublicationIssue={id:string;title:string;messages:string[]};
export type NewsPublicationResult={published:string[];issues:NewsPublicationIssue[];stopped:boolean};
// The mutation endpoint accepts at most 50 changes and a 2 MB request body.
const MAX_BATCH_BYTES=1_800_000;

export async function publishNewsSelection({state,ids,can,update,onProgress,shouldContinue=()=>true}:{
  state:CmsState;ids:string[];can:CanPublish;update:CmsUpdate;
  onProgress?:(published:number,total:number)=>void;shouldContinue?:()=>boolean;
}):Promise<NewsPublicationResult>{
  const result:NewsPublicationResult={published:[],issues:[],stopped:false};
  const batches:CmsArticle[][]=[];
  let batch:CmsArticle[]=[],bytes=100;
  for(const id of new Set(ids)){
    const article=state.articles.find(item=>item.id===id);
    const messages=!article?['Dit bericht staat niet meer in het overzicht.']
      :article.contentType!=='news'?['Selecteer een nieuwsbericht.']
      :!can('news',article.teamId)||!can('publish',article.teamId,'news')?['Je hebt geen rechten om dit bericht te publiceren.']
      :typeof article.version!=='number'?['Laad het overzicht opnieuw voordat je publiceert.']
      :validateArticle(article,state);
    if(messages.length){result.issues.push({id,title:article?.title||'Zonder titel',messages});continue;}
    const {live,revisions,version,...data}=article!;
    const size=new TextEncoder().encode(JSON.stringify({module:'articles',id,expectedVersion:version,action:'publish',data:{...data,status:'published',scheduledAt:''}})).length+1;
    if(size>MAX_BATCH_BYTES){result.issues.push({id,title:article!.title,messages:['Dit bericht is te groot om samen te publiceren. Open het bericht en verklein de inhoud.']});continue;}
    if(batch.length===50||bytes+size>MAX_BATCH_BYTES){batches.push(batch);batch=[];bytes=100;}
    batch.push(article!);bytes+=size;
  }
  if(batch.length)batches.push(batch);
  const total=batches.reduce((count,items)=>count+items.length,0);
  onProgress?.(0,total);
  for(let index=0;index<batches.length;index++){
    const items=batches[index];
    if(!shouldContinue()){result.stopped=true;break;}
    const commands:Record<string,CmsCommand>=Object.fromEntries(items.map(article=>[article.id,{action:'publish',expectedVersion:article.version}]));
    let saved=false;
    try{
      saved=await update(draft=>{
        for(const article of items){
          let record=draft.articles.find(item=>item.id===article.id);
          // Keep every selected record in the command, even if a refresh removed it.
          // The server checks the captured version and permissions atomically.
          if(!record){record=structuredClone(article);draft.articles.push(record);}
          Object.assign(record,articleContent(article),{status:'published',scheduledAt:''});
        }
      },`${items.length} nieuwsbericht${items.length===1?'':'en'} gepubliceerd.`,commands);
    }catch{ /* A failed group must never be retried against a newer version automatically. */ }
    if(!saved){
      result.stopped=true;
      for(const article of batches.slice(index).flat())result.issues.push({id:article.id,title:article.title,messages:['Publiceren is gestopt door een opslagfout. De publicatie is niet bevestigd. Laad het overzicht opnieuw en controleer de berichten voordat je het opnieuw probeert.']});
      break;
    }
    result.published.push(...items.map(article=>article.id));
    onProgress?.(result.published.length,total);
  }
  return result;
}
