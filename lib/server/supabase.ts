import {createClient} from '@supabase/supabase-js';
import {createServerClient,parseCookieHeader,type CookieOptions} from '@supabase/ssr';

export function supabaseSettings(){
  const {SUPABASE_URL:url,SUPABASE_PUBLISHABLE_KEY:key}=process.env;
  if(!url||!key)throw new Error('SUPABASE_URL en SUPABASE_PUBLISHABLE_KEY ontbreken.');
  return {url,key};
}

// Tokens stay in HttpOnly cookies. The browser uses only same-origin endpoints;
// the privileged key is never passed to a client component.
export function supabaseRequest(headers:Headers,write?:(cookies:{name:string;value:string;options:CookieOptions}[],headers:Record<string,string>)=>void){
  const {url,key}=supabaseSettings();
  const jar=new Map(parseCookieHeader(headers.get('cookie')||'').map(c=>[c.name,c.value||'']));
  return createServerClient(url,key,{
    cookieOptions:{httpOnly:true,secure:process.env.APP_BASE_URL?.startsWith('https://'),sameSite:'lax',path:'/'},
    cookies:{getAll:()=>Array.from(jar,([name,value])=>({name,value})),setAll:(cookies,responseHeaders)=>{
      for(const cookie of cookies)jar.set(cookie.name,cookie.value);
      write?.(cookies,responseHeaders);
    }},
  });
}

export function supabaseAdmin(){
  const {url}=supabaseSettings(),key=process.env.SUPABASE_SECRET_KEY;
  if(!key)throw new Error('SUPABASE_SECRET_KEY ontbreekt.');
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
}
