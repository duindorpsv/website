import type {CmsState} from '../cms/types';
import {defaultSponsors} from '../cms/site-sponsors';
export async function approvedSponsorProfiles(tx:any):Promise<{id:string;name:string;description:string;website:string;logoUrl:string}[]>{
 const rows=await tx`select id,data->'publicProfile' as profile from cms_sponsor_companies where data->>'publicEnabled'='true' and (coalesce(data->>'publicFrom','')='' or (data->>'publicFrom')::date<=current_date) and (coalesce(data->>'publicUntil','')='' or (data->>'publicUntil')::date>=current_date) order by lower(data#>>'{publicProfile,name}'),id`;
 const valid=(value:string)=>!value||/^(https?:\/\/|\/(?!\/))[^\s<>"\\]*$/i.test(value);
 return rows.flatMap((r:any)=>{const profile=r.profile;if(!profile?.name?.trim()||!valid(profile.website)||!valid(profile.logoUrl))return[];return [{id:r.id,name:String(profile.name),description:String(profile.description||''),website:String(profile.website||''),logoUrl:String(profile.logoUrl||'')}];});
}
export async function projectPublicSponsors(tx:any,state:CmsState){
 const profiles=await approvedSponsorProfiles(tx);state.publicSponsors=profiles;state.publicSponsorCatalog=await publicSponsorCatalog(tx);
 const logos=profiles.filter(p=>p.logoUrl).map(p=>({name:p.name,src:p.logoUrl,url:p.website,width:240,height:120}));
 const legacy=state.settings.sponsors||defaultSponsors;
 state.settings.sponsors=[...legacy.filter(s=>!logos.some(p=>p.name.toLowerCase()===s.name.toLowerCase())),...logos];
}
export async function publicSponsorCatalog(tx:any){
 const rows=await tx`select id,kind,data from cms_sponsor_records where kind in ('packages','items') and data->>'active'='true' order by data->>'name',id`;
 const items=rows.filter((r:any)=>r.kind==='items').map((r:any)=>({id:r.id,name:String(r.data.name)}));
 const available=new Set(items.map((i:any)=>i.id));
 const packages=rows.filter((r:any)=>r.kind==='packages'&&r.data.itemIds.every((id:string)=>available.has(id))).map((r:any)=>({id:r.id,name:String(r.data.name),description:String(r.data.description),itemIds:r.data.itemIds as string[],priceCents:Number(r.data.priceCents)}));
 return {items,packages};
}
