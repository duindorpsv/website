import {test} from 'node:test';
import assert from 'node:assert/strict';
import {publishNewsSelection} from '../../lib/cms/bulk-news';
import {createCmsSeed} from '../../lib/cms/seed';
import type {CmsCommand,CmsUpdate} from '../../lib/cms/types';

function fixture(count:number){
  const state=createCmsSeed(),source=state.articles.find(article=>article.contentType==='news')!;
  state.articles=Array.from({length:count},(_,index)=>({...structuredClone(source),id:'bulk-'+index,version:3,title:'Bericht '+index,slug:'bulk-'+index,coverId:'',featured:false,live:undefined,status:'draft' as const}));
  return state;
}
test('bulk publishing validates each selected news item and retains explicit versions and publication commands',async()=>{
  const state=fixture(6);
  state.articles[0].status='scheduled';state.articles[0].scheduledAt='2099-01-01T00:00:00Z';
  state.articles[1].title='';state.articles[2].teamId='other-team';
  state.articles[3].contentType='story';state.articles[4].deletedAt='2026-10-19T00:00:00Z';
  state.articles[5].coverId='missing-cover';
  const before=structuredClone(state);
  let calls=0;
  const update:CmsUpdate=async(recipe,label,commands)=>{
    calls++;const draft=structuredClone(state);recipe(draft);
    assert.deepEqual(commands,{'bulk-0':{action:'publish',expectedVersion:3}});
    assert.equal(draft.articles[0].status,'published');assert.equal(draft.articles[0].scheduledAt,'');
    assert.equal(draft.articles[0].live,undefined);assert.deepEqual(draft.settings,state.settings);
    return true;
  };
  const result=await publishNewsSelection({state,ids:[...state.articles.map(a=>a.id),'missing','bulk-0'],can:(_permission,team)=>team!=='other-team',update});
  assert.equal(calls,1);assert.deepEqual(result.published,['bulk-0']);assert.equal(result.issues.length,6);
  assert.match(result.issues.find(issue=>issue.id==='bulk-2')!.messages.join(' '),/geen rechten/);
  assert.match(result.issues.find(issue=>issue.id==='bulk-5')!.messages.join(' '),/omslagfoto/);
  assert.deepEqual(state,before);
});

test('a large selection is divided into atomic batches within the endpoint change limit',async()=>{
  const state=fixture(113),sizes:number[]=[],progress:number[]=[];
  const result=await publishNewsSelection({state,ids:state.articles.map(a=>a.id),can:()=>true,update:async(_recipe,_label,commands)=>{sizes.push(Object.keys(commands!).length);return true;},onProgress:published=>progress.push(published)});
  assert.deepEqual(sizes,[50,50,13]);assert.deepEqual(progress,[0,50,100,113]);
  assert.equal(result.published.length,113);assert.deepEqual(result.issues,[]);
});

test('multibyte article content is split by request bytes before reaching the 2 MB body limit',async()=>{
  const state=fixture(12);for(const article of state.articles)article.body={type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'海'.repeat(100_000)}]}]};
  let batches=0;
  await publishNewsSelection({state,ids:state.articles.map(a=>a.id),can:()=>true,update:async(recipe,_label,commands)=>{
    batches++;const draft=structuredClone(state);recipe(draft);
    const changes=Object.entries(commands!).map(([id,command])=>{const {live,revisions,version,...data}=draft.articles.find(a=>a.id===id)!;return {module:'articles',id,expectedVersion:command.expectedVersion,action:command.action,data};});
    assert.ok(Buffer.byteLength(JSON.stringify({operationId:crypto.randomUUID(),changes}))<2_000_000);return true;
  }});
  assert.ok(batches>1);
});

test('a failed group stops subsequent groups and keeps previous successes separate',async()=>{
  const state=fixture(111);let calls=0;
  const result=await publishNewsSelection({state,ids:state.articles.map(a=>a.id),can:()=>true,update:async()=>++calls===1});
  assert.equal(calls,2);assert.equal(result.stopped,true);assert.equal(result.published.length,50);
  assert.equal(result.issues.length,61);assert.ok(result.issues.every(issue=>!result.published.includes(issue.id)));
});

test('publication never adopts a new version silently, and leaving the overview stops further batches',async()=>{
  const state=fixture(51);let calls=0,commands:Record<string,CmsCommand>|undefined;
  const result=await publishNewsSelection({state,ids:state.articles.map(a=>a.id),can:()=>true,shouldContinue:()=>calls===0,update:async(recipe,_label,input)=>{
    calls++;commands=input;
    const refreshed=structuredClone(state);refreshed.articles[0].version=4;refreshed.articles[0].title='Concurrent edit';recipe(refreshed);
    assert.equal(commands!['bulk-0'].expectedVersion,3);assert.equal(refreshed.articles[0].title,state.articles[0].title);
    return true;
  }});
  assert.equal(calls,1);assert.equal(result.stopped,true);assert.equal(result.published.length,50);
});

test('invalid or oversized selections never send a mutation',async()=>{
  const state=fixture(2);state.articles[0].title='';state.articles[1].body={type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'海'.repeat(650_000)}]}]};
  const result=await publishNewsSelection({state,ids:state.articles.map(a=>a.id),can:()=>true,update:async()=>{assert.fail('no publication expected');}});
  assert.equal(result.issues.length,2);assert.equal(result.published.length,0);
});
