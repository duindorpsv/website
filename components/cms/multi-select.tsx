'use client';

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import './multi-select.css';

type Option = { id: string; name: string; description?: string; disabled?: boolean };
type Props = {
  label: string;
  options: Option[];
  value: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
  hint?: string;
  disabled?: boolean;
  required?: boolean;
  multiple?: boolean;
};
const searchable = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('nl').trim();

/** One compact entity picker, kept inside the dialog's focus and scroll boundary. */
export function CmsMultiSelect({ label, options, value, onChange, placeholder = 'Zoek en selecteer…', hint, disabled = false, required = false, multiple = true }: Props) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null), control = useRef<HTMLDivElement>(null), input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false), [query, setQuery] = useState(''), [activeId, setActiveId] = useState<string | null>(null);
  const [placement, setPlacement] = useState({ above: false, height: 240 });
  const selected = useMemo(() => value.map(id => options.find(option => option.id === id) || { id, name: 'Niet meer beschikbaar' }), [value, options]);
  const results = useMemo(() => {
    const words = searchable(query).split(/\s+/).filter(Boolean);
    return options.filter(option => words.every(word => searchable(`${option.name} ${option.description || ''}`).includes(word)));
  }, [query, options]);
  const enabled = results.filter(option => !option.disabled);
  const active = enabled.find(option => option.id === activeId) || enabled[0];
  const isDisabled = () => disabled || !!input.current?.matches(':disabled');
  const close = () => { setOpen(false); setQuery(''); setActiveId(null); };
  const show = () => { if (!isDisabled()) setOpen(true); };
  const toggle = (option: Option) => {
    if (isDisabled() || option.disabled) return;
    onChange(value.includes(option.id) ? value.filter(id => id !== option.id) : multiple ? [...value, option.id] : [option.id]);
    if(!multiple) setOpen(false);
    setQuery('');
    input.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) close(); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !control.current) return;
    const place = () => {
      const element = control.current;
      if (!element) return;
      const bounds = element.getBoundingClientRect();
      let top = 8, bottom = window.innerHeight - 8;
      // Respect nested scrolling dialogs; never portal outside their focus trap.
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        if (/(auto|scroll|hidden|clip)/.test(getComputedStyle(parent).overflowY)) {
          const rect = parent.getBoundingClientRect();
          top = Math.max(top, rect.top + 5); bottom = Math.min(bottom, rect.bottom - 5);
        }
      }
      const below = bottom - bounds.bottom - 6, above = bounds.top - top - 6;
      const useAbove = below < 190 && above > below;
      setPlacement({ above: useAbove, height: Math.max(64, Math.min(240, useAbove ? above : below)) });
    };
    place();
    window.addEventListener('resize', place);
    document.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); document.removeEventListener('scroll', place, true); };
  }, [open, value.length]);

  useEffect(() => {
    if (!open || !active) return;
    const item = document.getElementById(`${id}-option-${options.findIndex(option => option.id === active.id)}`);
    const list = item?.parentElement;
    if (!item || !list) return;
    if (item.offsetTop < list.scrollTop) list.scrollTop = item.offsetTop;
    else if (item.offsetTop + item.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = item.offsetTop + item.offsetHeight - list.clientHeight;
  }, [open, active?.id, id, options]);

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (isDisabled()) return;
    if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); close(); }
    else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const index = enabled.findIndex(option => option.id === active?.id);
      const next = !open ? (event.key === 'ArrowDown' ? 0 : enabled.length - 1) : (index + (event.key === 'ArrowDown' ? 1 : -1) + enabled.length) % enabled.length;
      setActiveId(enabled[next]?.id || null); show();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (open && active) toggle(active); else show();
    } else if (event.key === 'Tab') close();
  }

  return <div className="cms-multiselect" ref={root} data-open={open || undefined} data-disabled={disabled || undefined} onKeyDown={event => { if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); close(); } }} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) close(); }}>
    <div className="cms-multiselect-label"><label htmlFor={`${id}-input`}>{label}</label><span aria-live="polite">{value.length ? `${value.length} geselecteerd` : required ? 'Verplicht' : 'Optioneel'}</span></div>
    <div className="cms-multiselect-anchor" ref={control}>
      <div className="cms-multiselect-control" data-open={open || undefined} onClick={() => input.current?.focus()}>
        <div className="cms-multiselect-values">
          {selected.map(option => <span className="cms-multiselect-tag" key={option.id}><span title={option.name}>{option.name}</span><button type="button" disabled={disabled || option.disabled} aria-label={`${option.name} verwijderen uit ${label}`} onClick={event => { event.stopPropagation(); if (!isDisabled()) { onChange(value.filter(id => id !== option.id)); input.current?.focus(); } }}><X size={12}/></button></span>)}
          <div className="cms-multiselect-search"><Search size={14} aria-hidden="true"/><input id={`${id}-input`} ref={input} role="combobox" aria-expanded={open} aria-controls={open ? `${id}-list` : undefined} aria-autocomplete="list" aria-activedescendant={open && active ? `${id}-option-${options.findIndex(option => option.id === active.id)}` : undefined} aria-describedby={hint ? `${id}-hint` : undefined} aria-required={required || undefined} autoComplete="off" spellCheck={false} disabled={disabled} value={query} placeholder={value.length ? multiple ? 'Meer toevoegen…' : 'Andere keuze…' : placeholder} onFocus={show} onChange={event => { setQuery(event.target.value); setActiveId(null); show(); }} onKeyDown={onKeyDown}/></div>
        </div>
        <button type="button" className="cms-multiselect-toggle" disabled={disabled} aria-label={`${open ? 'Sluit' : 'Open'} keuzes voor ${label}`} aria-expanded={open} onMouseDown={event => event.preventDefault()} onClick={event => { event.stopPropagation(); if (open) close(); else { input.current?.focus(); show(); } }}><ChevronDown size={16}/></button>
      </div>
      {open && !disabled && <div className={`cms-multiselect-menu${placement.above ? ' above' : ''}`} style={{ maxHeight: placement.height }}>
        <div id={`${id}-list`} role="listbox" aria-label={label} aria-multiselectable={multiple} className="cms-multiselect-list">
          {results.map(option => <div id={`${id}-option-${options.findIndex(item => item.id === option.id)}`} key={option.id} role="option" aria-selected={value.includes(option.id)} aria-disabled={option.disabled || undefined} data-active={active?.id === option.id || undefined} onMouseEnter={() => { if (!option.disabled) setActiveId(option.id); }} onMouseDown={event => event.preventDefault()} onClick={() => toggle(option)} className="cms-multiselect-option"><span className="cms-multiselect-check">{value.includes(option.id) && <Check size={13}/>}</span><span className="cms-multiselect-option-copy"><span>{option.name}</span>{option.description && <small>{option.description}</small>}</span>{option.disabled && <small>Niet beschikbaar</small>}</div>)}
        </div>
        {!results.length && <div className="cms-multiselect-empty" role="status"><Search size={18}/><span>{options.length ? 'Geen resultaten gevonden.' : 'Nog geen keuzes beschikbaar.'}</span>{query && <small>Probeer een andere zoekterm.</small>}</div>}
      </div>}
    </div>
    {hint && <small className="cms-multiselect-hint" id={`${id}-hint`}>{hint}</small>}
  </div>;
}
