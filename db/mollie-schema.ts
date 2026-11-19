import {pgTable,text,uuid,timestamp,uniqueIndex,check,boolean,jsonb,index} from 'drizzle-orm/pg-core';
import {sql} from 'drizzle-orm';
import {user} from './schema';
import {sponsorRecords} from './sponsor-schema';
export const molliePaymentAttempts=pgTable('cms_mollie_payment_attempts',{
 id:text('id').primaryKey(),operationId:uuid('operation_id').notNull().unique(),actorId:text('actor_id').notNull().references(()=>user.id),
 sourceKind:text('source_kind').notNull(),sourceId:text('source_id').notNull().references(()=>sponsorRecords.id),
 snapshotBytes:text('snapshot_bytes').notNull(),snapshotHash:text('snapshot_hash').notNull(),status:text('status').notNull().default('prepared'),
 providerId:text('provider_id').unique(),checkoutUrl:text('checkout_url'),errorCode:text('error_code'),
 settledAt:timestamp('settled_at',{withTimezone:true}),createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),updatedAt:timestamp('updated_at',{withTimezone:true}).notNull().defaultNow(),
},t=>[
 uniqueIndex('mollie_active_source_idx').on(t.sourceKind,t.sourceId,sql`(${t.snapshotBytes}::jsonb->>'mode')`).where(sql`${t.status} not in ('failed','canceled','expired')`),
 check('cms_mollie_payment_attempts_source_kind_check',sql`${t.sourceKind} in ('donors','sponsors')`),
 check('cms_mollie_payment_attempts_snapshot_hash_check',sql`${t.snapshotHash} ~ '^[a-f0-9]{64}$'`),
 check('cms_mollie_payment_attempts_status_check',sql`${t.status} in ('prepared','uncertain','open','pending','authorized','paid','failed','canceled','expired','review')`),
]).enableRLS();
// Only the backend can read authenticated ciphertext. Retired keys reconcile
// immutable attempts that were created before a key rotation.
export const mollieCredentials=pgTable('cms_mollie_credentials',{
 bindingId:text('binding_id').primaryKey(),mode:text('mode').notNull(),active:boolean('active').notNull().default(true),
 ciphertext:text('ciphertext').notNull(),iv:text('iv').notNull(),authTag:text('auth_tag').notNull(),binding:jsonb('binding').notNull(),keyPreview:text('key_preview').notNull(),
 createdBy:text('created_by').notNull().references(()=>user.id),createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),updatedAt:timestamp('updated_at',{withTimezone:true}).notNull().defaultNow(),
},t=>[
 uniqueIndex('mollie_current_credential_idx').on(t.mode).where(sql`${t.active}=true`),
 index('mollie_credential_actor_idx').on(t.createdBy),
 check('cms_mollie_credentials_mode_check',sql`${t.mode} in ('test','live')`),
 check('cms_mollie_credentials_binding_check',sql`${t.bindingId} ~ '^[a-f0-9]{64}$'`),
]).enableRLS();
