const hour=3600000;
/** Calendar dates are part of the SQL revision key. The remaining database
 * time boundary is a pinned article expiring and making room for another pin. */
export function publicContentLifetime(articles:{live?:{featured?:boolean;featuredUntil?:string;publishedAt?:string}}[],now:number){
 let expires=now+6*hour;
 for(const article of articles){
  const live=article.live;if(!live?.featured)continue;
  const deadline=live.featuredUntil?Date.parse(live.featuredUntil):Date.parse(live.publishedAt||'')+168*hour;
  if(Number.isFinite(deadline)&&deadline>now)expires=Math.min(expires,deadline);
 }
 return Math.max(1,expires-now);
}
