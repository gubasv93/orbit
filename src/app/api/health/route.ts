import { NextResponse } from 'next/server';
import { isConfigured } from '@/lib/supabase';
export function GET() {
  return NextResponse.json({ service: 'orbit', configured: isConfigured() }, { headers: { 'Cache-Control': 'no-store' } });
}
