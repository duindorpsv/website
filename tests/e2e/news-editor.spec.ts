import {test} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {loginWithEmailCode} from './login-fixture';
import {publishNewsImmediately,preserveTypingDuringSave,resolveNewsConflict,heroNewsExpiresAndExtends} from '../helpers/news-editor-browser';
const owner=JSON.parse(readFileSync('.runtime/e2e-account.json','utf8'));

test('NEWS06: publish immediately without a schedule, keep publication after debounce, extend highlight date',async({page})=>{
  await loginWithEmailCode(page,owner.email);await publishNewsImmediately(page);
});
test('NEWS07: typing during an in-flight autosave remains in the editor and database',async({page})=>{
  await loginWithEmailCode(page,owner.email);await preserveTypingDuringSave(page);
});
test('NEWS08: a real concurrent edit offers comparison and an explicit choice without losing input',async({page})=>{
  await loginWithEmailCode(page,owner.email);await resolveNewsConflict(page);
});
test('NEWS10: hero highlighting expires on an open page and an adjusted end date restores priority',async({page})=>{
  await loginWithEmailCode(page,owner.email);await heroNewsExpiresAndExtends(page);
});
