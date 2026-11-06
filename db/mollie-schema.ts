import {pgTable,text,uuid,timestamp,uniqueIndex,check} from 'drizzle-orm/pg-core';
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
 uniqueIndex('mollie_active_source_idx').on(t.sourceKind,t.sourceId).where(sql`${t.status} not in ('failed','canceled','expired')`),
 check('cms_mollie_payment_attempts_source_kind_check',sql`${t.sourceKind} in ('donors','sponsors')`),
 check('cms_mollie_payment_attempts_snapshot_hash_check',sql`${t.snapshotHash} ~ '^[a-f0-9]{64}$'`),
 check('cms_mollie_payment_attempts_status_check',sql`${t.status} in ('prepared','uncertain','open','pending','authorized','paid','failed','canceled','expired','review')`),
]).enableRLS();
