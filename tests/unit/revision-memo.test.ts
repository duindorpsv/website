import test from 'node:test';
import assert from 'node:assert/strict';
import {RevisionMemo} from '../../lib/server/revision-memo';
import {publicContentLifetime} from '../../lib/server/public-content-clock';

test('public memo joins concurrent loads, returns isolated copies and observes revisions immediately',async()=>{
 let count=0;const memo=new RevisionMemo<{title:string}>(30000);
 const load=async()=>{count++;await new Promise(r=>setTimeout(r,5));return {title:'Gepubliceerd'};};
 const values=await Promise.all(Array.from({length:8},()=>memo.read('1',load)));
 assert.equal(count,1);values[0].title='Lokale mutatie';assert.equal(values[1].title,'Gepubliceerd');
 assert.equal((await memo.read('1',load)).title,'Gepubliceerd');
 assert.equal((await memo.read('2',async()=>({title:'Ingetrokken'}))).title,'Ingetrokken');
});
test('public memo expires time-based content and never remembers an unsuccessful load',async()=>{
 let now=0,count=0;const memo=new RevisionMemo<number>(30,()=>now),load=async()=>++count;
 assert.equal(await memo.read('1',load),1);now=31;assert.equal(await memo.read('1',load),2);
 await assert.rejects(memo.read('2',async()=>{throw Error('database unavailable');}));
 assert.equal(await memo.read('2',load),3);
});
test('an older in-flight publication cannot replace a newer completed snapshot',async()=>{
 let release!:(value:string)=>void;const memo=new RevisionMemo<string>(30000);
 const old=memo.read('1',()=>new Promise<string>(resolve=>release=resolve));
 await Promise.resolve();assert.equal(await memo.read('2',async()=>'nieuw'),'nieuw');release('oud');assert.equal(await old,'oud');
 assert.equal(await memo.read('2',async()=>{throw Error('cache should hold the newer revision');}),'nieuw');
});
test('calendar keys and exact pin deadlines refresh time-dependent content without short polling',async()=>{
 let now=0;const memo=new RevisionMemo<number>(value=>value,()=>now);
 assert.equal(await memo.read('1|today',async()=>100),100);now=50;
 assert.equal(await memo.read('1|today',async()=>{throw Error('unnecessary CMS reload');}),100);
 assert.equal(await memo.read('1|tomorrow',async()=>200),200);
 const hour=3600000,at=Date.parse('2026-10-22T12:00:00Z');
 assert.equal(publicContentLifetime([],at),6*hour);
 assert.equal(publicContentLifetime([{live:{featured:true,publishedAt:'2026-10-15T13:00:00Z'}}],at),hour);
 assert.equal(publicContentLifetime([{live:{featured:true,featuredUntil:'2026-10-22T12:00:01Z'}}],at),1000);
 assert.equal(publicContentLifetime([{live:{featured:true,featuredUntil:'2026-10-21T12:00:01Z'}}],at),6*hour);
});
