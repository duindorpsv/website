'use client';
type Result<T>={data:T;error:null}|{data:null;error:{message:string}};
async function post<T>(path:string,body:unknown):Promise<Result<T>>{
  try{
    const response=await fetch('/api/auth/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const data=await response.json();
    return response.ok?{data,error:null}:{data:null,error:{message:data.message||'De actie is mislukt.'}};
  }catch{return {data:null,error:{message:'De server is niet bereikbaar. Probeer opnieuw.'}};}
}
export const authClient={
  requestEmailCode:(body:{email:string})=>post<{status:true;message:string}>('email-code/request',body),
  verifyEmailCode:(body:{email:string;code:string})=>post<{status:true}>('email-code/verify',body),
  signOut:()=>post('sign-out',{}),
};
