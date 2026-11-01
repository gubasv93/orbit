import {NextRequest, NextResponse} from 'next/server';
import {acceptCurrentLegal} from '@/lib/legal-acceptance';
import {legalAcceptanceSchema} from '@/lib/legal';
import {limitedJson, sameOrigin} from '@/lib/http';
import {isConfigured, supabase} from '@/lib/supabase';

export const dynamic = 'force-dynamic';
const reply = (data: unknown, status = 200) => NextResponse.json(data, {status, headers: {'Cache-Control': 'private, no-store'}});
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return reply({error: 'Request origin is not allowed.'}, 403);
  let input: unknown;
  try {input = await limitedJson(request, 2048);} catch {return reply({error: 'Invalid agreement request.'}, 400);}
  const parsed = legalAcceptanceSchema.strict().safeParse(input);
  if (!parsed.success) return reply({error: parsed.error.issues[0]?.message || 'Please review the current service terms.'}, 400);
  if (!isConfigured()) return reply({error: 'Authentication is temporarily unavailable.'}, 503);
  try {
    const client = await supabase();
    const {data: {user}, error} = await client.auth.getUser();
    if (error || !user) return reply({error: 'Please log in.'}, 401);
    await acceptCurrentLegal(client);
    return reply({ok: true, redirectTo: '/app'});
  } catch {return reply({error: 'Unable to record your agreement. Please retry.'}, 503);}
}
