import {ClubCMS} from '@/components/club-cms';
import {headers} from 'next/headers';
import {redirect} from 'next/navigation';
import {principal} from '@/lib/server/permissions';
export const dynamic='force-dynamic';
export const metadata={title:'Clubbeheer · Duindorp SV',robots:{index:false,follow:false}};
export default async function Page(){try{await principal(await headers());}catch(error){redirect('/beheer/login');}return <ClubCMS/>;}
