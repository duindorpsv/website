import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaultFeaturedUntil,isFeatured} from '../../lib/cms/featured';
import {heroClubArticles,sortedClubArticles} from '../../lib/clubmuur-articles';
import {cmsArticlesForSite} from '../../lib/cms/public-adapters';
import {createCmsSeed} from '../../lib/cms/seed';
import {articleContent,publishArticle} from '../../lib/cms/model';
import {validateCandidate} from '../../lib/server/records';
import type {Article} from '../../lib/club-data';

const now=Date.parse('2026-10-19T12:00:00Z');
const article=(id:string,publishedAt:string,extra:Partial<Article>={}):Article=>({id,publishedAt,date:'19 oktober 2026',title:id,category:'Club',intro:'',image:'',minutes:1,body:[],...extra});

test('news highlighting expires exactly seven days later, including legacy content',()=>{
  const publishedAt='2026-10-12T12:00:00Z';
  assert.equal(defaultFeaturedUntil(publishedAt),'2026-10-19T12:00:00.000Z');
  assert.equal(isFeatured({featured:true,publishedAt},now-1),true);
  assert.equal(isFeatured({featured:true,publishedAt},now),false);
  assert.equal(isFeatured({featured:true,publishedAt:'not-a-date'},now),false);
});

test('an explicit end date overrides the default; a disabled flag never pins news',()=>{
  const content={publishedAt:'2020-01-01T00:00:00Z',featured:true,featuredUntil:'2026-11-01T00:00:00Z'};
  assert.equal(isFeatured(content,now),true);
  assert.equal(isFeatured({...content,featured:false},now),false);
  assert.equal(isFeatured({...content,featuredUntil:'2026-10-18T00:00:00Z'},now),false);
});

test('hero pins active highlights, fills with newest news and returns expired news to chronology',()=>{
  const items=[article('older','2026-10-10T00:00:00Z'),article('newest','2026-10-19T10:00:00Z'),article('pinned','2026-10-01T00:00:00Z',{featured:true,featuredUntil:'2026-10-20T12:00:00Z'}),article('second','2026-10-19T09:00:00Z')];
  assert.deepEqual(heroClubArticles(items,now).map(a=>a.id),['pinned','newest','second','older']);
  assert.deepEqual(heroClubArticles(items,Date.parse('2026-10-20T12:00:00Z')).map(a=>a.id),['newest','second','older','pinned']);
  assert.equal(items[0].id,'older');
  assert.deepEqual(sortedClubArticles(items).slice(0,2).map(a=>a.id),['newest','second']);
});

test('hero source includes all live news, excludes stories, drafts and trash, and preserves exact timestamps',()=>{
  const state=createCmsSeed(),source=state.articles.find(a=>a.live?.contentType==='news')!;
  const news={...structuredClone(source),id:'newest',featured:false,featuredUntil:'',publishedAt:'2026-10-19T12:01:00Z'};
  news.live=articleContent(news);
  state.articles=[news,{...structuredClone(news),id:'draft',live:undefined},{...structuredClone(news),id:'trash',deletedAt:'2026-10-19T00:00:00Z'},{...structuredClone(news),id:'story',live:{...news.live,contentType:'story'}}];
  state.settings.homepageArticleIds=[];
  const items=cmsArticlesForSite(state);
  assert.deepEqual(items.map(a=>a.id),['newest']);
  assert.equal(items[0].publishedAt,news.publishedAt);
});

test('publishing immediately normalizes future dates and preserves a custom highlight deadline',()=>{
  const state=createCmsSeed(),source=state.articles.find(a=>a.live?.contentType==='news')!;
  source.live=undefined;source.publishedAt='2099-01-01T00:00:00Z';source.featured=true;source.featuredUntil='2099-02-01T00:00:00Z';
  assert.deepEqual(publishArticle(state,source.id),[]);
  assert.ok(Date.parse(source.live!.publishedAt)<=Date.now());
  assert.equal(source.live!.featuredUntil,'2099-02-01T00:00:00Z');
});

test('valid news dates are stored canonically for server chronology and expiry queries',()=>{
  const article=createCmsSeed().articles.find(a=>a.contentType==='news')!;
  const result=validateCandidate('articles',{...article,publishedAt:'2026-10-19',featuredUntil:'2026-11-01'});
  assert.equal(result.publishedAt,'2026-10-19T00:00:00.000Z');
  assert.equal(result.featuredUntil,'2026-11-01T00:00:00.000Z');
});
