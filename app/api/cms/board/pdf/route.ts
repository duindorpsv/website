import {downloadBoardPdf} from '@/lib/server/board-files';
import {errorResponse} from '@/lib/server/errors';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{return await downloadBoardPdf(request);}catch(error){return errorResponse(error);}}
