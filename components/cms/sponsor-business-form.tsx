'use client';
import type { SponsorBusinessDetails } from '@/lib/cms/sponsorship-types';
import './sponsor-business-form.css';
export const sponsorBusinessFields: {
    key: keyof SponsorBusinessDetails;
    label: string;
}[] = [
    { key: 'legalName', label: 'Statutaire bedrijfsnaam' },
    { key: 'companyNumber', label: 'KVK-nummer' },
    { key: 'registrationExempt', label: 'Geen KVK-inschrijving' },
    { key: 'registrationExemptionReason', label: 'Toelichting inschrijving' },
    { key: 'vatStatus', label: 'Btw-status' },
    { key: 'vatNumber', label: 'Btw-identificatienummer' },
    { key: 'address', label: 'Straat en huisnummer' },
    { key: 'postalCode', label: 'Postcode' },
    { key: 'city', label: 'Plaats' },
    { key: 'country', label: 'Land' },
    { key: 'contactName', label: 'Contactpersoon' },
    { key: 'contactFunction', label: 'Functie' },
    { key: 'contactEmail', label: 'Contact-e-mailadres' },
    { key: 'invoiceEmail', label: 'Factuur-e-mailadres' },
    { key: 'phone', label: 'Telefoonnummer' },
];
export function sponsorBusinessFieldValue(value: SponsorBusinessDetails, key: keyof SponsorBusinessDetails) {
    if (key === 'country')
        return ({ NL: 'Nederland', BE: 'België', DE: 'Duitsland', GB: 'Verenigd Koninkrijk', FR: 'Frankrijk' } as Record<string, string>)[value.country] || value.country || 'Niet ingevuld';
    if (key === 'registrationExempt')
        return value.registrationExempt ? 'Ja' : 'Nee';
    if (key === 'vatStatus')
        return { registered: 'Btw-geregistreerd', exempt: 'Vrijgesteld', 'not-applicable': 'Niet van toepassing' }[value.vatStatus] || 'Niet ingevuld';
    return String(value[key] || '') || 'Niet ingevuld';
}
export function SponsorBusinessForm({ value, onChange, disabled = false, prefix = 'business', requireComplete = false }: {
    value: SponsorBusinessDetails;
    onChange: (value: SponsorBusinessDetails) => void;
    disabled?: boolean;
    prefix?: string;
    requireComplete?: boolean;
}) {
    const change = (key: keyof SponsorBusinessDetails, next: string | boolean) => onChange({ ...value, [key]: next });
    const field = (key: keyof SponsorBusinessDetails, label: string, options: {
        required?: boolean;
        type?: string;
        placeholder?: string;
        wide?: boolean;
        maxLength?: number;
    } = {}) => <label className={`sbiz-field${options.wide ? ' wide' : ''}`} key={key} htmlFor={`${prefix}-${key}`}><span>{label}{options.required && <i> *</i>}</span><input id={`${prefix}-${key}`} value={String(value[key] || '')} disabled={disabled} required={requireComplete && options.required} type={options.type || 'text'} maxLength={options.maxLength || 180} placeholder={options.placeholder} onChange={event => change(key, event.target.value)}/></label>;
    return <div className="sbiz-form">
  <section className="sbiz-section"><div className="sbiz-section-heading"><span>01</span><div><h3>Het bedrijf</h3><p>De officiële gegevens die op de overeenkomst komen.</p></div></div><div className="sbiz-grid">
   {field('legalName', 'Statutaire bedrijfsnaam', { required: true, wide: true, placeholder: 'Naam volgens de inschrijving' })}
   {field('companyNumber', value.country === 'NL' ? 'KVK-nummer' : 'Registratienummer', { required: !value.registrationExempt, placeholder: 'Bijvoorbeeld 12345678', maxLength: 30 })}
   <label className="sbiz-check"><input type="checkbox" disabled={disabled} checked={value.registrationExempt} onChange={event => onChange({ ...value, registrationExempt: event.target.checked, companyNumber: event.target.checked ? '' : value.companyNumber })}/><span>Geen KVK-inschrijving van toepassing</span></label>
   {value.registrationExempt && <label className="sbiz-field wide" htmlFor={`${prefix}-registrationExemptionReason`}><span>Toelichting <i>*</i></span><textarea id={`${prefix}-registrationExemptionReason`} disabled={disabled} required={requireComplete} rows={2} maxLength={500} value={value.registrationExemptionReason} onChange={event => change('registrationExemptionReason', event.target.value)} placeholder="Licht toe waarom er geen inschrijving is."/></label>}
   <label className="sbiz-field" htmlFor={`${prefix}-vatStatus`}><span>Btw-status <i>*</i></span><select id={`${prefix}-vatStatus`} disabled={disabled} value={value.vatStatus} onChange={event => change('vatStatus', event.target.value)}><option value="registered">Btw-geregistreerd</option><option value="exempt">Vrijgesteld</option><option value="not-applicable">Niet van toepassing</option></select></label>
   {field('vatNumber', 'Btw-identificatienummer', { required: value.vatStatus === 'registered', placeholder: 'Bijvoorbeeld NL123456789B01', maxLength: 40 })}
  </div></section>
  <section className="sbiz-section"><div className="sbiz-section-heading"><span>02</span><div><h3>Vestigingsadres</h3><p>Het adres van de contractpartij.</p></div></div><div className="sbiz-grid">
   {field('address', 'Straat en huisnummer', { required: true, wide: true })}
   {field('postalCode', 'Postcode', { required: true, maxLength: 20 })}
   {field('city', 'Plaats', { required: true })}
   <label className="sbiz-field" htmlFor={`${prefix}-country`}><span>Land <i>*</i></span><select id={`${prefix}-country`} disabled={disabled} value={value.country} onChange={event => change('country', event.target.value)}><option value="NL">Nederland</option><option value="BE">België</option><option value="DE">Duitsland</option><option value="GB">Verenigd Koninkrijk</option><option value="FR">Frankrijk</option>{!['NL', 'BE', 'DE', 'GB', 'FR'].includes(value.country) && <option value={value.country}>{value.country || 'Kies een land'}</option>}</select></label>
  </div></section>
  <section className="sbiz-section"><div className="sbiz-section-heading"><span>03</span><div><h3>Contact & facturatie</h3><p>Persoonlijke accountrechten worden apart beheerd.</p></div></div><div className="sbiz-grid">
   {field('contactName', 'Contactpersoon', { required: true })}
   {field('contactFunction', 'Functie', { required: true, placeholder: 'Bijvoorbeeld eigenaar' })}
   {field('contactEmail', 'Contact-e-mailadres', { required: true, type: 'email' })}
   {field('invoiceEmail', 'Factuur-e-mailadres', { required: true, type: 'email' })}
   {field('phone', 'Telefoonnummer', { type: 'tel', maxLength: 40 })}
  </div></section>
 </div>;
}
