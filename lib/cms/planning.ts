import {Temporal} from '@js-temporal/polyfill';

export const planningZone = 'Europe/Amsterdam';
export function planningInput(instant: string) {
  if (!instant) return '';
  return Temporal.Instant.from(instant).toZonedDateTimeISO(planningZone).toPlainDateTime().toString({smallestUnit:'minute'});
}
export function planningInstant(local: string, occurrence: 'earlier'|'later'|'reject' = 'reject') {
  const value = Temporal.PlainDateTime.from(local);
  const zoned = value.toZonedDateTime(planningZone, {disambiguation:occurrence});
  // A missing spring hour must never silently shift to another local time.
  if (!zoned.toPlainDateTime().equals(value)) throw new RangeError('Dit tijdstip bestaat niet door de overgang naar zomertijd.');
  return zoned.toInstant().toString();
}
