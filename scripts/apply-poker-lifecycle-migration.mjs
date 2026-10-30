// Read-only by default. --apply executes only the new, reviewed lifecycle migration.
import {createHash} from 'node:crypto';
import {readFileSync,readdirSync,writeFileSync,mkdirSync} from 'node:fs';

const project='vvvptboxmyibdfzfqxzz',version='20261030000200';
const file=`supabase/migrations/${version}_poker_room_lifecycle.sql`;
const migration=readFileSync(file,'utf8'),checksum=createHash('sha256').update(migration).digest('hex');
const apply=process.argv.includes('--apply');
if(process.argv.slice(2).some(argument=>argument!=='--apply'))throw new Error('Only --apply is supported; default mode is read-only.');
if(!process.env.SUPABASE_ACCESS_TOKEN)throw new Error('Supply Supabase access through secure environment settings.');
const opening=/^(\s*(?:--[^\n]*\n\s*)*)begin;/i;
if(!opening.test(migration)||!/commit;\s*$/i.test(migration))throw new Error('Migration transaction boundary missing.');
const headers={Authorization:`Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,'Content-Type':'application/json'};
async function provider(path,options={}){
 const response=await fetch(`https://api.supabase.com/v1/projects/${project}${path}`,{...options,headers,signal:AbortSignal.timeout(60000)});
 if(!response.ok)throw new Error(`Supabase preflight/apply failed (${response.status}); response contents suppressed.`);
 return response.json();
}
async function query(sql){return provider('/database/query',{method:'POST',body:JSON.stringify({query:sql})});}
const info=await provider('');
if(info.id!==project||info.status!=='ACTIVE_HEALTHY')throw new Error('Expected Supabase project is not active. No changes made.');
const history=await query('select version,checksum from orbit_private.schema_migrations order by version');
const local=readdirSync('supabase/migrations');
for(const item of history){
 if(!/^\d{14}$/.test(item.version)||!/^([a-f0-9]{64})$/.test(item.checksum))throw new Error('Invalid migration tracking entry. No changes made.');
 const matches=local.filter(name=>name.startsWith(item.version+'_')&&name.endsWith('.sql'));
 if(matches.length!==1)throw new Error(`Applied migration ${item.version} is not uniquely available locally. No changes made.`);
 if(createHash('sha256').update(readFileSync(`supabase/migrations/${matches[0]}`,'utf8')).digest('hex')!==item.checksum)throw new Error(`Applied migration ${item.version} checksum differs. No changes made.`);
}
for(const prerequisite of ['20261023000100','20261023000200','20261029000200','20261030000100'])if(!history.some(item=>item.version===prerequisite))throw new Error(`Required migration ${prerequisite} is not tracked. No changes made.`);
const marker=history.find(item=>item.version===version);
const [objects]=await query(`select
 to_regprocedure('public.orbit_poker(text,text,text,jsonb)') is not null as poker,
 to_regprocedure('public.orbit_poker_room_state(text,text,jsonb)') is not null as room_state,
 to_regprocedure('public.orbit_poker_publish(text,bigint,jsonb,uuid,text,jsonb)') is not null as publication,
 to_regclass('orbit_private.poker_connections') is not null as connections,
 to_regprocedure('orbit_private.poker_refresh_lifecycle(uuid)') is not null as refresh,
 to_regprocedure('orbit_private.poker_expire_empty_rooms()') is not null as maintenance,
 (select count(*)::int from information_schema.columns where table_schema='public' and table_name='orbit_poker_rooms' and column_name in ('started_at','empty_since','closed_reason')) as lifecycle_columns`);
if(!objects?.poker||!objects?.room_state||!objects?.publication)throw new Error('Base Poker functions are missing. No changes made.');
const anyLifecycle=objects.connections||objects.refresh||objects.maintenance||objects.lifecycle_columns>0;
const allLifecycle=objects.connections&&objects.refresh&&objects.maintenance&&objects.lifecycle_columns===3;
if(!marker&&anyLifecycle)throw new Error('Untracked lifecycle objects exist. Refusing to overwrite.');
if(marker&&!allLifecycle)throw new Error('Tracked lifecycle objects are missing. Review the catalog before releasing.');
const evidence={project,version,file,checksum,alreadyApplied:!!marker,mode:apply?'apply':'preflight',checkedAt:new Date().toISOString()};
if(!marker&&apply){
 // Do not backfill or rerun older untracked migrations. Only this exact file is applied.
 const sql=migration.replace(opening,"$1begin;\nset local lock_timeout='10s';\nset local statement_timeout='50s';\nselect pg_advisory_xact_lock(hashtextextended('orbit-schema-migrations',0));")
  .replace(/commit;\s*$/i,`insert into orbit_private.schema_migrations(version,checksum) values('${version}','${checksum}');\nnotify pgrst,'reload schema';\ncommit;`);
 await query(sql);
 const verified=await query(`select checksum from orbit_private.schema_migrations where version='${version}'`);
 if(verified[0]?.checksum!==checksum)throw new Error('Migration verification failed.');
 evidence.applied=true;
}
mkdirSync('.vercel',{recursive:true});
writeFileSync('.vercel/poker-lifecycle-migration-preflight.json',JSON.stringify(evidence,null,2)+'\n',{mode:0o600});
console.log(evidence);
