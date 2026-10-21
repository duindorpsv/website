import {NewsletterPreferences} from '@/components/cms/newsletter-preferences';
export const dynamic='force-dynamic';
export const metadata={robots:{index:false,follow:false},referrer:'no-referrer'};
export default async function Page({searchParams}:{searchParams:Promise<{token?:string}>}){const token=(await searchParams).token||'';return <main className="wrap" style={{maxWidth:720,paddingBlock:60}}><h1>Je nieuwsbriefvoorkeuren</h1>{/^[0-9a-f]{64}$/.test(token)?<NewsletterPreferences token={token}/>:<p>Deze persoonlijke link is ongeldig.</p>}<p><a href="/clubmuur">Naar de clubwebsite</a></p></main>;}
