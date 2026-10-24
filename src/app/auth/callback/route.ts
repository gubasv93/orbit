import { NextRequest, NextResponse } from 'next/server';
import { isConfigured, supabase } from '@/lib/supabase';
export async function GET(request: NextRequest) {
  const origin = new URL(process.env.APP_URL || request.nextUrl.origin).origin;
  const redirect = (path: string) => {
    const response = NextResponse.redirect(new URL(path, origin));
    response.headers.set('Cache-Control', 'private, no-store');
    response.headers.set('Referrer-Policy', 'no-referrer');
    return response;
  };
  const providerError = request.nextUrl.searchParams.get('error');
  if (providerError) return redirect(providerError === 'access_denied' ? '/login?oauth=cancelled' : '/login?oauth=failed');
  const code = request.nextUrl.searchParams.get('code');
  if (code && isConfigured()) {
    try {
      const { error } = await (await supabase()).auth.exchangeCodeForSession(code);
      if (!error) return redirect('/app');
    } catch { /* Network failures must return to a usable login screen. */ }
  }
  return redirect('/login?auth=failed');
}
