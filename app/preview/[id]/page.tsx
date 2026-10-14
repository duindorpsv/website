import {headers} from 'next/headers';
import {notFound} from 'next/navigation';
import {sqlClient} from '@/db';
import {principal,authorize} from '@/lib/server/permissions';
import {loadState,permissionModule,scope,type RecordRow} from '@/lib/server/records';
import {CmsProvider} from '@/components/cms/provider';
import {CmsPageView,CmsRichText} from '@/components/cms/public-content';
import {SportlinkProvider} from '@/hooks/use-sportlink';
export const dynamic='force-dynamic';
export const metadata={robots:{index:false,follow:false}};
export default async function Preview({params}:{params:Promise<{id:string}>}){const p=await principal(await headers()),{id}=await params,[row]=await sqlClient()<RecordRow[]>`select * from cms_records where id=${id} and module in ('pages','articles') and deleted_at is null`;if(!row)notFound();authorize(p,permissionModule(row.module),'read',scope(row));const {state}=await loadState(false,p);return <CmsProvider initialState={state} preview><SportlinkProvider><p className="cms-status">Beveiligde conceptpreview — formulieren verzenden niet.</p>{row.module==='pages'?<CmsPageView page={row.draft as any}/>:<main className="wrap"><h1>{row.draft.title}</h1><p>{row.draft.intro}</p><CmsRichText doc={row.draft.body}/></main>}</SportlinkProvider></CmsProvider>;}
