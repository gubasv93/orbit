import { NextResponse } from 'next/server';
import { supabase, isConfigured } from './supabase';
import { problem } from './http';
import { z } from 'zod';
import { accountProfile } from './profile';

export const pokerToken = z.string().regex(/^[a-f0-9]{64}$/);
export const pokerIssue = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/).default('free');
export const pokerDeck = z.array(z.string().trim().min(1).max(12)).min(2).max(30).refine(values => new Set(values).size === values.length, 'Deck values must be unique');
export const pokerSettings = z.object({ autoReveal: z.boolean().default(false), showAverage: z.boolean().default(true), countdown: z.boolean().default(true) });
export const pokerCookie = (token: string) => `orbit_poker_${token.slice(0,24)}`;
export const pokerJson = (value: unknown) => NextResponse.json(value, { headers: { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' } });
export async function pokerClient() {
  if (!isConfigured()) throw new Error('Poker is not configured.');
  const client = await supabase();
  const { data: { user } } = await client.auth.getUser();
  return { client, user, ownerName: user ? accountProfile(user).displayName : undefined };
}
export function pokerFailure(error: {code?: string; message?: string}) {
  const status = ({PT401:401,PT404:404,PT409:409,PT429:429,'42501':403,'22023':400,'22P02':400} as Record<string,number>)[error.code || ''] || 503;
  if (status === 503) {
    console.error('poker_operation_failed', { code: error.code || 'provider_error' });
    return problem('Planning Poker is temporarily unavailable. Please retry.',503);
  }
  return problem(status === 400 && error.code !== '22023' ? 'Invalid poker request.' : error.message || 'Unable to complete this poker action.',status);
}
