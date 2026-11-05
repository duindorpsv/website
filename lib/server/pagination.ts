import {CmsError} from './errors';

/** Bounded SQL pagination shared by authenticated list endpoints. */
export function listPagination(url:URL){
 const limit=Number(url.searchParams.get('limit')||25),offset=Number(url.searchParams.get('offset')||0);
 if(!Number.isSafeInteger(limit)||!Number.isSafeInteger(offset)||limit<1||limit>100||offset<0||offset>1_000_000)throw new CmsError('pagination','Gebruik geldige paginagrenzen.',422);
 return {limit,offset};
}
