import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'tests/e2e',workers:1,timeout:45000,use:{baseURL:process.env.APP_BASE_URL||'http://127.0.0.1:62500',headless:true,trace:'retain-on-failure'},reporter:[['list'],['json',{outputFile:'.runtime/e2e-report.json'}]]});
