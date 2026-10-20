import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parsePeopleCsv} from '../../lib/cms/people-csv';
test('people CSV preserves stable source IDs, accents and quoted data without account creation fields',()=>{
 const rows=parsePeopleCsv('\uFEFFbronId;naam;email;telefoon;functie\r\n"AB123";"Émile; van Duin";emile@example.invalid;0612345678;"Trainer ""jeugd"""\r\nCD456;Naamgenoot;;;');
 assert.deepEqual(rows,[{id:'AB123',name:'Émile; van Duin',email:'emile@example.invalid',phone:'0612345678',role:'Trainer "jeugd"'},{id:'CD456',name:'Naamgenoot',email:'',phone:'',role:''}]);
});
test('people CSV requires reviewed identifiers and rejects duplicates, examples and broken files',()=>{
 for(const input of ['naam,email\nJan,jan@example.invalid','bronId,naam\n,Jan','bronId,naam\nDEMO-SL-1,Jan','bronId,naam\nab1,Jan\nAB1,Ander','bronId,naam\n123,"Jan','bronId,naam,email\n123,Jan,ongeldig'])assert.throws(()=>parsePeopleCsv(input));
 assert.throws(()=>parsePeopleCsv('bronId,naam\n'+Array.from({length:2001},(_,index)=>index+',Jan').join('\n')),/2.000/);
 assert.throws(()=>parsePeopleCsv('a'.repeat(5_000_001)),/5 MB/);
 assert.equal(parsePeopleCsv('bronId,naam\n123,Jan\n456,Jan').length,2,'Names alone must never deduplicate people');
});
