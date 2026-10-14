import {readFile,writeFile} from 'node:fs/promises';
import {sqlClient,closeDb} from '../db';
import {mapBrowserMedia} from '../lib/server/browser-media-import';
import {parseCmsState} from '../lib/cms/validation';
import {createHash} from 'node:crypto';
import type {Principal} from '../lib/server/permissions';
if(!['development','test'].includes(process.env.APP_ENV||''))throw new Error('Gebruik voor staging/production het geautoriseerde serverimportendpoint.');
const [source,destination,actorId]=process.argv.slice(2);if(!source||!destination||!actorId)throw new Error('Gebruik: import-browser-media.ts PRIVATE_SOURCE PRIVATE_OUTPUT CMS_ADMIN_ID');
const sql=sqlClient();try{const [member]=await sql`select user_id from cms_memberships where user_id=${actorId} and role_id='admin' and active=true`;if(!member)throw new Error('Actieve beheerder ontbreekt.');const raw=await readFile(source,'utf8'),backup=JSON.parse(raw),p:Principal={id:actorId,name:'Import operator',email:'',roleId:'admin',teamScoped:false,teams:[],departments:[],grants:[{module:'*',action:'*'}],mfa:true};const result=await mapBrowserMedia(p,parseCmsState(JSON.stringify(backup.state)),backup.blobs||[],createHash('sha256').update(raw).digest('hex'));await writeFile(destination,JSON.stringify({...backup,state:result.state,idMapping:result.mapping}),{mode:0o600});console.log('Originelen gevalideerd, afgeleiden gemaakt en private mapping opgeslagen.');}finally{await closeDb();}
