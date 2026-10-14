import type {ArticleContent,ContentType,StoryFormat} from './types';
export const contentTypeLabel:Record<ContentType,string>={news:'Nieuws',story:'Verhalen'};
export const storyFormatLabel:Record<StoryFormat,string>={column:'Column',interview:'Interview',story:'Clubverhaal'};
export {contentPath} from './model';
export function contentHref(article:Pick<ArticleContent,'contentType'|'slug'>){return `/clubmuur/${article.contentType==='story'?'verhalen':'nieuws'}/${encodeURIComponent(article.slug)}`;}
