import {invitationHandler} from '@/lib/server/directory-invitations';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function POST(request:Request,{params}:{params:Promise<{action:string}>}){return invitationHandler(request,(await params).action);}
