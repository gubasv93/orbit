import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import {createClient} from '@supabase/supabase-js';

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  // Check before rendering starts: an async notFound() inside a streamed page
  // can otherwise send status 200 even though the setup form is unavailable.
  if(request.nextUrl.pathname==='/applicationmanager/bootstrap'){
    let available=false;
    try{
      if(process.env.SUPABASE_URL&&process.env.SUPABASE_SERVICE_ROLE_KEY&&process.env.APPLICATION_MANAGER_ENCRYPTION_KEY){
        const server=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
        const {data,error}=await server.rpc('orbit_manager_auth',{p_action:'bootstrap-available',p_input:{}});available=!error&&data===true;
      }
    }catch{/* An unavailable backend never opens administrator registration. */}
    if(available){response.headers.set('Cache-Control','private, no-store');response.headers.set('Referrer-Policy','no-referrer');return response;}
    return new NextResponse('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Setup link unavailable — Orbit</title><style>body{margin:0;background:#f7f8fa;color:#25272d;font:16px system-ui,sans-serif}main{max-width:440px;margin:16vh auto;padding:32px;border:1px solid #e0e2e8;border-radius:20px;background:white}h1{font-size:28px}p{line-height:1.7;color:#646873}a{display:inline-block;margin-top:12px;color:#495aba}@media(max-width:520px){main{margin:10vh 16px;padding:24px}}</style><main><b>orbit</b><h1>Setup link unavailable</h1><p>This invitation is invalid, expired or has already been used. Administrator registration is closed.</p><a href="/applicationmanager">Administrator sign in</a></main></html>',{status:404,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff'}});
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_PUBLISHABLE_KEY) {
    return (request.nextUrl.pathname.startsWith('/app') || request.nextUrl.pathname.startsWith('/profile'))
      ? NextResponse.redirect(new URL('/login?setup=required', request.url)) : response;
  }
  const client = createServerClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, {
    cookieOptions: { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/' },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(values) {
        values.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const { data: { user } } = await client.auth.getUser();
  response.headers.set('Cache-Control', 'private, no-store');
  if (!user && (request.nextUrl.pathname.startsWith('/app') || request.nextUrl.pathname.startsWith('/profile'))) {
    const redirect = NextResponse.redirect(new URL('/login', request.url));
    response.cookies.getAll().forEach(cookie => redirect.cookies.set(cookie));
    redirect.headers.set('Cache-Control', 'private, no-store');
    return redirect;
  }
  return response;
}
export const config = { matcher: ['/app/:path*', '/profile/:path*', '/how-it-works', '/poker/:path*', '/api/workspace/:path*','/applicationmanager/bootstrap'] };
