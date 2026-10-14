import {headers} from 'next/headers';
import {redirect} from 'next/navigation';
import {principal} from '@/lib/server/permissions';
import {CmsProvider} from '@/components/cms/provider';
import {loadState} from '@/lib/server/records';
import type { Metadata } from 'next';
import { NarrowcastingStudio } from '@/components/narrowcasting-studio';
import '../narrowcasting.css';
import '../narrowcasting-sports.css';
import '../narrowcasting-club.css';

export const metadata: Metadata = {
  title: 'OnzeTrots TV · Duindorp SV',
  description: 'OnzeTrots TV: maak schermgroepen met actuele wedstrijden, programma, uitslagen en standen voor 16:9 en 9:16.',
};

export const dynamic='force-dynamic';
export default async function NarrowcastingPage({searchParams}:{searchParams:Promise<{tv?:string}>}) {
  if((await searchParams).tv!=='1'){try{await principal(await headers());}catch{redirect('/beheer/login');}}
  const {state}=await loadState(true);return <CmsProvider initialState={state}><NarrowcastingStudio /></CmsProvider>;
}
