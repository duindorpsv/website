import {SponsorScreen} from '@/components/sponsor-public';
import {CmsProvider} from '@/components/cms/provider';
import {loadState} from '@/lib/server/records';
export const dynamic='force-dynamic';
export const metadata={title:'Onze partners · Duindorp SV',robots:{index:false,follow:false}};
export default async function Page(){const {state}=await loadState(true);return <CmsProvider initialState={state}><SponsorScreen/></CmsProvider>;}
