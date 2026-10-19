const WEEK = 7 * 24 * 60 * 60 * 1000;
type FeaturedContent = {featured?:boolean;featuredUntil?:string;publishedAt?:string};

export function defaultFeaturedUntil(from:number|string=Date.now()) {
  return new Date((typeof from==='string'?Date.parse(from):from)+WEEK).toISOString();
}

export function featuredExpiry(article:FeaturedContent):number {
  if(article.featuredUntil)return Date.parse(article.featuredUntil);
  const published=Date.parse(article.publishedAt||'');
  return Number.isFinite(published)?published+WEEK:0;
}

export function isFeatured(article:FeaturedContent,now=Date.now()):boolean {
  return !!article.featured&&featuredExpiry(article)>now;
}
