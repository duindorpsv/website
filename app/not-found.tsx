import {ArrowRight,CalendarDays,Home,Newspaper,Users} from 'lucide-react';
import styles from './not-found.module.css';

export default function NotFound(){
 return <main className={styles.page}>
  <a href="/clubmuur" className={styles.brand}><img src="/assets/logo.png" alt="" width={46} height={54}/><span><strong>DUINDORP SV</strong><small>ONZE WIJK. ONZE CLUB. ONZE TROTS.</small></span></a>
  <section className={styles.card} aria-labelledby="missing-page-title">
   <span className={styles.kicker}>404 · EVEN BUITEN DE LIJNEN</span>
   <h1 id="missing-page-title">Deze pagina<br/>speelt niet mee.</h1>
   <p>De link is veranderd of de pagina bestaat niet meer. Je bent zo weer terug bij de club.</p>
   <a className={styles.primary} href="/clubmuur"><Home size={18}/>Terug naar de Clubmuur<ArrowRight size={19}/></a>
   <nav className={styles.links} aria-label="Verder op de website">
    <a href="/clubmuur/teams"><Users size={21}/><span>Onze teams</span><ArrowRight size={17}/></a>
    <a href="/clubmuur/wedstrijden"><CalendarDays size={21}/><span>Wedstrijdcentrum</span><ArrowRight size={17}/></a>
    <a href="/clubmuur/nieuws"><Newspaper size={21}/><span>Nieuws & actualiteit</span><ArrowRight size={17}/></a>
   </nav>
  </section>
  <span className={styles.since}>ONZE CLUB. ONZE TROTS. <b>SINDS 1950</b></span>
 </main>;
}
