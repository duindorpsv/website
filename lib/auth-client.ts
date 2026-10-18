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
  signIn:{email:(body:{email:string;password:string})=>post<{twoFactorRedirect?:boolean}>('sign-in/email',body)},
  signOut:()=>post('sign-out',{}),
  requestPasswordReset:(body:{email:string;redirectTo:string})=>post('request-password-reset',body),
  resetPassword:(body:{newPassword:string;token:string;code?:string})=>post<{mfaRequired?:boolean}>('reset-password',body),
  twoFactor:{
    enable:()=>post<{method:'totp';totpURI:string}>('two-factor/enable',{}),
    verifyTotp:(body:{code:string})=>post('two-factor/verify-totp',body),
  },
};
