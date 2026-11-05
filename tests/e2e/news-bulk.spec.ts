import {test} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {loginWithEmailCode} from './login-fixture';
import {publishNewsInBulk,bulkNewsConflict} from '../helpers/news-bulk-browser';
const owner=JSON.parse(readFileSync('.runtime/e2e-account.json','utf8'));

test('NEWS11: publish a selection, skip incomplete news and preserve unrelated drafts',async({page})=>{
  await loginWithEmailCode(page,owner.email);await publishNewsInBulk(page);
});
test('NEWS12: a concurrent edit stops the atomic group and requires a refresh before retry',async({page})=>{
  await loginWithEmailCode(page,owner.email);await bulkNewsConflict(page);
});
