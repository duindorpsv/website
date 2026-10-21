import { ArrowUpRight, BookOpen, ChevronRight } from 'lucide-react';
import { ClubPageFrame } from '@/components/clubmuur-page-kit';
import { clubHistoryMilestones, clubHistorySections, clubHistoryTitle } from '@/lib/clubmuur-history';

const emphasis = /(15 augustus 1950|1975|Sterrenslag|15 augustus 2025)/g;

function HistoryParagraph({ text, lead }: { text: string; lead?: boolean }) {
  return <p className={lead ? 'hp-lead' : undefined}>{text.split(emphasis).map((part, index) =>
    index % 2 === 1 ? <strong key={index}>{part}</strong> : part,
  )}</p>;
}

export function ClubHistoryPage() {
  return <ClubPageFrame title="Ons verhaal" accent="& historie." kicker="ONZE WIJK. ONZE CLUB. ONZE TROTS." intro={clubHistoryTitle} group="club">
    <div className="hp-story-header">
      <div className="hp-story-mark"><img src="/assets/logo.png" width={60} height={70} alt="Duindorp SV" /><span>OPGERICHT OP<strong>15 AUGUSTUS 1950</strong></span></div>
      <div className="hp-story-label"><BookOpen size={17} /><span>HET VERHAAL VAN ONZE VERENIGING</span></div>
    </div>

    <nav className="hp-milestones" aria-label="Mijlpalen in de clubgeschiedenis">
      {clubHistoryMilestones.map(item => <a key={item.year} href={item.href}><strong>{item.year}</strong><span>{item.label}</span><ChevronRight size={16} aria-hidden="true" /></a>)}
    </nav>

    <div className="cp-actions"><a className="cp-button-secondary" href="/clubmuur/club/tijdlijn">Ontdek de interactieve tijdlijn <ArrowUpRight size={16}/></a><a className="cp-button-secondary" href="/clubmuur/club/museum">Bezoek het digitale museum <ArrowUpRight size={16}/></a></div>
    <div className="hp-layout">
      <aside className="hp-aside">
        <nav className="hp-chapters" aria-label="Hoofdstukken van ons verhaal">
          <span className="hp-eyebrow">IN DIT VERHAAL</span>
          <ol>{clubHistorySections.map((section, index) => <li key={section.id}><a href={`#${section.id}`}><span>{String(index + 1).padStart(2, '0')}</span>{section.label}<ChevronRight size={14} aria-hidden="true" /></a></li>)}</ol>
          <div className="hp-aside-motto"><span>ONZE WIJK.</span><span>ONZE CLUB.</span><strong>ONZE TROTS.</strong></div>
        </nav>
      </aside>

      <article className="hp-article" aria-label={clubHistoryTitle}>
        {clubHistorySections.map((section, sectionIndex) => <section className="hp-chapter" key={section.id} id={section.id} aria-labelledby={`${section.id}-heading`}>
          <header><span className="hp-eyebrow"><span>{String(sectionIndex + 1).padStart(2, '0')}</span>{section.period}</span><h2 id={`${section.id}-heading`}>{section.title}</h2></header>
          {section.paragraphs.map((paragraph, paragraphIndex) => <HistoryParagraph key={paragraphIndex} text={paragraph} lead={sectionIndex === 0 && paragraphIndex === 0} />)}
        </section>)}

        <footer className="hp-source"><BookOpen size={22} aria-hidden="true" /><div><span className="hp-eyebrow">BEWAARD & DOORVERTELD</span><p><em>Bron: <a href="https://dehaagsevoetbalhistorie.nl/club/duindorp_sv/" target="_blank" rel="noreferrer">De Haagse Voetbalhistorie – Duindorp SV<ArrowUpRight size={13} aria-hidden="true" /></a>, aangevuld met interviews en historische artikelen uit hetzelfde archief, de clubwebsite van Duindorp SV, Haaglanden Voetbal en Het Haags Amateurvoetbal.</em></p></div></footer>
      </article>
    </div>
  </ClubPageFrame>;
}
