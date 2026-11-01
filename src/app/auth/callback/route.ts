import { NextRequest, NextResponse } from 'next/server';
import { isConfigured, supabase } from '@/lib/supabase';
import {acceptCurrentLegal, getLegalStatus} from '@/lib/legal-acceptance';
import {legalReceiptCookie, legalReceiptCookieOptions, verifyLegalReceipt} from '@/lib/legal-receipt';
export async function GET(request: NextRequest) {
  const origin = new URL(process.env.APP_URL || request.nextUrl.origin).origin;
  const redirect = (path: string) => {
    const response = NextResponse.redirect(new URL(path, origin));
    response.headers.set('Cache-Control', 'private, no-store');
    response.headers.set('Referrer-Policy', 'no-referrer');
    response.cookies.set(legalReceiptCookie, '', {...legalReceiptCookieOptions(), maxAge: 0});
    return response;
  };
  const providerError = request.nextUrl.searchParams.get('error');
  if (providerError) return redirect(providerError === 'access_denied' ? '/login?oauth=cancelled' : '/login?oauth=failed');
  const code = request.nextUrl.searchParams.get('code');
  if (code && isConfigured()) {
    try {
      const client = await supabase();
      const { error } = await client.auth.exchangeCodeForSession(code);
      if (!error) {
        try {
          const status = await getLegalStatus(client);
          if (status.required) {
            if (!verifyLegalReceipt(request.cookies.get(legalReceiptCookie)?.value)) return redirect('/accept-terms');
            await acceptCurrentLegal(client);
          }
          return redirect('/app');
        } catch {return redirect('/accept-terms?retry=1');}
      }
    } catch { /* Network failures must return to a usable login screen. */ }
  }
  return redirect('/login?auth=failed');
}
