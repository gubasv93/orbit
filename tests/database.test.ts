import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { fullWorkspace } from './fixtures';
let db: PGlite;
const a = '11111111-1111-4111-8111-111111111111', b = '22222222-2222-4222-8222-222222222222';
async function user(id: string | null) { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id || '']); await db.exec(`set role ${id ? 'authenticated' : 'anon'}`); }
async function load() { return (await db.query<{ result: { revision: number; workspace: ReturnType<typeof fullWorkspace> } }>('select public.orbit_get_workspace() as result')).rows[0].result; }
async function save(workspace: unknown, revision: number) { return (await db.query<{ revision: number }>('select public.orbit_save_workspace($1::jsonb,$2) as revision', [JSON.stringify(workspace), revision])).rows[0].revision; }

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create schema auth; grant usage on schema auth to anon,authenticated;
  create table auth.users(id uuid primary key); insert into auth.users values('${a}'),('${b}');
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`);
  const migrations = new URL('../supabase/migrations/', import.meta.url);
  for (const file of readdirSync(migrations).filter(name => /^\d{14}_[a-z0-9_]+\.sql$/.test(name)).sort()) {
    await db.exec(readFileSync(new URL(file, migrations), 'utf8'));
  }
});
afterAll(async () => { await db?.close(); });
describe('PostgreSQL ownership, RLS, and atomic persistence', () => {
  it('boots empty workspaces idempotently without demo data', async () => {
    await user(a); const first = await load(); const second = await load(); expect(first).toEqual(second); expect(first.workspace.projects).toEqual([]);
    expect((await db.query('select * from public.orbit_workspaces')).rows).toHaveLength(1);
  });
  it('round-trips every planning entity through normalized tables', async () => {
    await user(a); const before = await load(); const next = await save(fullWorkspace(), before.revision);
    const after = await load(); expect(after.revision).toBe(next); expect(after.workspace).toEqual(fullWorkspace());
  });
  it('allows the same project and task IDs for different users without sharing data', async () => {
    await user(b); const initial = await load(); const workspace = fullWorkspace(); workspace.projects[0].name = 'B private project';
    await save(workspace, initial.revision); expect((await load()).workspace.projects[0].name).toBe('B private project');
    await user(a); expect((await load()).workspace.projects[0].name).toBe('My project');
  });
  it('persists and clears manual epic effort without losing work-item estimates', async () => {
    await user(a);const before=await load(),workspace=fullWorkspace();workspace.projects[0].data.features[0].effortOverride=13.5;
    await save(workspace,before.revision);const manual=await load();expect(manual.workspace).toEqual(workspace);
    delete workspace.projects[0].data.features[0].effortOverride;await save(workspace,manual.revision);
    const automatic=await load();expect(automatic.workspace).toEqual(fullWorkspace());
  });
  it('round-trips role assignments and manual windows in the existing task/feature documents', async () => {
    await user(a);const before=await load(),workspace=fullWorkspace();
    workspace.projects[0].data.tasks[0].roleId='r1';workspace.projects[0].data.tasks[0].manualEnd='2026-11-02';
    workspace.projects[0].data.features[0].manualEnd='2026-11-03';
    await save(workspace,before.revision);expect((await load()).workspace).toEqual(workspace);
  });
  it('denies cross-user reads and direct writes on every private table', async () => {
    await user(a); const ownerWorkspace = (await db.query<{ id: string }>('select id from public.orbit_workspaces')).rows[0].id;
    await user(b);
    const tables = ['workspace_memberships','user_settings','projects','project_settings','roles','features','people','iterations','recurring_meetings','work_items','time_off','milestones','holidays','capacity_settings','dependencies','meeting_attendees','milestone_features'];
    for (const table of tables) {
      expect((await db.query(`select * from public.orbit_${table} where workspace_id=$1`, [ownerWorkspace])).rows, table).toEqual([]);
      await expect(db.query(`delete from public.orbit_${table} where workspace_id=$1`, [ownerWorkspace]), table).rejects.toThrow(/permission denied/);
    }
    expect((await db.query('select * from public.orbit_workspaces where id=$1', [ownerWorkspace])).rows).toEqual([]);
    await expect(db.query('update public.orbit_workspaces set revision=99 where id=$1', [ownerWorkspace])).rejects.toThrow(/permission denied/);
  });
  it('rejects stale writes without changing saved data', async () => {
    await user(a); const before = await load(); await expect(save(fullWorkspace(), before.revision - 1)).rejects.toMatchObject({ code: 'PT409' }); expect(await load()).toEqual(before);
  });
  it('rolls back invalid references and cycles, including attempted replacement', async () => {
    await user(a); const before = await load(); const invalid = fullWorkspace(); invalid.projects[0].data.tasks[0].assignee = 'foreign-person';
    await expect(save(invalid, before.revision)).rejects.toThrow(/foreign key/); expect(await load()).toEqual(before);
    const cyclic = fullWorkspace(); cyclic.projects[0].data.tasks[0].dependsOn = ['t2'];
    await expect(save(cyclic, before.revision)).rejects.toThrow(/Circular dependency/); expect(await load()).toEqual(before);
  });
  it('denies anonymous RPC and data access', async () => {
    await user(null); await expect(load()).rejects.toThrow(/permission denied/);
    await expect(save(fullWorkspace(), 0)).rejects.toThrow(/permission denied/);
    await expect(db.query('select * from public.orbit_projects')).rejects.toThrow(/permission denied/);
    await expect(db.query('select * from orbit_private.auth_attempts')).rejects.toThrow(/permission denied/);
  });
  it('limits authentication attempts and does not expose the buckets', async () => {
    await user(null); const allowed = [];
    for (let i=0;i<6;i++) allowed.push((await db.query<{ result: boolean }>('select public.orbit_auth_allow($1,$2) as result', ['a'.repeat(64),'signup'])).rows[0].result);
    expect(allowed).toEqual([true,true,true,true,true,false]);
  });
});
