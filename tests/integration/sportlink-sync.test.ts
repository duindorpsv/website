import {test,after} from 'node:test';
import postgres from 'postgres';
import {assertLocalSupabaseTests} from '../helpers/supabase-auth';
import {verifySportlinkRepository} from '../helpers/sportlink-repository';
import {closeDb} from '../../db';
assertLocalSupabaseTests();const sql=postgres(process.env.MIGRATION_DATABASE_URL!,{max:2,prepare:false});
test('Sportlink scheduling, cache, source mapping and import use actual repository transactions',async()=>{await verifySportlinkRepository(sql);});
after(async()=>{await closeDb();await sql.end({timeout:2});});
