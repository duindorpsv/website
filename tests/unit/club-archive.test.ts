import {unstable_doesMiddlewareMatch} from 'next/experimental/testing/server';
import {config as proxyConfig} from '../../proxy';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {archiveDateSchema,archiveContributionSchema,ARCHIVE_POLICY} from '../../lib/club-archive-schema';
import {archiveDateOverlaps,archiveDateLabel,archiveCompareDate,archiveSearchText,archiveReceivedDay} from '../../lib/club-archive-types';

test('archive date precision never invents January and seasons overlap years and decades',()=>{
 assert.deepEqual(archiveDateSchema.parse({year:1987,precision:'year',month:1}),{year:1987});
 assert.equal(archiveDateSchema.safeParse({year:1987,precision:'month'}).success,false);
 assert.deepEqual(archiveDateSchema.parse({unknown:true,year:1950,month:1}),{unknown:true});
 const season=archiveDateSchema.parse({year:1999,precision:'season'});
 assert.deepEqual(season,{year:1999,season:'1999/2000',endYear:2000});
 for(const [a,b] of [[1999,1999],[2000,2000],[1990,1999],[2000,2009]])assert.equal(archiveDateOverlaps(season,a,b),true);
 assert.equal(archiveDateOverlaps(season,2001),false);assert.equal(archiveDateOverlaps({unknown:true},1950,2100),false);
 assert.equal(archiveDateLabel(archiveDateSchema.parse({year:1978,precision:'circa'})),'Circa 1978');
 const dates=[{id:'season',date:{year:1950,season:'1950/1951'}},{id:'founding',date:{year:1950,month:8}},{id:'unknown',date:{unknown:true}},{id:'new',date:{year:2025}}];
 assert.deepEqual(dates.sort(archiveCompareDate).map(d=>d.id),['founding','season','new','unknown']);
 assert.equal(dates.sort((a,b)=>archiveCompareDate(a,b,true)).at(-1)?.id,'unknown');
});
test('archive validation centralizes limits, anonymity, references and consent-independent receipt fields',()=>{
 const draft={kind:'moment',title:'Herinnering',description:'Alleen tekst is welkom',date:{unknown:true},anonymous:true};
 assert.equal(archiveContributionSchema.parse(draft).media.length,0);
 assert.equal(archiveContributionSchema.safeParse({...draft,anonymous:false}).success,false);
 assert.equal(archiveContributionSchema.safeParse({...draft,kind:'correction'}).success,false);
 assert.equal(archiveContributionSchema.safeParse({...draft,title:''}).success,false);
 assert.equal(archiveContributionSchema.safeParse({...draft,email:'geen-email'}).success,false);
 const media={id:'one',kind:'image',src:'',name:'one',caption:'',credit:''};
 const ten=Array.from({length:10},(_,i)=>({...media,id:String(i)}));assert.equal(archiveContributionSchema.safeParse({...draft,media:ten}).success,true);assert.equal(archiveContributionSchema.safeParse({...draft,media:[...ten,{...media,id:'eleven'}]}).success,false);for(const offer of ['digital','photograph','loan','donation'])assert.equal(archiveContributionSchema.parse({...draft,kind:'object',offer}).offer,offer);
 assert.equal(ARCHIVE_POLICY.imageBytes,10485760);assert.equal(ARCHIVE_POLICY.avBytes,52428800);
});
test('historical source snapshot preserves founding, unknown dates and qualified comparison',()=>{
 const seed=JSON.parse(readFileSync('data/club-archive/seed.json','utf8'));
 assert.equal(seed.moments.length,16);assert.equal(seed.objects.length,9);
 const source=JSON.stringify(seed);assert.ok(source.includes('1950/1951'));assert.ok(source.includes('2009/2010'));assert.ok(source.includes('2024'));
 const comparison=seed.moments.find((m:any)=>m.comparison).comparison;
 assert.match(comparison.afterLabel,/gepubliceerd/i);assert.match(comparison.caption,/standpunt/i);assert.match(comparison.caption,/opnamedatum/i);
 assert.ok(seed.objects.some((o:any)=>o.date.unknown));
});

test('archive streaming uploads avoid Proxy truncation while protected routes retain Proxy coverage',()=>{
 for(const url of ['/api/archive/uploads?batch=example','/api/archive/uploads/'])assert.equal(unstable_doesMiddlewareMatch({config:proxyConfig,nextConfig:{},url}),false);
 for(const url of ['/beheer','/api/cms/archive','/api/archive/media/file','/api/archive/uploads/file'])assert.equal(unstable_doesMiddlewareMatch({config:proxyConfig,nextConfig:{},url}),true);
});

test('archive search finds current linked team and story names without duplicating them in historical text',()=>{
 const seed=JSON.parse(readFileSync('data/club-archive/seed.json','utf8')),moment={...seed.moments[0],team:'',links:[{id:'real-team-id',name:'Historische jeugdselectie',href:'/clubmuur/teams/123:-1'},{id:'real-story-id',name:'Een verbonden wedstrijdverhaal',href:'/clubmuur/verhalen/verbonden-verhaal'}]};
 assert.ok(archiveSearchText(moment).includes('historische jeugdselectie'));assert.ok(archiveSearchText(moment).includes('verbonden wedstrijdverhaal'));assert.ok(!moment.story.join(' ').includes('Historische jeugdselectie'));
});

test('inbox receipt filters follow the displayed Dutch day across winter and summer midnight',()=>{
 assert.equal(archiveReceivedDay('2026-10-20T22:30:00Z'),'2026-10-21');assert.equal(archiveReceivedDay('2026-12-20T23:30:00Z'),'2026-12-21');assert.equal(archiveReceivedDay('2026-12-20T22:30:00Z'),'2026-12-20');
});
