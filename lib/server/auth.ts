import { betterAuth } from 'better-auth';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { admin, twoFactor } from 'better-auth/plugins';
import { getDb, sqlClient } from '../../db/index';
import * as schema from '../../db/schema';
import { env } from './env';
function createAuth() {
    const config = env();
    return betterAuth({ rateLimit:{enabled:config.APP_ENV==='production'}, database: drizzleAdapter(getDb(), { provider: 'pg', schema }), baseURL: config.APP_BASE_URL, secret: config.AUTH_SESSION_SECRET, trustedOrigins: [new URL(config.APP_BASE_URL).origin], emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 12, revokeSessionsOnPasswordReset: true, sendResetPassword: async ({ user, url }) => { await sqlClient() `insert into cms_jobs (id,operation_id,kind,payload) values (${crypto.randomUUID()},${'reset-' + crypto.randomUUID()},'mail',${sqlClient().json({ to: [user.email], subject: 'Duindorp SV — account activeren of herstellen', text: `Stel je wachtwoord in via ${url}` })})`; } }, session: { expiresIn: 60 * 60 * 12, updateAge: 60 * 30, cookieCache: { enabled: false } }, advanced: { useSecureCookies: config.APP_BASE_URL.startsWith('https://') }, plugins: [admin(), twoFactor({ issuer: 'Duindorp SV' })] });
}
let instance: ReturnType<typeof createAuth> | undefined;
export function getAuth() { return instance ??= createAuth(); }
