import type { Metadata } from 'next';
import { NarrowcastingStudio } from '@/components/narrowcasting-studio';
import '../narrowcasting.css';
import '../narrowcasting-sports.css';
import '../narrowcasting-club.css';

export const metadata: Metadata = {
  title: 'OnzeTrots TV · Duindorp SV',
  description: 'OnzeTrots TV: maak schermgroepen met actuele wedstrijden, programma, uitslagen en standen voor 16:9 en 9:16.',
};

export default function NarrowcastingPage() {
  return <NarrowcastingStudio />;
}
