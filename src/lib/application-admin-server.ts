import {createClient, type SupabaseClient} from '@supabase/supabase-js';

/** Server routes only. Never import into a client component or expose this key. */
export function adminClient(): SupabaseClient {
  const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)throw new Error('Application management is not configured.');
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
}
