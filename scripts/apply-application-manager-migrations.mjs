// Default: read-only compatibility/checksum preflight. --apply applies only the
// two reviewed manager migrations; it never replays older untracked migrations.
import {createHash} from 'node:crypto';
import {readFileSync,readdirSync,mkdirSync,writeFileSync} from 'node:fs';
const project='vvvptboxmyibdfzfqxzz',versions=['20261031000100','20261031000200'];
const apply=process.argv.includes('--apply');
if(process.argv.slice(2).some(value=>value!=='--apply'))throw new Error('Only --apply is supported.');
if(!process.env.SUPABASE_ACCESS_TOKEN)throw new Error('Supply Supabase access in the environment.');
const files=readdirSync('supabase/migrations'),sha=text=>createHash('sha256').update(text).digest('hex');
const migrations=versions.map(version=>{
 const matches=files.filter(name=>name.startsWith(version+'_')&&name.endsWith('.sql'));
 if(matches.length!==1)throw new Error('Migration file is missing or ambiguous.');
 const file='supabase/migrations/'+matches[0],sql=readFileSync(file,'utf8');
 if(!/^(\s*(?:--[^\n]*\n\s*)*)begin;/i.test(sql)||!/commit;\s*$/i.test(sql))throw new Error('Migration transaction boundaries are missing.');
 return {version,file,sql,checksum:sha(sql)};
});
const headers={Authorization:'Bearer '+process.env.SUPABASE_ACCESS_TOKEN,'Content-Type':'application/json'};
async function provider(path,options={}){
 const response=await fetch('https://api.supabase.com/v1/projects/'+project+path,{...options,headers,signal:AbortSignal.timeout(120000)});
 if(!response.ok)throw new Error('Supabase inspection/apply failed (HTTP '+response.status+'); database details suppressed.');
 return response.json();
}
const query=query=>provider('/database/query',{method:'POST',body:JSON.stringify({query})});
const info=await provider('');if(info.id!==project||info.status!=='ACTIVE_HEALTHY')throw new Error('Expected project is not active.');
let history=await query('select version,checksum from orbit_private.schema_migrations order by version');
for(const item of history){
 const file=files.find(name=>name.startsWith(item.version+'_')&&name.endsWith('.sql'));
 if(!file||sha(readFileSync('supabase/migrations/'+file,'utf8'))!==item.checksum)throw new Error('Applied migration checksum differs: '+item.version);
}
for(const version of ['20261023000100','20261023000200','20261029000200','20261030000100','20261030000200'])if(!history.some(item=>item.version===version))throw new Error('Required migration is missing: '+version);
const catalog=await query(`select
 to_regclass('orbit_private.application_analytics_settings') is not null as analytics,
 to_regprocedure('public.orbit_application_analytics(uuid,integer)') is not null as dashboard,
 to_regprocedure('orbit_private.application_save_workspace_storage(jsonb,bigint)') is not null as storage,
 to_regclass('orbit_private.manager_identity') is not null as manager,
 to_regclass('orbit_private.manager_bootstrap') is not null as bootstrap,
 to_regprocedure('public.orbit_manager_auth(text,jsonb)') is not null as manager_auth`);
const groups=[['analytics','dashboard','storage'],['manager','bootstrap','manager_auth']];
for(const [index,migration] of migrations.entries()){
 const tracked=history.some(item=>item.version===migration.version),objects=groups[index].map(key=>Boolean(catalog[0]?.[key]));
 if(!tracked&&objects.some(Boolean)||tracked&&!objects.every(Boolean))throw new Error('Migration tracking/catalog mismatch for '+migration.version+'. Refusing to overwrite.');
}
const evidence={project,mode:apply?'apply':'preflight',checkedAt:new Date().toISOString(),migrations:[]};
for(const migration of migrations){
 const marker=history.find(item=>item.version===migration.version),result={version:migration.version,file:migration.file,checksum:migration.checksum,alreadyApplied:!!marker,applied:false};
 if(!marker&&apply){
  const sql=migration.sql.replace(/^(\s*(?:--[^\n]*\n\s*)*)begin;/i,"$1begin;\nset local lock_timeout='10s';\nset local statement_timeout='90s';\nselect pg_advisory_xact_lock(hashtextextended('orbit-schema-migrations',0));")
   .replace(/commit;\s*$/i,`insert into orbit_private.schema_migrations(version,checksum) values('${migration.version}','${migration.checksum}');\nnotify pgrst,'reload schema';\ncommit;`);
  await query(sql);const checked=await query(`select checksum from orbit_private.schema_migrations where version='${migration.version}'`);
  if(checked[0]?.checksum!==migration.checksum)throw new Error('Migration verification failed.');result.applied=true;
 }
 evidence.migrations.push(result);
}
if(apply){
 const permissions=await query(`select
 has_function_privilege('anon','public.orbit_application_analytics(uuid,integer)','execute') as public_analytics,
 has_function_privilege('authenticated','public.orbit_application_analytics(uuid,integer)','execute') as user_analytics,
 has_function_privilege('anon','public.orbit_manager_auth(text,jsonb)','execute') as public_auth,
 has_function_privilege('authenticated','public.orbit_manager_auth(text,jsonb)','execute') as user_auth,
 has_function_privilege('service_role','public.orbit_application_analytics(uuid,integer)','execute') as server_analytics,
 has_function_privilege('service_role','public.orbit_manager_auth(text,jsonb)','execute') as server_auth`);
 const p=permissions[0];if(!p||p.public_analytics||p.user_analytics||p.public_auth||p.user_auth||!p.server_analytics||!p.server_auth)throw new Error('Manager function privilege verification failed.');
 evidence.privateGrantsVerified=true;
}
mkdirSync('.vercel',{recursive:true});writeFileSync('.vercel/application-manager-migrations.json',JSON.stringify(evidence,null,2)+'\n',{mode:0o600});console.log(evidence);
