import {test,after} from 'node:test';
import postgres from 'postgres';
import {assertLocalSupabaseTests} from '../helpers/supabase-auth';
import {verifyMatchDossierRepository} from '../helpers/match-dossier-repository';
import {closeDb} from '../../db';
assertLocalSupabaseTests();const sql=postgres(process.env.MIGRATION_DATABASE_URL!,{max:3,prepare:false});
test('shared match dossier uses canonical PostgreSQL sources, private trainer caches and independent CMS publications',async()=>{await verifyMatchDossierRepository(sql);});
after(async()=>{await closeDb();await sql.end({timeout:2});});
