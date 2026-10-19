import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loginCodeMail,accountAccessMail} from '../../lib/server/auth-mail';
test('login mail uses the club identity, visible eight-digit code and a text alternative without a token link',()=>{
 const previous=process.env.APP_BASE_URL;process.env.APP_BASE_URL='https://club.example.org';
 try{
  const mail=loginCodeMail('synthetic@example.invalid','01234567');
  assert.ok(mail.html.includes('https://club.example.org/assets/logo.png'));assert.match(mail.html,/lang="nl"/);assert.match(mail.html,/01234567/);assert.match(mail.text,/Jouw inlogcode: 01234567/);assert.match(mail.text,/10 minuten/);assert.ok(!mail.subject.includes('01234567'));assert.ok(!mail.html.includes('token='));
  assert.throws(()=>loginCodeMail('synthetic@example.invalid','123456'));
 }finally{if(previous===undefined)delete process.env.APP_BASE_URL;else process.env.APP_BASE_URL=previous;}
});
test('account mail escapes values and sends users to the passwordless login page',()=>{
 const previous=process.env.APP_BASE_URL;process.env.APP_BASE_URL='https://club.example.org';
 try{const mail=accountAccessMail('<script>synthetic</script>');assert.ok(!mail.html.includes('<script>'));assert.ok(mail.html.includes('&lt;script&gt;'));assert.ok(mail.html.includes('https://club.example.org/beheer/login'));assert.match(mail.text,/geen wachtwoord/);}
 finally{if(previous===undefined)delete process.env.APP_BASE_URL;else process.env.APP_BASE_URL=previous;}
});
