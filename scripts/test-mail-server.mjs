// Local synthetic mail sink. Never enabled by a production configuration.
import {createServer} from 'node:http';
import {appendFileSync,mkdirSync} from 'node:fs';
if(process.env.APP_ENV!=='test'||process.env.SUPABASE_LOCAL_TESTS!=='true')throw new Error('Local verification only');
const endpoint=new URL(process.env.TEST_MAIL_API_URL||'http://invalid');
if(endpoint.hostname!=='127.0.0.1'||endpoint.protocol!=='http:')throw new Error('Loopback only');
mkdirSync('.runtime',{recursive:true,mode:0o700});
const server=createServer(async(request,response)=>{
 if(request.url==='/health'){response.writeHead(200).end('ok');return;}
 if(request.method!=='POST'||!['/emails','/emails/batch'].includes(request.url)||request.headers.authorization!=='Bearer '+process.env.RESEND_API_KEY){response.writeHead(403).end();return;}
 try{
  let bytes=0;const chunks=[];for await(const chunk of request){bytes+=chunk.length;if(bytes>1000000)throw new Error('Too large');chunks.push(chunk);}
  const body=JSON.parse(Buffer.concat(chunks).toString()),messages=Array.isArray(body)?body:[body];
  if(messages.some(message=>!Array.isArray(message.to)||message.to.some(email=>email!==process.env.TEST_MAIL_TO)))throw new Error('Unsafe synthetic recipient');
  const records=messages.map(message=>({at:Date.now(),...message}));
  for(const record of records)appendFileSync('.runtime/mail-sink.jsonl',JSON.stringify(record)+'\n',{mode:0o600});
  response.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify(Array.isArray(body)?{data:messages.map(()=>({id:crypto.randomUUID()}))}:{id:crypto.randomUUID()}));
 }catch{response.writeHead(400).end();}
});
server.listen(Number(endpoint.port),'127.0.0.1');
process.on('SIGTERM',()=>server.close());
