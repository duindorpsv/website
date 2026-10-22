import {headers} from 'next/headers';
import {redirect} from 'next/navigation';
import {principal} from '@/lib/server/permissions';
import {SponsorWorkspaceProvider} from '@/components/cms/sponsor-workspace-provider';
import {SponsorPortal} from '@/components/sponsor-portal';
export const dynamic='force-dynamic';
export const metadata={title:'Mijn sponsoring · Duindorp SV',robots:{index:false,follow:false}};
export default async function Page(){try{await principal(await headers());}catch{redirect('/portaal/inloggen');}return <SponsorWorkspaceProvider mode="portal"><SponsorPortal/></SponsorWorkspaceProvider>;}
