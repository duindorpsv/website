import assert from 'node:assert/strict';
import {test} from 'node:test';
import {inspectAuthProvider} from '../../lib/server/auth-provider-diagnostics';
const configuration={url:'https://aeykhztxyhkzyugchehv.supabase.co',secret:'sb_secret_synthetic_private_marker'};
const privateMarker='sensitive-provider-email@example.invalid secret-id 12345678';
const response=(status:number,code:unknown='validation_failed')=>Response.json({code,message:privateMarker,user:{email:privateMarker}},{status});

test('Auth diagnostic uses only the fixed non-UUID GET, compares both header modes, and never exposes private fields',async()=>{
 const calls:RequestInit[]=[];
 const report=await inspectAuthProvider(configuration,async(url,init)=>{
  assert.equal(url,configuration.url+'/auth/v1/admin/users/not-a-uuid');assert.equal(init?.method,'GET');assert.equal(init?.redirect,'error');assert.equal(init?.cache,'no-store');assert.equal(init?.body,undefined);assert.ok(init?.signal instanceof AbortSignal);
  calls.push(init!);
  return response(404);
 });
 assert.equal(calls.length,2);
 assert.deepEqual(calls[0].headers,{apikey:configuration.secret,'X-Supabase-Api-Version':'2024-01-01'});
 assert.deepEqual(calls[1].headers,{apikey:configuration.secret,'X-Supabase-Api-Version':'2024-01-01',Authorization:'Bearer '+configuration.secret});
 assert.deepEqual(report.probes.map(value=>[value.header_mode,value.http_status,value.result,value.error_class]),[
  ['apikey-only',404,'admin-route-validated','validation_failed'],['apikey-and-bearer',404,'admin-route-validated','validation_failed'],
 ]);
 for(const probe of report.probes){assert.ok(Number.isInteger(probe.elapsed_ms)&&probe.elapsed_ms>=0);assert.deepEqual(Object.keys(probe),['header_mode','http_status','elapsed_ms','result','error_class']);}
 const serialized=JSON.stringify(report);for(const secret of [configuration.url,configuration.secret,privateMarker,'not-a-uuid','user','Authorization','SUPABASE'])assert.ok(!serialized.includes(secret));
 assert.equal(report.inference,'current-auth-router-order-version-dependent');
});
test('a plain 404 or unexpected 200 does not prove admin access; legacy exact error codes are supported',async()=>{
 const cases:[number,unknown,string,string][]=[
  [404,{},'inconclusive','unknown'],[404,{code:'user_not_found'},'inconclusive','user_not_found'],[200,{code:'validation_failed'},'inconclusive','validation_failed'],
  [404,{error_code:'validation_failed'},'admin-route-validated','validation_failed'],
  [404,{code:'validation_failed',error_code:'not_admin'},'inconclusive','invalid_response'],
  [404,{message:'validation_failed'},'inconclusive','unknown'],[404,[], 'inconclusive','invalid_response'],
 ];
 for(const [status,body,result,errorClass] of cases){
  let calls=0;const report=await inspectAuthProvider(configuration,async()=>{calls++;return Response.json(body,{status});});assert.equal(calls,2);
  for(const probe of report.probes){assert.equal(probe.result,result);assert.equal(probe.error_class,errorClass);}
 }
});
test('legacy numeric HTTP code and string error_code are compatible when a hosted build ignores the API version',async()=>{
 const legacy={code:404,error_code:'validation_failed',msg:privateMarker,error_id:privateMarker};
 const report=await inspectAuthProvider(configuration,async()=>Response.json(legacy,{status:404}));
 assert.ok(report.probes.every(probe=>probe.http_status===404&&probe.result==='admin-route-validated'&&probe.error_class==='validation_failed'));
 assert.ok(!JSON.stringify(report).includes(privateMarker));assert.ok(!JSON.stringify(report).includes('error_id'));
 const conflict=await inspectAuthProvider(configuration,async()=>Response.json({code:'not_admin',error_code:'validation_failed',msg:privateMarker},{status:404}));
 assert.ok(conflict.probes.every(probe=>probe.result==='inconclusive'&&probe.error_class==='invalid_response'));
});
test('401/403 normalize only allowlisted codes and preserve observed header differences without inventing a mail diagnosis',async()=>{
 let calls=0;
 const report=await inspectAuthProvider(configuration,async()=>++calls===1?response(404):response(401,'bad_jwt'));
 assert.equal(report.probes[0].result,'admin-route-validated');assert.equal(report.probes[1].result,'authorization-rejected');assert.equal(report.probes[1].error_class,'bad_jwt');
 const forbidden=await inspectAuthProvider(configuration,async()=>response(403,privateMarker));assert.equal(forbidden.probes[0].result,'authorization-rejected');assert.equal(forbidden.probes[0].error_class,'unknown');assert.ok(!JSON.stringify(forbidden).includes(privateMarker));
});
test('untrusted origins, credentials, paths, ports, and malformed secrets never reach fetch',async()=>{
 const configs=[{}, {...configuration,url:'http://aeykhztxyhkzyugchehv.supabase.co'}, {...configuration,url:'https://abcdefghijklmnopqrst.supabase.co'},
  {...configuration,url:configuration.url+'.attacker.invalid'}, {...configuration,url:configuration.url+':443'}, {...configuration,url:configuration.url+'/auth/v1'},
  {...configuration,url:configuration.url+'/?q=private'}, {...configuration,url:configuration.url+'/#private'}, {...configuration,url:'https://private@aeykhztxyhkzyugchehv.supabase.co'},
  {...configuration,secret:''},{...configuration,secret:'sb_secret_private\r\nX-Leak: private'}, {...configuration,secret:'sb_publishable_private'},
 ];
 for(const config of configs){const report=await inspectAuthProvider(config,async()=>{throw new Error('Unexpected external request');});assert.ok(report.probes.every(probe=>probe.result==='configuration-invalid'&&probe.http_status===null));}
 const slash=await inspectAuthProvider({...configuration,url:configuration.url+'/'},async()=>response(404));assert.equal(slash.probes[0].result,'admin-route-validated');
});
test('invalid JSON, malformed UTF-8, and oversized response bodies never leak or yield positive admin proof',async()=>{
 const variants=[()=>new Response(privateMarker,{status:404}),()=>new Response('null',{status:404}),()=>new Response(new Uint8Array([255]),{status:404}),
  ()=>new Response('{}',{status:404,headers:{'content-length':'16385'}}),()=>new Response('{}',{status:404,headers:{'content-length':'invalid'}}),
  ()=>new Response('x'.repeat(16385),{status:404}),
 ];
 for(const make of variants){const report=await inspectAuthProvider(configuration,async()=>make());for(const probe of report.probes){assert.equal(probe.result,'inconclusive');assert.equal(probe.error_class,'invalid_response');assert.equal(probe.http_status,404);}assert.ok(!JSON.stringify(report).includes(privateMarker));}
 let cancelled=0;
 const report=await inspectAuthProvider(configuration,async()=>new Response(new ReadableStream<Uint8Array>({start(controller){controller.enqueue(new Uint8Array(16385));},cancel(){cancelled++;}}),{status:404}));
 assert.equal(cancelled,2);assert.ok(report.probes.every(probe=>probe.error_class==='invalid_response'));
});
test('each probe enforces its own eight-second timeout, aborts once, and never retries',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let calls=0,aborts=0;
 const pending=inspectAuthProvider(configuration,async(_url,init)=>{calls++;return await new Promise<Response>((_resolve,reject)=>{init!.signal!.addEventListener('abort',()=>{aborts++;reject(new DOMException(privateMarker,'AbortError'));},{once:true});});});
 assert.equal(calls,1);t.mock.timers.tick(7999);assert.equal(aborts,0);t.mock.timers.tick(1);
 for(let i=0;i<12;i++)await Promise.resolve();
 assert.equal(calls,2);t.mock.timers.tick(8000);const report=await pending;
 assert.equal(calls,2);assert.equal(aborts,2);assert.ok(report.probes.every(probe=>probe.result==='transport-failed'&&probe.error_class==='transport_timeout'&&probe.http_status===null));assert.ok(!JSON.stringify(report).includes(privateMarker));
});
test('network and redirect failures expose only a static transport enum with no retries',async()=>{
 for(const failure of [new TypeError('redirect to '+privateMarker),new Error(configuration.secret)]){
  let calls=0;const report=await inspectAuthProvider(configuration,async()=>{calls++;throw failure;});assert.equal(calls,2);assert.ok(report.probes.every(probe=>probe.result==='transport-failed'&&probe.error_class==='transport_unavailable'));
  assert.ok(!JSON.stringify(report).includes(privateMarker));assert.ok(!JSON.stringify(report).includes(configuration.secret));
 }
});

test('the eight-second deadline also bounds a response body that stops streaming',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let calls=0,aborts=0;
 const pending=inspectAuthProvider(configuration,async(_url,init)=>{calls++;return new Response(new ReadableStream<Uint8Array>({start(controller){
  controller.enqueue(new TextEncoder().encode('{'));init!.signal!.addEventListener('abort',()=>{aborts++;controller.error(new DOMException(privateMarker,'AbortError'));},{once:true});
 }}),{status:404});});
 for(let i=0;i<12;i++)await Promise.resolve();t.mock.timers.tick(8000);for(let i=0;i<24;i++)await Promise.resolve();
 assert.equal(calls,2);t.mock.timers.tick(8000);const report=await pending;assert.equal(aborts,2);
 assert.ok(report.probes.every(probe=>probe.error_class==='transport_timeout'&&probe.http_status===404));
});
test('authorization rejection is preserved even when the provider sends invalid JSON',async()=>{
 const report=await inspectAuthProvider(configuration,async()=>new Response(privateMarker,{status:401}));
 assert.ok(report.probes.every(probe=>probe.result==='authorization-rejected'&&probe.error_class==='invalid_response'&&probe.http_status===401));assert.ok(!JSON.stringify(report).includes(privateMarker));
});
