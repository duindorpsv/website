import {test,expect} from '@playwright/test';
import postgres from 'postgres';
import {assertLocalSupabaseTests} from '../helpers/supabase-auth';
import {verifySportlinkTeamRefresh} from '../helpers/sportlink-team-refresh';

test('real image serves populated cached team results with valid PostgreSQL source dates',async({request})=>{
 assertLocalSupabaseTests();
 const sql=postgres(process.env.MIGRATION_DATABASE_URL!,{max:1,prepare:false});
 try {
  await verifySportlinkTeamRefresh(sql,'cached',async teamId=>{
   const response=await request.get('/api/sportlink/team?'+new URLSearchParams({team:teamId}));
   expect(response.status()).toBe(200);
   const detail=await response.json();
   expect(detail.results.length).toBeGreaterThan(0);
   expect(Number.isFinite(Date.parse(detail.updatedAt))).toBe(true);
   for(const stamp of Object.values(detail.matchUpdatedAt))expect(Number.isFinite(Date.parse(String(stamp)))).toBe(true);
   await response.dispose();
  });
 } finally {await sql.end({timeout:2});}
});
