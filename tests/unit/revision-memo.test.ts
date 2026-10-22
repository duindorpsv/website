import test from 'node:test';
import assert from 'node:assert/strict';
import {RevisionMemo} from '../../lib/server/revision-memo';

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
