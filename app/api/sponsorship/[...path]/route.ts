import {directoryLookup} from '@/lib/server/directory-lookup';
import {sponsorChannelDraft} from '@/lib/server/sponsor-channels';
import {approvedSponsorProfiles} from '@/lib/server/sponsor-public';
import {sqlClient} from '@/db';
import {sponsorUpload,sponsorInvoiceDownload,sponsorDownload,sponsorAgreementDownload,publicSponsorLogo} from '@/lib/server/sponsor-files';
import {readSponsorNotifications} from '@/lib/server/sponsor-notifications';
import {directoryImportAction,directoryImportStatus} from '@/lib/server/directory-import';
import {familyAction} from '@/lib/server/directory-family';
import {bodyJson,CmsError,errorResponse} from '@/lib/server/errors';
import {workspaceEvents} from '@/lib/server/sponsor-events';
import {sponsorLogoUpload,sponsorLogoPreview,cancelSponsorLogoUpload} from '@/lib/server/sponsor-logos';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{path:string[]}>}){try{const path=(await params).path;
 if(path.join('/')==='directory-lookup')return Response.json(await directoryLookup(request),{headers:{'Cache-Control':'private, no-store'}});
 if(path.join('/')==='feed')return Response.json({version:1,sponsors:await approvedSponsorProfiles(sqlClient())},{headers:{'Cache-Control':'public, max-age=60'}});
 if(path.length===2&&path[0]==='previews')return await sponsorDownload(request,path[1],true);
 if(path.length===2&&path[0]==='logo-uploads')return await sponsorLogoPreview(request,path[1]);
 if(path.length===2&&path[0]==='logos')return await publicSponsorLogo(path[1]);
 if(path.length===2&&path[0]==='files')return await sponsorDownload(request,path[1]);
 if(path.length===3&&path[0]==='invoices'&&path[2]==='pdf')return await sponsorInvoiceDownload(request,path[1]);
 if(path.length===3&&path[0]==='agreements'&&path[2]==='pdf')return await sponsorAgreementDownload(request,path[1]);
 if(path.join('/')==='import')return Response.json(await directoryImportStatus(request),{headers:{'Cache-Control':'private, no-store'}});
 if(path.join('/')==='events')return await workspaceEvents(request);
 throw new CmsError('missing','Dit onderdeel is niet beschikbaar.',404);
}catch(error){return errorResponse(error);}}
export async function POST(request:Request,{params}:{params:Promise<{path:string[]}>}){try{const path=(await params).path;
 if(path.length===2&&path[0]==='logo-uploads')return Response.json(await sponsorLogoUpload(request,path[1]),{headers:{'Cache-Control':'private, no-store'}});
 if(path.length===3&&path[0]==='companies'&&path[2]==='materials')return Response.json(await sponsorUpload(request,path[1]),{headers:{'Cache-Control':'private, no-store'}});
 if(path.join('/')==='import')return Response.json(await directoryImportAction(request,await bodyJson(request,6_000_000)),{headers:{'Cache-Control':'private, no-store'}});
 if(path.join('/')==='notifications')return Response.json(await readSponsorNotifications(request,await bodyJson(request,300000)),{headers:{'Cache-Control':'private, no-store'}});
 if(path.join('/')==='channels')return Response.json(await sponsorChannelDraft(request,await bodyJson(request,4000)),{headers:{'Cache-Control':'private, no-store'}});
 if(path.join('/')==='family')return Response.json(await familyAction(request,await bodyJson(request,4000)),{headers:{'Cache-Control':'private, no-store'}});
 throw new CmsError('missing','Deze handeling is niet beschikbaar.',404);
}catch(error){return errorResponse(error);}}
export async function DELETE(request:Request,{params}:{params:Promise<{path:string[]}>}){try{const path=(await params).path;
 if(path.length===2&&path[0]==='logo-uploads')return Response.json(await cancelSponsorLogoUpload(request,path[1]),{headers:{'Cache-Control':'private, no-store'}});
 throw new CmsError('missing','Deze handeling is niet beschikbaar.',404);
}catch(error){return errorResponse(error);}}
