// Applies only the versioned, additive Orbit migration to the explicitly selected project.
// Authentication must come from a secure environment binding, never CLI arguments.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) throw new Error('Set SUPABASE_ACCESS_TOKEN securely in environment settings.');
const project = 'vvvptboxmyibdfzfqxzz', version = '20261023000100';
const migration = readFileSync(new URL(`../supabase/migrations/${version}_orbit.sql`, import.meta.url), 'utf8');
const checksum = createHash('sha256').update(migration).digest('hex');
async function query(sql) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${project}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: sql }), signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Error(`Supabase query failed (HTTP ${response.status}); response contents suppressed.`);
  return response.json();
}
const existing = await query("select to_regclass('public.orbit_workspaces') is not null as present, to_regclass('orbit_private.schema_migrations') is not null as tracked, to_regnamespace('orbit_private') is not null as namespace_present");
if (existing[0]?.present) {
  if (!existing[0]?.tracked) throw new Error('Existing untracked Orbit tables found; refusing to overwrite them.');
  const history = await query(`select checksum from orbit_private.schema_migrations where version='${version}'`);
  if (history[0]?.checksum !== checksum) throw new Error('Migration history differs; review required. No changes applied.');
  console.log('Orbit migration already applied with the expected checksum.');
} else {
  if (existing[0]?.namespace_present) throw new Error('An existing Orbit private schema needs review before first migration.');
  const sql = migration.replace(/commit;\s*$/i, `create table orbit_private.schema_migrations(version text primary key, checksum text not null, applied_at timestamptz not null default now());\ninsert into orbit_private.schema_migrations(version,checksum) values('${version}','${checksum}');\ncommit;`);
  await query(sql); console.log(`Applied Orbit migration ${version} to ${project}.`);
}
