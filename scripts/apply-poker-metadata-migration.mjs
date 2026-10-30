// Read-only preflight by default; --apply runs only the reviewed additive metadata migration.
import {createHash} from 'node:crypto';
import {readFileSync,readdirSync,writeFileSync,mkdirSync} from 'node:fs';
const project='vvvptboxmyibdfzfqxzz',version='20261030000100';
const file=`supabase/migrations/${version}_poker_story_metadata.sql`;
const migration=readFileSync(file,'utf8'),checksum=createHash('sha256').update(migration).digest('hex');
if(!process.env.SUPABASE_ACCESS_TOKEN)throw new Error('Supply Supabase access through secure environment settings.');
if(!/^\s*(?:--[^\n]*\n\s*)*begin;/i.test(migration)||!/commit;\s*$/i.test(migration))throw new Error('Migration transaction boundary missing.');
async function query(sql){const response=await fetch(`https://api.supabase.com/v1/projects/${project}/database/query`,{method:'POST',headers:{Authorization:`Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({query:sql}),signal:AbortSignal.timeout(60000)});if(!response.ok)throw new Error(`Supabase preflight/apply failed (${response.status}); database contents suppressed.`);return response.json();}
const history=await query('select version,checksum from orbit_private.schema_migrations order by version');
for(const item of history){const name=readdirSync('supabase/migrations').find(name=>name.startsWith(item.version+'_')&&name.endsWith('.sql'));if(name&&createHash('sha256').update(readFileSync(`supabase/migrations/${name}`,'utf8')).digest('hex')!==item.checksum)throw new Error(`Applied migration ${item.version} checksum differs. No changes made.`);}
if(!history.some(item=>item.version==='20261029000200'))throw new Error('Apply and verify the base Planning Poker migration first.');
const marker=history.find(item=>item.version===version);
const objects=await query("select to_regprocedure('public.orbit_poker_room_state(text,text,jsonb)') is not null as room_state");
if(!marker&&objects[0].room_state)throw new Error('Untracked room-state function exists. Refusing to overwrite.');
if(marker&&!objects[0].room_state)throw new Error('Tracked room-state function is missing. Review the catalog before releasing.');
const evidence={project,version,file,checksum,alreadyApplied:!!marker,mode:process.argv.includes('--apply')?'apply':'preflight',checkedAt:new Date().toISOString()};
if(!marker&&process.argv.includes('--apply')){
 const sql=migration.replace(/begin;/i,"begin;\nset local lock_timeout='10s';\nset local statement_timeout='50s';").replace(/commit;\s*$/i,`insert into orbit_private.schema_migrations(version,checksum) values('${version}','${checksum}');\nnotify pgrst,'reload schema';\ncommit;`);
 await query(sql);const verified=await query(`select checksum from orbit_private.schema_migrations where version='${version}'`);if(verified[0]?.checksum!==checksum)throw new Error('Migration verification failed.');evidence.applied=true;
}
mkdirSync('.vercel',{recursive:true});writeFileSync('.vercel/poker-metadata-migration-preflight.json',JSON.stringify(evidence,null,2)+'\n',{mode:0o600});console.log(evidence);
