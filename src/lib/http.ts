import { NextRequest, NextResponse } from 'next/server';

export function sameOrigin(request: NextRequest) {
  const origin = request.headers.get('origin');
  const expected = process.env.APP_URL ? new URL(process.env.APP_URL).origin : request.nextUrl.origin;
  return Boolean(origin && origin === expected && request.headers.get('sec-fetch-site') !== 'cross-site');
}
export const problem = (message: string, status = 400) => NextResponse.json({ error: message }, { status });
export async function limitedJson(request: NextRequest, limit = 5_000_000) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new Error('Expected JSON');
  if (Number(request.headers.get('content-length') || 0) > limit) throw new Error('Request too large');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Missing body');
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.byteLength; if (length > limit) { await reader.cancel(); throw new Error('Request too large'); }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } finally { reader.releaseLock(); }
}
