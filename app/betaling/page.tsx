import Link from 'next/link';
import {ShieldCheck} from 'lucide-react';
import styles from './payment-return.module.css';

export const metadata={title:'Betaling | Duindorp SV',robots:{index:false,follow:false}};
export default function PaymentReturn(){
 return <main className={styles.page}><article><img src="/assets/logo.png" alt="Duindorp SV" width={80} height={80}/><ShieldCheck size={32}/><h1>Bedankt voor je steun.</h1><p>Je bent terug van Mollie. We controleren de betaalstatus en werken de factuur bij zodra je betaling is bevestigd.</p><p>Is de betaling niet gelukt? Je kunt dezelfde betaallink opnieuw openen zolang deze nog geldig is.</p><Link href="/clubmuur">Naar de clubwebsite</Link></article></main>;
}
