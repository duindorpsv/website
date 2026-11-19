import type { ButtonHTMLAttributes } from 'react';
import { Eye, FileSignature, Mail, Pencil, Trash2 } from 'lucide-react';

const actionIcons = { edit: Pencil, delete: Trash2, email: Mail, agreement: FileSignature, view: Eye };

type RecordActionProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  action: keyof typeof actionIcons;
  label: string;
};

export function RecordAction({ action, label, className = '', ...props }: RecordActionProps) {
  const Icon = actionIcons[action];
  return <button {...props} type="button" className={`cms-icon-button cms-record-action${action === 'delete' ? ' is-destructive' : ''}${className ? ` ${className}` : ''}`} title={props.title || label} aria-label={label}><Icon size={15} aria-hidden="true"/></button>;
}
