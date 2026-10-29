// Read-only preflight by default. --apply requires the owner's explicit approval.
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
const project='vvvptboxmyibdfzfqxzz',version='20261029000200';
const file=`supabase/migrations/${version}_planning_poker.sql`;
const migration=readFileSync(file,'utf8'),checksum=createHash('sha256').update(migration).digest('hex');
if(!process.env.SUPABASE_ACCESS_TOKEN)throw new Error('Supply Supabase access through secure environment settings.');
if(!/^\s*(?:--[^\n]*\n\s*)*begin;/i.test(migration)||!/commit;\s*$/i.test(migration))throw new Error('Migration transaction boundary missing.');
async function query(sql){const response=await fetch(`https://api.supabase.com/v1/projects/${project}/database/query`,{method:'POST',headers:{Authorization:`Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({query:sql}),signal:AbortSignal.timeout(60000)});if(!response.ok)throw new Error(`Supabase preflight/apply failed (${response.status}); database contents suppressed.`);return response.json();}
const history=await query('select version,checksum from orbit_private.schema_migrations order by version');
for(const item of history){const names={'20261023000100':'orbit','20261023000200':'revision_conflict','20261029000100':'unestimated_work_items','20261029000200':'planning_poker'};if(names[item.version]){const local=readFileSync(`supabase/migrations/${item.version}_${names[item.version]}.sql`,'utf8');if(createHash('sha256').update(local).digest('hex')!==item.checksum)throw new Error(`Applied migration ${item.version} checksum differs. No changes made.`);}}
const marker=history.find(item=>item.version===version);
const names=['rooms','participants','rounds','votes','issues','decks','publications'];
const objects=await query(`select ${names.map(name=>`to_regclass('public.orbit_poker_${name}') is not null as ${name}`).join(',')},to_regclass('orbit_private.poker_limits') is not null as limits`);
if(!marker&&Object.values(objects[0]).some(Boolean))throw new Error('Untracked Poker objects already exist. Refusing to overwrite.');
if(marker&&!Object.values(objects[0]).every(Boolean))throw new Error('Tracked Poker schema is incomplete. Review the catalog before releasing.');
const evidence={project,version,file,checksum,alreadyApplied:!!marker,mode:process.argv.includes('--apply')?'apply':'preflight',checkedAt:new Date().toISOString()};
if(!marker&&process.argv.includes('--apply')){
 const sql=migration.replace(/begin;/i,"begin;\nset local lock_timeout='10s';\nset local statement_timeout='50s';").replace(/commit;\s*$/i,`insert into orbit_private.schema_migrations(version,checksum) values('${version}','${checksum}');\nnotify pgrst,'reload schema';\ncommit;`);
 await query(sql);const verified=await query(`select checksum from orbit_private.schema_migrations where version='${version}'`);if(verified[0]?.checksum!==checksum)throw new Error('Migration verification failed.');evidence.applied=true;
}
mkdirSync('.vercel',{recursive:true});writeFileSync('.vercel/poker-migration-preflight.json',JSON.stringify(evidence,null,2)+'\n',{mode:0o600});console.log(evidence);
