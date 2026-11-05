import {principal,authorize,verifyOrigin} from '@/lib/server/permissions';
import {CmsError,errorResponse} from '@/lib/server/errors';
import {readSportlinkSettings} from '@/lib/server/sportlink-config';
import {verifiedSportlinkCatalog} from '@/lib/server/sportlink-identity';
export async function POST(request:Request){try{
 verifyOrigin(request);const actor=await principal(request.headers);authorize(actor,'settings','manage');if(actor.teamScoped)throw new CmsError('forbidden','Clubbrede rechten vereist.',403);
 const {settings}=await readSportlinkSettings();const catalog=await verifiedSportlinkCatalog({...settings,clubCode:''},false,false);
 return Response.json({clubCode:catalog.clubCode,clubName:catalog.clubName,teams:catalog.teams,conflicts:catalog.conflicts},{headers:{'Cache-Control':'private, no-store'}});
 }catch(error){return errorResponse(error);}}
