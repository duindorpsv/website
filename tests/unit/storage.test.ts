import assert from 'node:assert/strict';
import {afterEach,beforeEach,test} from 'node:test';
import {S3Client,HeadBucketCommand,GetBucketAclCommand,GetBucketPolicyCommand} from '@aws-sdk/client-s3';
import {storageReady} from '../../lib/server/storage';

const settings={TEST_MAIL_API_URL:'',APP_ENV:'production',APP_BASE_URL:'https://club.example.org',DATABASE_URL:'postgres://synthetic@localhost/unused',DATABASE_CA_CERT_B64:'synthetic-ca',SUPABASE_URL:'https://abcdefghijklmnopqrst.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_synthetic',SUPABASE_SECRET_KEY:'sb_secret_synthetic',MEDIA_DRIVER:'s3',S3_ENDPOINT:'https://fsn1.your-objectstorage.com',S3_REGION:'fsn1',S3_BUCKET:'synthetic-private',S3_ACCESS_KEY_ID:'synthetic',S3_SECRET_ACCESS_KEY:'synthetic',RESEND_API_KEY:'synthetic',MAIL_FROM:'club@example.org',TEST_MAIL_TO:''};
const privateAcl={Grants:[{Grantee:{Type:'CanonicalUser',ID:'synthetic-owner'},Permission:'FULL_CONTROL'}]};
let previous:Record<string,string|undefined>;
beforeEach(()=>{previous=Object.fromEntries(Object.keys(settings).map(key=>[key,process.env[key]]));Object.assign(process.env,settings);});
afterEach(()=>{for(const [key,value] of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value;}});

test('Hetzner readiness accepts a private bucket without a policy and never calls Supabase Storage',async t=>{
 t.mock.method(globalThis,'fetch',async()=>{throw new Error('Unexpected Supabase request');});
 t.mock.method(S3Client.prototype,'send',(async(command:any)=>{
  assert.equal(command.input.Bucket,settings.S3_BUCKET);
  if(command instanceof HeadBucketCommand)return {};
  if(command instanceof GetBucketAclCommand)return privateAcl;
  assert.ok(command instanceof GetBucketPolicyCommand);
  throw Object.assign(new Error('No policy'),{name:'NoSuchBucketPolicy'});
 }) as any);
 await storageReady();
});

test('Hetzner readiness permits policies restricted to authenticated principals',async t=>{
 t.mock.method(S3Client.prototype,'send',(async(command:any)=>command instanceof GetBucketAclCommand?privateAcl:command instanceof GetBucketPolicyCommand?{Policy:JSON.stringify({Statement:{Effect:'Allow',Principal:{AWS:'arn:aws:iam::123456789012:user/cms'},Action:'s3:GetObject',Resource:'arn:aws:s3:::synthetic-private/*'}})}:{}) as any);
 await storageReady();
});

test('Hetzner readiness rejects public and authenticated-user group ACLs even when HeadBucket succeeds',async t=>{
 let acl:any;
 t.mock.method(S3Client.prototype,'send',(async(command:any)=>command instanceof GetBucketAclCommand?acl:{}) as any);
 for(const Grants of [[],[{Grantee:{Type:'Group',URI:'http://acs.amazonaws.com/groups/global/AllUsers'}}],[{Grantee:{Type:'Group',URI:'http://acs.amazonaws.com/groups/global/AuthenticatedUsers'}}],[{Grantee:{Type:'CanonicalUser'}}]]){
  acl={Grants};await assert.rejects(storageReady(),/privébucket zonder publieke ACL/);
 }
});

test('Hetzner readiness rejects wildcard policies, malformed policies and NotPrincipal grants',async t=>{
 let Policy:string;
 t.mock.method(S3Client.prototype,'send',(async(command:any)=>command instanceof GetBucketAclCommand?privateAcl:command instanceof GetBucketPolicyCommand?{Policy}:{}) as any);
 for(const rule of [{Effect:'Allow',Principal:'*'},{Effect:'Allow',Principal:{AWS:'*'}},{Effect:'Allow',Principal:{AWS:['arn:aws:iam::123456789012:user/cms','*']}},{Effect:'Allow',NotPrincipal:{AWS:'arn:aws:iam::123456789012:user/cms'}},{Effect:'Unknown',Principal:'*'}]){
  Policy=JSON.stringify({Statement:[rule]});await assert.rejects(storageReady(),/privébucket zonder publieke policy/);
 }
 for(Policy of ['invalid','{}','null'])await assert.rejects(storageReady());
});

test('Hetzner policy permission and transport failures keep readiness closed',async t=>{
 let name:string;
 t.mock.method(S3Client.prototype,'send',(async(command:any)=>{
  if(command instanceof GetBucketAclCommand)return privateAcl;
  if(command instanceof GetBucketPolicyCommand)throw Object.assign(new Error('Provider failure'),{name});
  return {};
 }) as any);
 for(name of ['AccessDenied','NoSuchBucket','TimeoutError'])await assert.rejects(storageReady(),error=>(error as Error).name===name);
});
