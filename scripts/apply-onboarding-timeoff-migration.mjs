// Default: read-only preflight. --apply widens only the reviewed setup-step check.
// Historical or untracked migrations are never replayed.
import {createHash} from 'node:crypto';
import {readFileSync,readdirSync,mkdirSync,writeFileSync} from 'node:fs';

const project='vvvptboxmyibdfzfqxzz',version='20261101000200';
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
const history=await query('select version,checksum from orbit_private.schema_migrations order by version');
for(const item of history){
 const source=files.find(name=>name.startsWith(item.version+'_')&&name.endsWith('.sql'));
 if(!source||sha(readFileSync('supabase/migrations/'+source,'utf8'))!==item.checksum)throw new Error('Applied migration checksum differs: '+item.version);
}
for(const required of ['20261023000100','20261023000200','20261029000200','20261030000100','20261030000200','20261031000100','20261031000200','20261101000100']){
 if(!history.some(item=>item.version===required))throw new Error('Required migration is missing: '+required);
}
async function inspect(){
 const rows=await query(`select
  (select pg_get_expr(c.conbin,c.conrelid) from pg_constraint c where c.conrelid='public.orbit_projects'::regclass and c.conname='orbit_projects_onboarding_step_check' and c.contype='c' and c.convalidated) as expression,
  (select count(*)::int from pg_constraint c where c.conrelid='public.orbit_projects'::regclass and c.contype='c' and pg_get_expr(c.conbin,c.conrelid) ilike '%onboarding_step%') as step_checks,
  (select a.attnotnull from pg_attribute a where a.attrelid='public.orbit_projects'::regclass and a.attname='onboarding_step' and not a.attisdropped) as nonnull,
  (select pg_get_expr(d.adbin,d.adrelid) from pg_attrdef d join pg_attribute a on a.attrelid=d.adrelid and a.attnum=d.adnum where a.attrelid='public.orbit_projects'::regclass and a.attname='onboarding_step') as default_value,
  (select count(*)::int from public.orbit_projects where onboarding_step not between 0 and 3) as invalid_rows,
  has_table_privilege('anon','public.orbit_projects','INSERT,UPDATE,DELETE') as public_write,
  has_table_privilege('authenticated','public.orbit_projects','INSERT,UPDATE,DELETE') as user_write,
  has_function_privilege('anon','public.orbit_save_workspace(jsonb,bigint)','execute') as public_save,
  has_function_privilege('authenticated','public.orbit_save_workspace(jsonb,bigint)','execute') as user_save`);
 return rows[0];
}
const normalized=value=>String(value||'').replace(/[\s()]/g,'').toLowerCase();
function verify(state,maximum){
 if(!state||normalized(state.expression)!==`onboarding_step>=0andonboarding_step<=${maximum}`||state.step_checks!==1||state.nonnull!==true||normalized(state.default_value)!=='0'||state.invalid_rows!==0||state.public_write!==false||state.user_write!==false||state.public_save!==false||state.user_save!==true)throw new Error('Unexpected project setup constraint, default, saved rows or permissions. Refusing to overwrite.');
}
const marker=history.find(item=>item.version===version);
verify(await inspect(),marker?3:2);
const evidence={project,version,file,checksum,mode:apply?'apply':'preflight',alreadyApplied:!!marker,applied:false,checkedAt:new Date().toISOString()};
if(!marker&&apply){
 const transaction=sql.replace(/^(\s*(?:--[^\n]*\n\s*)*)begin;/i,"$1begin;\nset local lock_timeout='10s';\nset local statement_timeout='90s';\nselect pg_advisory_xact_lock(hashtextextended('orbit-schema-migrations',0));")
  .replace(/commit;\s*$/i,`insert into orbit_private.schema_migrations(version,checksum) values('${version}','${checksum}');\nnotify pgrst,'reload schema';\ncommit;`);
 await query(transaction);
 const checked=await query(`select checksum from orbit_private.schema_migrations where version='${version}'`);
 if(checked[0]?.checksum!==checksum)throw new Error('Migration verification failed.');
 evidence.applied=true;
}
if(marker||apply){verify(await inspect(),3);evidence.constraintVerified=true;evidence.privateGrantsVerified=true;evidence.savedRowsVerified=true;}
mkdirSync('.vercel',{recursive:true});
writeFileSync('.vercel/onboarding-timeoff-migration.json',JSON.stringify(evidence,null,2)+'\n',{mode:0o600});
console.log(evidence);
