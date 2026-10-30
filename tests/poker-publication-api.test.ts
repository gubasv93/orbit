import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../src/app/api/poker/[token]/publish/route';
import { fullWorkspace } from './fixtures';

// Route-level regression tests: the real request parser, validation and publication
// planner run unchanged. Only the remote authentication/RPC boundary is replaced,
// so the otherwise timing-dependent commit interleavings are deterministic.
const backend = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn() }));
vi.mock('../src/lib/supabase', () => ({
  isConfigured: () => true,
  supabase: async () => ({ auth: { getUser: backend.getUser }, rpc: backend.rpc }),
}));

const token = 'a'.repeat(64), operationId = '11111111-1111-4111-8111-111111111111';
const app = 'https://orbit.example', projectId = 'project-shared-id';
const receipt = { revision: 2, projectId, featureId: 'f1', taskIds: ['t1'] };
const body = { operationId, revision: 1, kind: 'story', featureId: 'f1', taskId: 't1', title: 'API', teams: [{ roleId: 'r1', effort: 4 }] };
function request() {
  return POST(new NextRequest(`${app}/api/poker/${token}/publish`, {
    method: 'POST', headers: { Origin: app, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }), { params: Promise.resolve({ token }) });
}
function ownerRoom() { return { data: { self: { owner: true }, room: { projectId, closed: false } }, error: null }; }
function ok(data: unknown) { return { data, error: null }; }
const publications = () => backend.rpc.mock.calls.filter(([name]) => name === 'orbit_poker_publish');

beforeEach(() => {
  vi.stubEnv('APP_URL', app);
  backend.getUser.mockReset(); backend.rpc.mockReset();
  backend.getUser.mockResolvedValue({ data: { user: { id: 'owner-user' } }, error: null });
});

afterEach(() => { vi.unstubAllEnvs(); });

describe('Planning Poker publication HTTP idempotency under concurrent commits', () => {
  it('returns the successful receipt when the same operation commits between its first lookup and workspace read', async () => {
    let lookups = 0;
    backend.rpc.mockImplementation(async (name, input) => {
      if (name === 'orbit_poker' && input.p_action === 'publication') {
        expect(input.p_input.operationId).toBe(operationId);
        return ok(++lookups === 1 ? null : receipt);
      }
      if (name === 'orbit_poker' && input.p_action === 'state') return ownerRoom();
      // The other request has now committed this exact operation, incrementing
      // the workspace revision before this request gets its snapshot.
      if (name === 'orbit_get_workspace') return ok({ revision: 2, workspace: fullWorkspace() });
      throw new Error('The already committed operation must not be published twice');
    });
    const response = await request();
    expect(response.status).toBe(200); expect(await response.json()).toEqual(receipt);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(lookups).toBe(2); expect(publications()).toHaveLength(0);
  });

  it('keeps a genuine revision conflict when another operation committed and this operation has no receipt', async () => {
    let lookups = 0;
    const otherOperation = '22222222-2222-4222-8222-222222222222';
    const receipts = new Map([[otherOperation, receipt]]);
    backend.rpc.mockImplementation(async (name, input) => {
      if (name === 'orbit_poker' && input.p_action === 'publication') {
        lookups++; return ok(receipts.get(input.p_input.operationId) || null);
      }
      if (name === 'orbit_poker' && input.p_action === 'state') return ownerRoom();
      if (name === 'orbit_get_workspace') return ok({ revision: 2, workspace: fullWorkspace() });
      throw new Error('A stale unrelated edit must not overwrite the workspace');
    });
    const response = await request();
    expect(response.status).toBe(409); expect(await response.json()).toMatchObject({ code: 'revision_conflict' });
    expect(lookups).toBe(2); expect(publications()).toHaveLength(0);
  });

  it.each(['PT409', '40001'])('recovers the original receipt after a %s publication conflict', async code => {
    let committed = false;
    backend.rpc.mockImplementation(async (name, input) => {
      if (name === 'orbit_poker' && input.p_action === 'publication') return ok(committed ? receipt : null);
      if (name === 'orbit_poker' && input.p_action === 'state') return ownerRoom();
      if (name === 'orbit_get_workspace') return ok({ revision: 1, workspace: fullWorkspace() });
      if (name === 'orbit_poker_publish') {
        // This request passed its snapshot check, but an equal operation wins
        // before the write. A conflict response must not hide that success.
        expect(input.p_operation_id).toBe(operationId); expect(input.p_expected_revision).toBe(1);
        committed = true; return { data: null, error: { code, message: 'Concurrent commit' } };
      }
      throw new Error('Unexpected RPC');
    });
    const response = await request();
    expect(response.status).toBe(200); expect(await response.json()).toEqual(receipt);
    expect(publications()).toHaveLength(1);
  });

  it('rejects an unauthenticated guest before accessing room or workspace RPCs', async () => {
    backend.getUser.mockResolvedValue({ data: { user: null }, error: null });
    const response = await request();
    expect(response.status).toBe(401); expect(backend.rpc).not.toHaveBeenCalled();
  });

  it('rejects an authenticated visitor who is not the room owner without reading private workspace data', async () => {
    backend.rpc.mockImplementation(async (name, input) => {
      if (name === 'orbit_poker' && input.p_action === 'publication') return { data: null, error: { code: '42501', message: 'Only the facilitator can publish' } };
      throw new Error('A visitor must not reach workspace or publication RPCs');
    });
    const response = await request();
    expect(response.status).toBe(403); expect(publications()).toHaveLength(0);
    expect(backend.rpc.mock.calls.some(([name]) => name === 'orbit_get_workspace')).toBe(false);
  });
});
