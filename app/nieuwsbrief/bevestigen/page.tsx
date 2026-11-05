import {NewsletterTokenAction} from '@/components/cms/newsletter-token-action';
export const dynamic='force-dynamic';
export const metadata={robots:{index:false,follow:false},referrer:'no-referrer'};
export default async function Page({searchParams}:{searchParams:Promise<{token?:string}>}){
 const token=(await searchParams).token||'';
 return <main className="wrap" style={{maxWidth:720,paddingBlock:60}}><h1>Nieuwsbrief</h1>{/^[0-9a-f]{64}$/.test(token)?<NewsletterTokenAction token={token} action="bevestigen"/>:<p>Deze link is ongeldig.</p>}<p><a href="/clubmuur">Naar de clubwebsite</a></p></main>;
}
