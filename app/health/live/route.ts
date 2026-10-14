export const dynamic='force-dynamic';
export function GET(){return Response.json({status:'alive',release:process.env.RELEASE_DIGEST||'development'});}
