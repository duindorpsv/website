import type {SportlinkSide} from './sportlink-types';

/** Resolve from the source club code, including snapshots with an obsolete logo URL. */
export function clubLogoUrl(team:Pick<SportlinkSide,'clubCode'|'own'>):string|null {
 if(team.own)return '/assets/logo.png';
 const code=team.clubCode.trim().toUpperCase();
 if(!/^[A-Z0-9]{1,20}$/.test(code))return null;
 // Sportlink documents this KNVB image source; logoapi.voetbal.nl returns HTTP 403.
 return `https://sassets.knvb.nl/sites/voetbal.nl/files/knvblogos_width60/${code}.png`;
}
