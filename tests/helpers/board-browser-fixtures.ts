import {getAuth} from '../../lib/server/auth';
import {sqlClient} from '../../db';
import {assertLocalSupabaseTests} from './supabase-auth';
import {createBoardTestFixture} from './board-fixture';
import type {BoardActor,BoardState} from '../../lib/cms/board';

export async function createBoardBrowserFixture(){
 assertLocalSupabaseTests();
 const sql=sqlClient(),fixture=createBoardTestFixture(),suffix=crypto.randomUUID();
 const accounts={} as Record<'chair'|'secretary'|'member'|'committee'|'otherCommittee'|'outsider',{id:string;personId:string;email:string;name:string}>;
 const names={chair:'Mara',secretary:'Iris',member:'Joris',committee:'Liv',otherCommittee:'Andere commissie',outsider:'Geen bestuursrecht'};
 for(const role of Object.keys(names) as (keyof typeof names)[]){
  const email='board-'+role.toLowerCase()+'-'+suffix+'@example.invalid',name=names[role];
  const {user}=await getAuth().api.createUser({body:{email,name,password:crypto.randomUUID()+crypto.randomUUID()}});
  const roleId=role==='outsider'?'editor':role==='otherCommittee'?'board-committee':'board-'+role;
  await sql`insert into cms_memberships(user_id,role_id) values (${user.id},${roleId})`;
  const [person]=await sql`select person_id from cms_person_accounts where user_id=${user.id}`;
  accounts[role]={...user,personId:String(person.person_id)};
 }
 const committeeId='board-browser-committee-'+suffix,otherCommitteeId='board-browser-other-'+suffix;
 const committee={id:committeeId,name:'Activiteiten & ontmoeting',description:'Geïsoleerde bestuursfixture',color:'#0755a7',active:true,published:false,members:[{personId:accounts.member.personId,role:'Portefeuillehouder'},{personId:accounts.committee.personId,role:'Lid'}]};
 const otherCommittee={...committee,id:otherCommitteeId,name:'Afgeschermde andere commissie',members:[{personId:accounts.otherCommittee.personId,role:'Lid'}]};
 for(const row of [committee,otherCommittee])await sql`insert into cms_records(id,module,title,draft,status) values (${row.id},'committees',${row.name},${sql.json(row)},'draft')`;
 const replacements=new Map<string,string>([[fixture.committees[0].id,committeeId]]);
 for(const role of ['chair','secretary','member','committee'] as const){replacements.set(fixture.actors[role].id,accounts[role].personId);replacements.set(fixture.actors[role].userId,accounts[role].id);}
 function replace(value:any):any{
  if(typeof value==='string')return replacements.get(value)||value;
  if(Array.isArray(value))return value.map(replace);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[replacements.get(key)||key,replace(item)]));
  return value;
 }
 const board=replace(fixture.board) as BoardState;
 const actors=replace(fixture.actors) as Record<'chair'|'secretary'|'member'|'committee',BoardActor>;
 async function reset(next:BoardState=board){
  assertLocalSupabaseTests();
  await sql`update cms_board_state set data=${sql.json(next as any)},version=version+1,updated_by=${accounts.secretary.id},updated_at=now() where id='club'`;
  await sql`delete from cms_board_private_notes where user_id in ${sql(Object.values(accounts).map(account=>account.id))}`;
 }
 return {board,actors,accounts,committeeId,otherCommitteeId,reset};
}
