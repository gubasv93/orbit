import { NextRequest, NextResponse } from 'next/server';
import { isConfigured, supabase } from '@/lib/supabase';
export async function GET(request: NextRequest) {
  const origin = process.env.APP_URL || request.nextUrl.origin;
  const code = request.nextUrl.searchParams.get('code');
  if (code && isConfigured()) {
    const { error } = await (await supabase()).auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL('/app', origin));
  }
  return NextResponse.redirect(new URL('/login?confirmation=failed', origin));
}
