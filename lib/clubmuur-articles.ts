import type {Article} from '@/lib/club-data';

const DUTCH_MONTHS = ['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december'];

function articleDate(value: string) {
  if (typeof value !== 'string') return 0;
  const dutch = value.trim().toLowerCase().match(/^(\d{1,2})\s+([a-z]+)\s+(\d{4})$/);
  if (dutch) {
    const month = DUTCH_MONTHS.indexOf(dutch[2]);
    return month < 0 ? 0 : Date.UTC(Number(dutch[3]), month, Number(dutch[1]));
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

// Use the same stable chronology for the hero's latest three and the next stories.
export function sortedClubArticles(items: Article[]): Article[] {
  return [...items].sort((a, b) => articleDate(b.date) - articleDate(a.date));
}
