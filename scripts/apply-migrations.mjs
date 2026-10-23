// Applies only the versioned, additive Orbit migration to the explicitly selected project.
// Authentication must come from a secure environment binding, never CLI arguments.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) throw new Error('Set SUPABASE_ACCESS_TOKEN securely in environment settings.');
const project = 'vvvptboxmyibdfzfqxzz';
const directory = new URL('../supabase/migrations/', import.meta.url);
const files = readdirSync(directory).filter(name => /^\d{14}_[a-z0-9_]+\.sql$/.test(name)).sort();
if (!files.length || new Set(files.map(file => file.slice(0,14))).size !== files.length) throw new Error('Migration versions must be present and unique.');
async function query(sql) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${project}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: sql }), signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Error(`Supabase query failed (HTTP ${response.status}); response contents suppressed.`);
  return response.json();
}
const existing = await query("select to_regclass('public.orbit_workspaces') is not null as present, to_regclass('orbit_private.schema_migrations') is not null as tracked, to_regnamespace('orbit_private') is not null as namespace_present");
if (existing[0]?.present && !existing[0]?.tracked) throw new Error('Existing untracked Orbit tables found; refusing to overwrite them.');
if (!existing[0]?.present && existing[0]?.namespace_present) throw new Error('An existing Orbit private schema needs review before first migration.');
let tracked = Boolean(existing[0]?.tracked);
for (const file of files) {
  const version = file.slice(0,14);
  const migration = readFileSync(new URL(file,directory), 'utf8');
  const checksum = createHash('sha256').update(migration).digest('hex');
  if (!/^\s*(?:--[^\n]*\n\s*)*begin;/i.test(migration) || !/commit;\s*$/i.test(migration)) throw new Error('Every migration must have a transaction boundary.');
  if (tracked) {
    const history = await query(`select checksum from orbit_private.schema_migrations where version='${version}'`);
    if (history.length) {
      if (history[0]?.checksum !== checksum) throw new Error('Migration history differs; review required. No changes applied to this version.');
      console.log(`Orbit migration ${version} already applied with the expected checksum.`);
      continue;
    }
  }
  const tracking = tracked ? '' : 'create table orbit_private.schema_migrations(version text primary key, checksum text not null, applied_at timestamptz not null default now());\n';
  const sql = migration.replace(/commit;\s*$/i, `${tracking}insert into orbit_private.schema_migrations(version,checksum) values('${version}','${checksum}');\ncommit;`);
  await query(sql); console.log(`Applied Orbit migration ${version} to ${project}.`);
  tracked = true;
}
