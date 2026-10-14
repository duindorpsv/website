import {NextResponse,type NextRequest} from 'next/server';
import {getAuth} from '@/lib/server/auth';
export async function proxy(request:NextRequest){if(process.env.APP_ENV==='staging'&&!/^\/(beheer\/(login|herstel)|api\/auth|health\/)/.test(request.nextUrl.pathname)){const session=await getAuth().api.getSession({headers:request.headers});if(!session)return NextResponse.redirect(new URL('/beheer/login',request.url));}const response=NextResponse.next();if(process.env.APP_ENV!=='production')response.headers.set('X-Robots-Tag','noindex, nofollow');return response;}
export const config={matcher:['/((?!_next/static|_next/image|favicon.ico).*)']};
