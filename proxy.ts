import {NextResponse,type NextRequest} from 'next/server';
import {supabaseRequest} from './lib/server/supabase';
export async function proxy(request:NextRequest){
  let response=NextResponse.next({request});
  if(/^\/(?:beheer|preview)(?:\/|$)|^\/api\/(?:cms|media|documents)(?:\/|$)/.test(request.nextUrl.pathname)){
    const client=supabaseRequest(request.headers,(cookies,headers)=>{
      for(const cookie of cookies)request.cookies.set(cookie.name,cookie.value);
      response=NextResponse.next({request});
      for(const cookie of cookies)response.cookies.set(cookie.name,cookie.value,cookie.options);
      for(const [key,value] of Object.entries(headers))response.headers.set(key,value);
    });
    await client.auth.getClaims();
    response.headers.set('Cache-Control','private, no-store');
  }
  if(process.env.APP_ENV!=='production')response.headers.set('X-Robots-Tag','noindex, nofollow');
  return response;
}
// Raw archive uploads enforce origin, private ownership, expiry and quotas before
// reading their stream. Skip Proxy's automatic 10 MiB clone/truncation here.
export const config={matcher:['/((?!_next/static|_next/image|favicon.ico|api/archive/uploads/?$).*)']};
