import type {NextRequest} from 'next/server';
import {adminClient} from './application-admin-server';

/** Classify document loads without retaining any request metadata. */
export function shouldCountLandingPageview(request: NextRequest) {
  if (request.method !== 'GET' || request.nextUrl.pathname !== '/') return false;
  if (process.env.VERCEL_ENV === 'preview') return false;
  if (process.env.VERCEL_ENV === 'production' && process.env.APP_URL) {
    try { if (request.nextUrl.host !== new URL(process.env.APP_URL).host) return false; }
    catch { return false; }
  }
  const headers = request.headers;
  if (!headers.get('accept')?.toLowerCase().includes('text/html')) return false;
  const destination = headers.get('sec-fetch-dest');
  if (destination && destination !== 'document') return false;
  if (headers.has('rsc') || headers.has('next-router-prefetch') || headers.has('next-router-segment-prefetch') || headers.has('x-nextjs-data') || request.nextUrl.searchParams.has('_rsc')) return false;
  if (/prefetch|prerender/i.test(`${headers.get('purpose') || ''} ${headers.get('sec-purpose') || ''}`)) return false;
  if (/bot|crawler|spider|slurp|headlesschrome|facebookexternalhit|preview|lighthouse|pingdom|curl|wget|python-requests|go-http-client/i.test(headers.get('user-agent') || '')) return false;
  return true;
}

/** Only a UTC-day counter reaches storage. Failure must never block the website. */
export async function recordLandingPageview(request: NextRequest): Promise<void> {
  if (!shouldCountLandingPageview(request)) return;
  try {
    await adminClient().rpc('orbit_record_landing_pageview').abortSignal(AbortSignal.timeout(1200));
  } catch { /* Aggregate statistics are best effort; the landing page stays available. */ }
}
