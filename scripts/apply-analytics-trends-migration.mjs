// Default: read-only preflight. --apply installs only the additive trends RPC/indexes.
// Existing migrations, business records and retired telemetry are never replayed.
import {createHash} from 'node:crypto';
import {readFileSync,readdirSync,mkdirSync,writeFileSync} from 'node:fs';

const project='vvvptboxmyibdfzfqxzz',version='20261111000100';
const apply=process.argv.includes('--apply');
if(process.argv.slice(2).some(value=>value!=='--apply'))throw new Error('Only --apply is supported.');
if(!process.env.SUPABASE_ACCESS_TOKEN)throw new Error('Supply Supabase access through the environment.');
const files=readdirSync('supabase/migrations'),sha=value=>createHash('sha256').update(value).digest('hex');
const names=files.filter(name=>name.startsWith(version+'_')&&name.endsWith('.sql'));
if(names.length!==1)throw new Error('Migration file is missing or ambiguous.');
const file='supabase/migrations/'+names[0],sql=readFileSync(file,'utf8'),checksum=sha(sql);
const body=sql.match(/create function public\.orbit_application_analytics_trends\(p_user_id uuid default null,p_days integer default 30\) returns jsonb\s+language plpgsql stable security definer set search_path='' as \$\$([\s\S]*?)\$\$;/)?.[1];
if(!body||!/^(\s*(?:--[^\n]*\n\s*)*)begin;/i.test(sql)||!/commit;\s*$/i.test(sql))throw new Error('Reviewed transaction and read-only function boundaries are missing.');
// Ignore comments and SQL string literals before checking the RPC's statement types.
const executable=body.replace(/--[^\n]*/g,'').replace(/'(?:''|[^'])*'/g,"''");
if(/\b(insert|update|delete|truncate|alter|create|drop|grant|revoke|execute|perform)\b/i.test(executable))throw new Error('The trends RPC must remain read-only.');
const headers={Authorization:'Bearer '+process.env.SUPABASE_ACCESS_TOKEN,'Content-Type':'application/json'};
async function provider(path,options={}){
 const response=await fetch('https://api.supabase.com/v1/projects/'+project+path,{...options,headers,signal:AbortSignal.timeout(120000)});
 if(!response.ok)throw new Error('Supabase trends inspection/apply failed (HTTP '+response.status+'); provider details suppressed.');
 return response.json();
}
const query=query=>provider('/database/query',{method:'POST',body:JSON.stringify({query})});
const info=await provider('');
if(info.id!==project||info.status!=='ACTIVE_HEALTHY')throw new Error('The expected Supabase project is not active.');
const history=await query('select version,checksum from orbit_private.schema_migrations order by version');
for(const item of history){
 const source=files.find(name=>name.startsWith(item.version+'_')&&name.endsWith('.sql'));
 if(!source||sha(readFileSync('supabase/migrations/'+source,'utf8'))!==item.checksum)throw new Error('Applied migration checksum differs: '+item.version);
}
for(const required of ['20261023000100','20261023000200','20261029000200','20261030000100','20261030000200','20261031000100','20261031000200','20261101000100','20261101000200']){
 if(!history.some(item=>item.version===required))throw new Error('Required migration is missing: '+required);
}
const marker=history.find(item=>item.version===version);
async function inspect(){
 return (await query(`select
  (select jsonb_build_object('security',p.prosecdef,'volatility',p.provolatile,'config',p.proconfig,'source',p.prosrc,
   'anon',has_function_privilege('anon',p.oid,'execute'),'authenticated',has_function_privilege('authenticated',p.oid,'execute'),
   'service',has_function_privilege('service_role',p.oid,'execute')) from pg_proc p where p.oid=to_regprocedure('public.orbit_application_analytics_trends(uuid,integer)')) as function,
  (select coalesce(jsonb_agg(jsonb_build_object('name',c.relname,'valid',i.indisvalid,'definition',pg_get_indexdef(i.indexrelid)) order by c.relname),'[]'::jsonb)
   from pg_index i join pg_class c on c.oid=i.indexrelid join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='orbit_private' and c.relname in ('application_entities_observed','application_projects_observed','application_poker_games_created')) as indexes,
  (select count(*)::int from orbit_private.application_activity_sessions) as optional_sessions,
  (select count(*)::int from orbit_private.application_activity_limits) as optional_limits,
  (select count(*)::int from pg_constraint where conname in ('application_activity_retired','application_activity_limits_retired')
    and conrelid in ('orbit_private.application_activity_sessions'::regclass,'orbit_private.application_activity_limits'::regclass)
    and convalidated and pg_get_expr(conbin,conrelid)='false') as retired_constraints,
  has_function_privilege('service_role','public.orbit_application_activity_allow(text)','execute') as optional_writer,
  has_function_privilege('service_role','public.orbit_application_activity(uuid,text,uuid,text,integer,boolean,integer)','execute') as optional_events_writer,
  has_function_privilege('anon','public.orbit_save_workspace(jsonb,bigint)','execute') as public_save,
  has_function_privilege('authenticated','public.orbit_save_workspace(jsonb,bigint)','execute') as user_save,
  (select bool_or(has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') or has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE'))
   from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='orbit_private' and c.relname in
    ('application_accounts','application_projects','application_entities','application_poker_games','application_poker_players','application_landing_pageviews')) as public_facts_access`))[0];
}
const normalize=value=>String(value).replace(/[\s"]/g,'').toLowerCase();
const definitions=[
 'CREATE INDEX application_entities_observed ON orbit_private.application_entities USING btree (first_seen_at, kind, project_lifetime_id)',
 'CREATE INDEX application_projects_observed ON orbit_private.application_projects USING btree (first_seen_at, user_id)',
 'CREATE INDEX application_poker_games_created ON orbit_private.application_poker_games USING btree (created_at, user_id)',
];
function verify(state,installed){
 if(!state||state.optional_sessions!==0||state.optional_limits!==0||state.retired_constraints!==2||state.optional_writer!==false||state.optional_events_writer!==false||state.public_save!==false||state.user_save!==true||state.public_facts_access!==false)throw new Error('Operational grants or retired privacy boundaries differ; refusing to change them.');
 if(!installed){if(state.function!==null||state.indexes.length!==0)throw new Error('Untracked trends function or indexes exist; review before applying.');return;}
 const fn=state.function;
 if(!fn||fn.security!==true||fn.volatility!=='s'||JSON.stringify(fn.config)!==JSON.stringify(['search_path=""'])||fn.source!==body||fn.anon!==false||fn.authenticated!==false||fn.service!==true)throw new Error('The installed trends RPC source, read-only settings or private grants differ.');
 if(state.indexes.length!==definitions.length||definitions.some(def=>!state.indexes.some(index=>index.valid===true&&normalize(index.definition)===normalize(def))))throw new Error('The installed trends indexes differ.');
}
verify(await inspect(),!!marker);
const evidence={project,version,file,checksum,mode:apply?'apply':'preflight',alreadyApplied:!!marker,applied:false,checkedAt:new Date().toISOString()};
if(!marker&&apply){
 const transaction=sql.replace(/^(\s*(?:--[^\n]*\n\s*)*)begin;/i,"$1begin;\nset local lock_timeout='10s';\nset local statement_timeout='90s';\nselect pg_advisory_xact_lock(hashtextextended('orbit-schema-migrations',0));")
  .replace(/commit;\s*$/i,`insert into orbit_private.schema_migrations(version,checksum) values('${version}','${checksum}');\nnotify pgrst,'reload schema';\ncommit;`);
 await query(transaction);
 const checked=await query(`select checksum from orbit_private.schema_migrations where version='${version}'`);
 if(checked[0]?.checksum!==checksum)throw new Error('Trends migration history verification failed.');
 evidence.applied=true;
}
if(marker||apply){verify(await inspect(),true);Object.assign(evidence,{readOnlyFunctionVerified:true,privateGrantsVerified:true,privacyRetirementVerified:true,additiveOnly:true});}
mkdirSync('.vercel',{recursive:true});
writeFileSync('.vercel/analytics-trends-migration.json',JSON.stringify(evidence,null,2)+'\n',{mode:0o600});
console.log(evidence);
