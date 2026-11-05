import assert from 'node:assert/strict';
import {afterEach,beforeEach,test} from 'node:test';
import {databaseOptions} from '../../lib/server/database-config';

let previous:Record<string,string|undefined>;
beforeEach(()=>{previous={APP_ENV:process.env.APP_ENV,DATABASE_CA_CERT_B64:process.env.DATABASE_CA_CERT_B64};});
afterEach(()=>{for(const [key,value] of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value;}});

test('hosted databases require their configured CA and verify the server certificate',()=>{
 for(const mode of ['production','staging']){
  process.env.APP_ENV=mode;delete process.env.DATABASE_CA_CERT_B64;
  assert.throws(()=>databaseOptions(4),/DATABASE_CA_CERT_B64/);
  process.env.DATABASE_CA_CERT_B64=Buffer.from('synthetic CA certificate').toString('base64');
  const options=databaseOptions(4);assert.equal(options.max,4);
  assert.deepEqual(options.ssl,{ca:'synthetic CA certificate',rejectUnauthorized:true});
 }
});

test('local development and isolated tests can use the existing local database transport',()=>{
 delete process.env.DATABASE_CA_CERT_B64;
 for(const mode of ['development','test']){process.env.APP_ENV=mode;assert.equal('ssl' in databaseOptions(2),false);}
});
