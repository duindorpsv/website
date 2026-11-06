import type {Permission} from './types';

export type DonorAction='read'|'manage'|'invoice'|'settings';
type Grant={module:string;action:string};

/** Donor administration is global and each write ability requires explicit view access. */
export function donorGrant(grants:readonly Grant[],teamScoped:boolean,action:DonorAction='read'){
 const permits=(wanted:string)=>grants.some(g=>(g.module==='*'||g.module==='donors')&&(g.action==='*'||g.action===wanted));
 return !teamScoped&&permits('read')&&(action==='read'||permits(action));
}

export function donorPermissions(grants:readonly Grant[],teamScoped=false):Permission[]{
 if(!donorGrant(grants,teamScoped))return [];
 return ['donors',...(['manage','invoice','settings'] as const).filter(action=>donorGrant(grants,teamScoped,action)).map(action=>'donors-'+action)] as Permission[];
}
