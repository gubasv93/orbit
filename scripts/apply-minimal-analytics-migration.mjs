// Read-only by default. --apply runs only the reviewed privacy cutover migration;
// older untracked migrations are never replayed.
import {createHash} from 'node:crypto';
import {readFileSync,readdirSync,mkdirSync,writeFileSync} from 'node:fs';

const project='vvvptboxmyibdfzfqxzz',version='20261101000100';
const apply=process.argv.includes('--apply');
if(process.argv.slice(2).some(value=>value!=='--apply'))throw new Error('Only --apply is supported.');
if(!process.env.SUPABASE_ACCESS_TOKEN)throw new Error('Supply Supabase access in the environment.');
const files=readdirSync('supabase/migrations'),sha=text=>createHash('sha256').update(text).digest('hex');
const matches=files.filter(name=>name.startsWith(version+'_')&&name.endsWith('.sql'));
if(matches.length!==1)throw new Error('Migration file is missing or ambiguous.');
const file='supabase/migrations/'+matches[0],sql=readFileSync(file,'utf8'),checksum=sha(sql);
if(!/^(\s*(?:--[^\n]*\n\s*)*)begin;/i.test(sql)||!/commit;\s*$/i.test(sql))throw new Error('Migration transaction boundaries are missing.');
const headers={Authorization:'Bearer '+process.env.SUPABASE_ACCESS_TOKEN,'Content-Type':'application/json'};
async function provider(path,options={}){
 const response=await fetch('https://api.supabase.com/v1/projects/'+project+path,{...options,headers,signal:AbortSignal.timeout(120000)});
 if(!response.ok)throw new Error('Supabase inspection/apply failed (HTTP '+response.status+'); database details suppressed.');
 return response.json();
}
const query=query=>provider('/database/query',{method:'POST',body:JSON.stringify({query})});
const info=await provider('');
if(info.id!==project||info.status!=='ACTIVE_HEALTHY')throw new Error('Expected project is not active.');
let history=await query('select version,checksum from orbit_private.schema_migrations order by version');
for(const item of history){
 const source=files.find(name=>name.startsWith(item.version+'_')&&name.endsWith('.sql'));
 if(!source||sha(readFileSync('supabase/migrations/'+source,'utf8'))!==item.checksum)throw new Error('Applied migration checksum differs: '+item.version);
}
for(const required of ['20261023000100','20261023000200','20261029000200','20261030000100','20261030000200','20261031000100','20261031000200']){
 if(!history.some(item=>item.version===required))throw new Error('Required migration is missing: '+required);
}
const catalog=await query(`select
 to_regclass('orbit_private.application_privacy_settings') is not null as settings,
 to_regclass('orbit_private.application_landing_pageviews') is not null as pageviews,
 to_regclass('orbit_private.application_legal_acceptances') is not null as acceptances,
 to_regprocedure('public.orbit_record_landing_pageview()') is not null as recorder,
 to_regprocedure('public.orbit_landing_pageviews(integer)') is not null as reader,
 to_regprocedure('public.orbit_legal_status()') is not null as legal_status,
 to_regprocedure('public.orbit_accept_legal(text,text)') is not null as legal_accept,
 exists(select 1 from pg_constraint where conrelid=to_regclass('orbit_private.application_activity_sessions') and conname='application_activity_retired' and convalidated) as sessions_retired,
 exists(select 1 from pg_constraint where conrelid=to_regclass('orbit_private.application_activity_limits') and conname='application_activity_limits_retired' and convalidated) as limits_retired`);
const marker=history.find(item=>item.version===version),objects=Object.values(catalog[0]||{});
if(objects.length!==9||(!marker&&objects.some(Boolean))||(marker&&!objects.every(Boolean)))throw new Error('Migration tracking/catalog mismatch. Refusing to overwrite.');
const evidence={project,version,file,checksum,mode:apply?'apply':'preflight',alreadyApplied:!!marker,applied:false,checkedAt:new Date().toISOString()};
if(!marker&&apply){
 const transaction=sql.replace(/^(\s*(?:--[^\n]*\n\s*)*)begin;/i,"$1begin;\nset local lock_timeout='10s';\nset local statement_timeout='90s';\nselect pg_advisory_xact_lock(hashtextextended('orbit-schema-migrations',0));")
  .replace(/commit;\s*$/i,`insert into orbit_private.schema_migrations(version,checksum) values('${version}','${checksum}');\nnotify pgrst,'reload schema';\ncommit;`);
 await query(transaction);
 const checked=await query(`select checksum from orbit_private.schema_migrations where version='${version}'`);
 if(checked[0]?.checksum!==checksum)throw new Error('Migration verification failed.');
 evidence.applied=true;
}
if(marker||apply){
 const permissions=await query(`select
 has_function_privilege('anon','public.orbit_record_landing_pageview()','execute') as public_record,
 has_function_privilege('authenticated','public.orbit_record_landing_pageview()','execute') as user_record,
 has_function_privilege('service_role','public.orbit_record_landing_pageview()','execute') as server_record,
 has_function_privilege('anon','public.orbit_landing_pageviews(integer)','execute') as public_read,
 has_function_privilege('authenticated','public.orbit_landing_pageviews(integer)','execute') as user_read,
 has_function_privilege('service_role','public.orbit_landing_pageviews(integer)','execute') as server_read,
 has_function_privilege('anon','public.orbit_legal_status()','execute') as public_legal_status,
 has_function_privilege('authenticated','public.orbit_legal_status()','execute') as user_legal_status,
 has_function_privilege('anon','public.orbit_accept_legal(text,text)','execute') as public_legal_accept,
 has_function_privilege('authenticated','public.orbit_accept_legal(text,text)','execute') as user_legal_accept,
 has_function_privilege('service_role','public.orbit_application_activity(uuid,text,uuid,text,integer,boolean,integer)','execute') as legacy_record,
 has_function_privilege('service_role','public.orbit_application_activity_allow(text)','execute') as legacy_allow,
 has_table_privilege('anon','orbit_private.application_landing_pageviews','SELECT,INSERT,UPDATE,DELETE') as public_counter_table,
 has_table_privilege('authenticated','orbit_private.application_landing_pageviews','SELECT,INSERT,UPDATE,DELETE') as user_counter_table,
 has_table_privilege('anon','orbit_private.application_legal_acceptances','SELECT,INSERT,UPDATE,DELETE') as public_acceptance_table,
 has_table_privilege('authenticated','orbit_private.application_legal_acceptances','SELECT,INSERT,UPDATE,DELETE') as user_acceptance_table,
 (select count(*)::int from orbit_private.application_activity_sessions) as legacy_sessions,
 (select count(*)::int from orbit_private.application_activity_limits) as legacy_limits`);
 const p=permissions[0];
 const denied=['public_record','user_record','public_read','user_read','public_legal_status','public_legal_accept','legacy_record','legacy_allow','public_counter_table','user_counter_table','public_acceptance_table','user_acceptance_table'];
 const allowed=['server_record','server_read','user_legal_status','user_legal_accept'];
 if(!p||denied.some(key=>p[key]!==false)||allowed.some(key=>p[key]!==true)||p.legacy_sessions!==0||p.legacy_limits!==0)throw new Error('Privacy cutover permission/purge verification failed.');
 evidence.privateGrantsVerified=true;evidence.legacyActivityRemoved=true;
}
mkdirSync('.vercel',{recursive:true});
writeFileSync('.vercel/minimal-analytics-migration.json',JSON.stringify(evidence,null,2)+'\n',{mode:0o600});
console.log(evidence);
