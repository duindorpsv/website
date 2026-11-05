import {SponsorScreen} from '@/components/sponsor-public';
import {CmsProvider} from '@/components/cms/provider';
import {loadPublicState} from '@/lib/server/public-content';
export const dynamic='force-dynamic';
export const metadata={title:'Onze partners · Duindorp SV',robots:{index:false,follow:false}};
export default async function Page(){const {state}=await loadPublicState();return <CmsProvider initialState={state}><SponsorScreen/></CmsProvider>;}
