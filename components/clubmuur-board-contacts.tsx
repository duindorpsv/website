import {Mail,Phone} from 'lucide-react';
import {clubBoardContacts} from '@/lib/clubmuur-people';

export function ClubBoardContacts(){return <section className="org-board-contacts" aria-label="Contact met het bestuur">
 <div className="org-board-contact"><span className="cp-kicker">HET BESTUUR BEREIKEN</span><h2>Via het secretariaat.</h2><a href={`mailto:${clubBoardContacts.secretariatEmail}`}><Mail size={17}/>{clubBoardContacts.secretariatEmail}</a></div>
 <div className="org-board-contact"><span className="cp-kicker">DE VOORZITTER</span><h2>Danny Goldenbelt.</h2><a href={`mailto:${clubBoardContacts.chairmanEmail}`}><Mail size={17}/>{clubBoardContacts.chairmanEmail}</a><a href={`tel:${clubBoardContacts.chairmanPhone}`}><Phone size={17}/>06 5901 9035</a></div>
 </section>;}
