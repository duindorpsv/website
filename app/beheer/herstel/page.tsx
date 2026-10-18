import {PasswordRecovery} from '@/components/cms/login';
export const metadata={robots:{index:false,follow:false}};
export default async function Page({searchParams}:{searchParams:Promise<{token?:string|string[]}>}){const {token}=await searchParams;return <PasswordRecovery initialToken={typeof token==='string'?token:undefined}/>;}
