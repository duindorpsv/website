import type {CmsArticle,CmsDoc,CmsState} from './types';
import {docText} from './model';
import {referencesIn} from './layout/document';

// Some old exports contain the article text only in their lead. Retain that
// original text and every existing image instead of inventing replacement copy.
export function importedNewsContent<T extends {intro:string;body:CmsDoc}>(article:T):T {
  if(docText(article.body).trim()||!article.intro.trim())return article;
  return {...article,body:{...article.body,content:[{type:'paragraph',content:[{type:'text',text:article.intro}]},...article.body.content||[]]}};
}
export function newsPublicationCandidate(article:CmsArticle) {
  return article.imported?importedNewsContent(article):article;
}
// This is only client-side feedback. The server independently verifies the
// immutable import identity, associated assets, readiness and publication rights.
export function newsPublicationState(state:CmsState,article:CmsArticle):CmsState {
  if(!article.imported)return state;
  const ids=new Set(referencesIn(article));
  return {...state,media:state.media.map(media=>ids.has(media.id)?{...media,published:true}:media),documents:state.documents.map(document=>ids.has(document.id)?{...document,published:true}:document)};
}
