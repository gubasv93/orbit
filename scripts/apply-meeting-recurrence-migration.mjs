// Default: read-only preflight. --apply installs only the reviewed recurrence check.
// Historical migrations and business records are never replayed or rewritten.
import {createHash} from 'node:crypto';
import {readFileSync,readdirSync,mkdirSync,writeFileSync} from 'node:fs';

const project='vvvptboxmyibdfzfqxzz',version='20261112000100';
const apply=process.argv.includes('--apply');
if(process.argv.slice(2).some(value=>value!=='--apply'))throw new Error('Only --apply is supported.');
if(!process.env.SUPABASE_ACCESS_TOKEN)throw new Error('Supply Supabase access through the environment.');
const files=readdirSync('supabase/migrations'),sha=value=>createHash('sha256').update(value).digest('hex');
const names=files.filter(name=>name.startsWith(version+'_')&&name.endsWith('.sql'));
if(names.length!==1)throw new Error('Migration file is missing or ambiguous.');
const file='supabase/migrations/'+names[0],sql=readFileSync(file,'utf8'),checksum=sha(sql);
const body=sql.match(/create function orbit_private\.valid_custom_meeting_recurrence\(document jsonb\) returns boolean\s+language plpgsql immutable set search_path='' as \$validator\$([\s\S]*?)\$validator\$;/)?.[1];
if(!body||!/^(\s*(?:--[^\n]*\n\s*)*)begin;/i.test(sql)||!/commit;\s*$/i.test(sql))throw new Error('Reviewed transaction and private validator boundaries are missing.');
const executable=sql.replace(/--[^\n]*/g,'').replace(/'(?:''|[^'])*'/g,"''");
if(/\b(insert|update|delete|truncate)\b/i.test(executable)||!sql.includes('fingerprint_before<>fingerprint_after')||!sql.includes('lock table public.orbit_recurring_meetings in access exclusive mode;'))throw new Error('Meeting migration must preserve records inside its locked DDL transaction.');
const headers={Authorization:'Bearer '+process.env.SUPABASE_ACCESS_TOKEN,'Content-Type':'application/json'};
async function provider(path,options={}){
 const response=await fetch('https://api.supabase.com/v1/projects/'+project+path,{...options,headers,signal:AbortSignal.timeout(120000)});
 if(!response.ok)throw new Error('Supabase recurrence inspection/apply failed (HTTP '+response.status+'); provider details suppressed.');
 return response.json();
}
const query=query=>provider('/database/query',{method:'POST',body:JSON.stringify({query})});
const info=await provider('');
if(info.id!==project||info.status!=='ACTIVE_HEALTHY')throw new Error('The expected Supabase project is not active.');
const history=await query('select version,checksum from orbit_private.schema_migrations order by version');
for(const item of history){
 const sources=files.filter(name=>name.startsWith(item.version+'_')&&name.endsWith('.sql'));
 if(sources.length!==1||sha(readFileSync('supabase/migrations/'+sources[0],'utf8'))!==item.checksum)throw new Error('Applied migration checksum differs: '+item.version);
}
for(const required of ['20261023000100','20261023000200','20261029000200','20261030000100','20261030000200','20261031000100','20261031000200','20261101000100','20261101000200','20261111000100']){
 if(!history.some(item=>item.version===required))throw new Error('Required migration is missing: '+required);
}
const marker=history.find(item=>item.version===version);
async function inspect(){
 return (await query(`select
  (select jsonb_build_object('name',c.conname,'expression',pg_get_expr(c.conbin,c.conrelid),'validated',c.convalidated)
   from pg_constraint c where c.conrelid='public.orbit_recurring_meetings'::regclass and c.contype='c' and pg_get_expr(c.conbin,c.conrelid) ilike '%recurrence%' limit 1) as recurrence,
  (select count(*)::int from pg_constraint c where c.conrelid='public.orbit_recurring_meetings'::regclass and c.contype='c' and pg_get_expr(c.conbin,c.conrelid) ilike '%recurrence%') as recurrence_checks,
  (select jsonb_agg(jsonb_build_object('oid',c.oid,'name',c.conname,'definition',pg_get_constraintdef(c.oid),'validated',c.convalidated) order by c.conname)
   from pg_constraint c where c.conrelid='public.orbit_recurring_meetings'::regclass and not(c.contype='c' and pg_get_expr(c.conbin,c.conrelid) ilike '%recurrence%')) as other_constraints,
  (select jsonb_build_object('rls',c.relrowsecurity,'owner',c.relowner,'grants',c.relacl) from pg_class c where c.oid='public.orbit_recurring_meetings'::regclass) as table_security,
  (select jsonb_agg(jsonb_build_object('oid',p.oid,'owner',p.proowner,'security',p.prosecdef,'config',p.proconfig,'grants',p.proacl,'definition',md5(pg_get_functiondef(p.oid))) order by p.oid)
   from pg_proc p where p.oid in ('public.orbit_save_workspace(jsonb,bigint)'::regprocedure,'public.orbit_get_workspace()'::regprocedure)) as workspace_rpcs,
  (select p.proowner from pg_proc p where p.oid='public.orbit_save_workspace(jsonb,bigint)'::regprocedure) as rpc_owner,
  (select oid from pg_roles where rolname=current_user) as caller_owner,
  (select jsonb_build_object('owner',p.proowner,'security',p.prosecdef,'volatility',p.provolatile,'config',p.proconfig,'source',p.prosrc,
   'anon',has_function_privilege('anon',p.oid,'execute'),'authenticated',has_function_privilege('authenticated',p.oid,'execute'),
   'service',has_function_privilege('service_role',p.oid,'execute')) from pg_proc p where p.oid=to_regprocedure('orbit_private.valid_custom_meeting_recurrence(jsonb)')) as validator,
  has_table_privilege('anon','public.orbit_recurring_meetings','SELECT,INSERT,UPDATE,DELETE') as public_table,
  has_table_privilege('authenticated','public.orbit_recurring_meetings','INSERT,UPDATE,DELETE') as user_write,
  has_table_privilege('authenticated','public.orbit_recurring_meetings','SELECT') as user_read,
  has_function_privilege('anon','public.orbit_save_workspace(jsonb,bigint)','execute') as public_save,
  has_function_privilege('authenticated','public.orbit_save_workspace(jsonb,bigint)','execute') as user_save,
  has_function_privilege('anon','public.orbit_get_workspace()','execute') as public_load,
  has_function_privilege('authenticated','public.orbit_get_workspace()','execute') as user_load,
  (select count(*)::int from orbit_private.application_activity_sessions) as optional_sessions,
  (select count(*)::int from orbit_private.application_activity_limits) as optional_limits,
  (select count(*)::int from pg_constraint where conname in ('application_activity_retired','application_activity_limits_retired')
   and conrelid in ('orbit_private.application_activity_sessions'::regclass,'orbit_private.application_activity_limits'::regclass)
   and convalidated and pg_get_expr(conbin,conrelid)='false') as retired_constraints,
  has_function_privilege('service_role','public.orbit_application_activity_allow(text)','execute') as optional_writer,
  has_function_privilege('service_role','public.orbit_application_activity(uuid,text,uuid,text,integer,boolean,integer)','execute') as optional_events_writer,
  (select bool_or(has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') or has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE'))
   from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='orbit_private' and c.relname in
   ('application_accounts','application_projects','application_entities','application_poker_games','application_poker_players','application_landing_pageviews')) as public_facts_access`))[0];
}
const normalize=value=>String(value||'').replace(/[\s()]/g,'').toLowerCase();
const legacy="((document ->> 'recurrence'::text) = ANY (ARRAY['workdays'::text, 'weekly'::text, 'interval'::text, 'monthly'::text]))";
const custom="CASE WHEN ((document ->> 'recurrence'::text) = 'custom'::text) THEN orbit_private.valid_custom_meeting_recurrence(document) ELSE ((document ->> 'recurrence'::text) = ANY (ARRAY['workdays'::text, 'weekly'::text, 'interval'::text, 'monthly'::text])) END";
function verify(state,installed){
 if(!state||state.public_table!==false||state.user_write!==false||state.user_read!==true||state.public_save!==false||state.user_save!==true||state.public_load!==false||state.user_load!==true||state.table_security?.rls!==true||state.optional_sessions!==0||state.optional_limits!==0||state.retired_constraints!==2||state.optional_writer!==false||state.optional_events_writer!==false||state.public_facts_access!==false)throw new Error('Workspace grants, row security or retired privacy boundaries differ; refusing to change them.');
 if(state.recurrence_checks!==1||state.recurrence?.validated!==true||normalize(state.recurrence.expression)!==normalize(installed?custom:legacy))throw new Error('The expected meeting recurrence check differs; refusing to replace another constraint.');
 if(!installed){if(state.validator!==null)throw new Error('An untracked custom recurrence validator exists.');return;}
 const fn=state.validator;
 if(state.recurrence.name!=='orbit_recurring_meetings_recurrence_check'||!fn||String(fn.owner)!==String(state.rpc_owner)||fn.security!==false||fn.volatility!=='i'||JSON.stringify(fn.config)!==JSON.stringify(['search_path=""'])||fn.source!==body||fn.anon!==false||fn.authenticated!==false||fn.service!==false)throw new Error('The installed custom recurrence validator source, ownership or private grants differ.');
}
const before=await inspect();verify(before,!!marker);
if(!marker&&apply&&String(before.caller_owner)!==String(before.rpc_owner))throw new Error('Migration must run as the existing workspace RPC owner.');
const evidence={project,version,file,checksum,mode:apply?'apply':'preflight',alreadyApplied:!!marker,applied:false,checkedAt:new Date().toISOString()};
if(!marker&&apply){
 const transaction=sql.replace(/^(\s*(?:--[^\n]*\n\s*)*)begin;/i,"$1begin;\nset local lock_timeout='10s';\nset local statement_timeout='90s';\nselect pg_advisory_xact_lock(hashtextextended('orbit-schema-migrations',0));")
  .replace(/commit;\s*$/i,`insert into orbit_private.schema_migrations(version,checksum) values('${version}','${checksum}');\nnotify pgrst,'reload schema';\ncommit;`);
 await query(transaction);
 const checked=await query(`select checksum from orbit_private.schema_migrations where version='${version}'`);
 if(checked[0]?.checksum!==checksum)throw new Error('Recurrence migration history verification failed.');
 evidence.applied=true;
}
if(marker||apply){
 const after=await inspect();verify(after,true);
 for(const field of ['other_constraints','table_security','workspace_rpcs'])if(JSON.stringify(before[field])!==JSON.stringify(after[field]))throw new Error('Existing constraints, workspace RPCs or grants changed.');
 Object.assign(evidence,{constraintVerified:true,privateValidatorVerified:true,existingChecksAndRpcsVerified:true,privacyRetirementVerified:true,recordsGuardedInTransaction:true});
}
mkdirSync('.vercel',{recursive:true});
writeFileSync('.vercel/scrum-recurrence-migration.json',JSON.stringify(evidence,null,2)+'\n',{mode:0o600});
console.log(evidence);
