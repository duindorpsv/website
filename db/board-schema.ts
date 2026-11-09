import {pgTable,text,integer,jsonb,timestamp,uuid,index,primaryKey,uniqueIndex} from 'drizzle-orm/pg-core';
import {user,records} from './schema';
const time=(name:string)=>timestamp(name,{withTimezone:true});

/** Shared governance state never contains personal notes. */
export const boardState=pgTable('cms_board_state',{
 id:text('id').primaryKey(),data:jsonb('data').notNull(),version:integer('version').notNull().default(0),
 updatedBy:text('updated_by').references(()=>user.id),updatedAt:time('updated_at').notNull().defaultNow(),
}).enableRLS();
export const boardOperations=pgTable('cms_board_operations',{
 actorId:text('actor_id').notNull().references(()=>user.id),operationId:uuid('operation_id').notNull(),
 personId:text('person_id').notNull().references(()=>records.id),scopeHash:text('scope_hash').notNull(),
 requestHash:text('request_hash').notNull(),kind:text('kind').notNull(),version:integer('version').notNull(),
 createdAt:time('created_at').notNull().defaultNow(),
},t=>[primaryKey({columns:[t.actorId,t.operationId]}),index('board_operation_created_idx').on(t.createdAt)]).enableRLS();
export const boardPrivateNotes=pgTable('cms_board_private_notes',{
 userId:text('user_id').notNull().references(()=>user.id),personId:text('person_id').notNull().references(()=>records.id),
 meetingId:text('meeting_id').notNull(),pointId:text('point_id').notNull(),text:text('text').notNull(),
 updatedAt:time('updated_at').notNull().defaultNow(),
},t=>[primaryKey({columns:[t.userId,t.meetingId,t.pointId]}),index('board_note_person_idx').on(t.personId)]).enableRLS();
export const boardRevisions=pgTable('cms_board_revisions',{
 id:uuid('id').primaryKey(),version:integer('version').notNull(),snapshot:jsonb('snapshot').notNull(),
 actorId:text('actor_id').notNull().references(()=>user.id),personId:text('person_id').notNull().references(()=>records.id),
 role:text('role').notNull(),createdAt:time('created_at').notNull().defaultNow(),
},t=>[uniqueIndex('board_revision_version_idx').on(t.version)]).enableRLS();
