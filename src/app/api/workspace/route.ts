import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { workspaceSchema } from '@/lib/schema';
import { isConfigured, supabase } from '@/lib/supabase';
import { limitedJson, problem, sameOrigin } from '@/lib/http';

export const dynamic = 'force-dynamic';
async function session() {
  if (!isConfigured()) return null;
  const client = await supabase();
  const { data: { user }, error } = await client.auth.getUser();
  return error || !user ? null : { client, user };
}
export async function GET(request: NextRequest) {
  const auth = await session();
  if (!auth) return problem('Please log in.', 401);
  const { data, error } = await auth.client.rpc('orbit_get_workspace');
  if (error) { console.error('workspace_read_failed', { code: error.code }); return problem('Unable to load your workspace. Please retry.', 503); }
  return NextResponse.json(request.nextUrl.searchParams.get('revisionOnly') === '1' ? { revision: data.revision } : { ...data, email: auth.user.email }, { headers: { 'Cache-Control': 'private, no-store' } });
}
export async function PUT(request: NextRequest) {
  if (!sameOrigin(request)) return problem('Request origin is not allowed.', 403);
  const auth = await session();
  if (!auth) return problem('Please log in.', 401);
  let input: unknown;
  try { input = await limitedJson(request); } catch { return problem('Invalid or oversized request.'); }
  const parsed = z.object({ revision: z.number().int().min(0), workspace: workspaceSchema }).safeParse(input);
  if (!parsed.success) return problem(parsed.error.issues[0]?.message || 'Invalid workspace.');
  const { data, error } = await auth.client.rpc('orbit_save_workspace', { p_snapshot: parsed.data.workspace, p_expected_revision: parsed.data.revision });
  if (error) {
    if (error.code === 'PT409' || error.code === '40001') return problem('Another tab or device saved newer changes. Export your unsaved work, then reload.', 409);
    console.error('workspace_save_failed', { code: error.code });
    return problem('Your changes could not be saved. Retry or export a backup.', 503);
  }
  return NextResponse.json({ revision: data }, { headers: { 'Cache-Control': 'private, no-store' } });
}
