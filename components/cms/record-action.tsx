import type { ButtonHTMLAttributes } from 'react';
import { Pencil, Trash2 } from 'lucide-react';

type RecordActionProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  action: 'edit' | 'delete';
  label: string;
};

export function RecordAction({ action, label, className = '', ...props }: RecordActionProps) {
  const Icon = action === 'delete' ? Trash2 : Pencil;
  return <button {...props} type="button" className={`cms-icon-button cms-record-action${action === 'delete' ? ' is-destructive' : ''}${className ? ` ${className}` : ''}`} title={props.title || label} aria-label={label}><Icon size={15} aria-hidden="true"/></button>;
}
