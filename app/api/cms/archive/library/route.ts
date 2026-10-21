import {archiveLibraryImage} from '@/lib/server/archive-library';
import {principal,verifyOrigin} from '@/lib/server/permissions';
import {bodyJson,errorResponse} from '@/lib/server/errors';
import {z} from 'zod';
export async function POST(request:Request){try{verifyOrigin(request);const q=z.object({id:z.string().min(1).max(180)}).strict().parse(await bodyJson(request));return Response.json(await archiveLibraryImage(await principal(request.headers),q.id),{headers:{'Cache-Control':'private, no-store'}});}catch(e){return errorResponse(e);}}
