import {test,expect} from '@playwright/test';
import {assertLocalSupabaseTests,authCookies,loginEmail} from '../helpers/supabase-auth';
import {loginWithEmailCode} from './login-fixture';
import {sqlClient,closeDb} from '../../db';
import {getAuth} from '../../lib/server/auth';
import {workspaceRead} from '../../lib/server/sponsor-workspace';
import {workspaceCommands} from '../../lib/server/sponsor-commands';
import {directoryPersonTemplate,directoryProfileTemplate} from '../../lib/cms/directory';

assertLocalSupabaseTests();
const sql=sqlClient(),personId=crypto.randomUUID(),name='ZZZ Fictieve clubvoorzitter '+crypto.randomUUID();
let account:{id:string;email:string;name:string};
test.beforeAll(async()=>{
 account=(await getAuth().api.createUser({body:{email:'chair-browser-'+crypto.randomUUID()+'@example.invalid',name,password:crypto.randomUUID()+crypto.randomUUID(),role:'admin'}})).user;
 await sql`insert into cms_memberships(user_id,role_id) values (${account.id},'admin')`;
 const cookie=authCookies(await loginEmail(account.email));
 const request=(path:string)=>new Request(new URL(path,process.env.APP_BASE_URL),{headers:{cookie,origin:new URL(process.env.APP_BASE_URL!).origin}});
 async function commands(changes:{name:string;args:unknown[]}[],selected=false){
  const snapshot=await workspaceRead(request('/api/cms/sponsor-workspace?mode=directory'+(selected?'&personId='+personId:'')));
  const body={operationId:crypto.randomUUID(),mode:'directory',companyId:'',versions:snapshot.versions,commands:changes.map((change,offset)=>({...change,offset}))};
  return workspaceCommands(request('/api/cms/sponsor-workspace'),body);
 }
 const people=Array.from({length:30},(_,index)=>({id:crypto.randomUUID(),name:'AAA pagineringspersoon '+index}));
 people.push({id:personId,name});
 await commands(people.map(person=>({name:'saveDirectoryPerson',args:[{person:{...directoryPersonTemplate(person.id),name:person.name,email:person.id===personId?account.email:''},profile:directoryProfileTemplate(person.id)}]})));
 await commands([{name:'bindDirectoryAccount',args:[personId,account.id]}],true);
});
test.afterAll(closeDb);

test('account club functions open the canonical off-page dossier and save without replacing the administrator role',async({page})=>{
 test.setTimeout(120000);
 await loginWithEmailCode(page,account.email);
 const initial=await page.request.get('/api/cms/sponsor-workspace?mode=directory&page=1&pageSize=25').then(response=>response.json());
 expect(initial.listing.listingIds).not.toContain(personId);
 const before=(await sql`select role_id,active,version from cms_memberships where user_id=${account.id}`)[0];
 const accessWrites:string[]=[];
 page.on('request',request=>{if(request.method()==='PATCH'&&new URL(request.url()).pathname==='/api/cms/users/'+account.id)accessWrites.push(request.url());});

 await page.goto('/beheer#rollen');
 await page.getByRole('button').filter({has:page.getByText(name,{exact:true})}).click();
 await expect(page.getByLabel(/^Toegangsrol/)).toHaveValue('admin');
 const link=page.getByRole('link',{name:'Clubfuncties beheren',exact:true});
 await expect(link).toHaveAttribute('href',`/beheer?persoon=${personId}&dossier=functions#register`);
 expect(personId).not.toBe('person-account-'+account.id);
 await page.screenshot({path:test.info().outputPath('account-card.png'),fullPage:true});
 await link.click();
 const dossier=page.getByRole('dialog',{name,exact:true});
 await expect(dossier).toBeVisible();
 await expect(dossier.getByRole('button',{name:'Functies',exact:true})).toHaveAttribute('aria-selected','true');
 await dossier.getByRole('button',{name:'Functie toevoegen',exact:true}).click();
 const editor=page.getByRole('dialog',{name:'Een clubfunctie vastleggen',exact:true});
 await editor.getByLabel(/^Functietype/).selectOption('board');
 await editor.getByLabel('Functienaam *',{exact:true}).fill('Voorzitter');
 await page.screenshot({path:test.info().outputPath('club-function-form.png')});
 await editor.getByRole('button',{name:'Functie opslaan',exact:true}).click();
 await expect(editor).toHaveCount(0);
 await expect(dossier.getByRole('button',{name:'Functies',exact:true})).toHaveAttribute('aria-selected','true');
 await expect(dossier.getByText('Voorzitter',{exact:true})).toBeVisible();
 await expect.poll(async()=>await sql`select data->>'name' as name from cms_directory_assignments where person_id=${personId}`).toEqual([{name:'Voorzitter'}]);
 expect((await sql`select role_id,active,version from cms_memberships where user_id=${account.id}`)[0]).toEqual(before);
 expect(accessWrites).toEqual([]);

 await dossier.getByRole('button',{name:'Gegevens',exact:true}).click();
 const refreshed=page.waitForResponse(response=>response.url().includes('/api/cms/sponsor-workspace?')&&response.request().method()==='GET');
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await refreshed;
 await expect(dossier.getByRole('button',{name:'Gegevens',exact:true})).toHaveAttribute('aria-selected','true');
 await expect(dossier.getByLabel('Volledige naam *',{exact:true})).toHaveValue(name);

 await page.reload();
 await expect(page.getByRole('dialog',{name,exact:true}).getByText('Voorzitter',{exact:true})).toBeVisible();
 await expect(page.getByRole('dialog',{name,exact:true}).getByRole('button',{name:'Functies',exact:true})).toHaveAttribute('aria-selected','true');
 await page.goto('/beheer?persoon=unknown-'+crypto.randomUUID()+'&dossier=functions#register');
 await expect(page.locator('.dd-breadcrumb>b')).toHaveText('Personen & gebruikers');
 await expect(page.getByText('Dit dossier is niet beschikbaar.',{exact:true})).toBeVisible();
 await expect(page.getByRole('dialog')).toHaveCount(0);
});
