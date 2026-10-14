import {AccountSecurity} from '@/components/cms/login';
import {headers} from 'next/headers';
import {redirect} from 'next/navigation';
import {principal} from '@/lib/server/permissions';
export default async function Page(){try{await principal(await headers());}catch{redirect('/beheer/login');}return <AccountSecurity/>;}
