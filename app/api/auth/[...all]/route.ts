import {getAuth} from '@/lib/server/auth';
export const dynamic='force-dynamic';
export const GET=(request:Request)=>getAuth().handler(request);
export const POST=(request:Request)=>new URL(request.url).pathname.startsWith('/api/auth/admin/')?Promise.resolve(Response.json({message:'Gebruik CMS-accountbeheer.'},{status:403})):getAuth().handler(request);
