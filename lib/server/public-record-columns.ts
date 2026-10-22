/** Public reads never transfer the editable JSON document from PostgreSQL. */
export function publicRecordColumns(sql:any){
 return sql`id,module,version,
  case when module='activities' then jsonb_build_object('status',draft->>'status') else '{}'::jsonb end as draft,
  live,team_id,department_id,status,deleted_at,updated_at`;
}
