import {redirect} from 'next/navigation';
import {Footer, PublicHeader} from '@/components/brand';
import {LegalAcceptanceForm} from '@/components/legal-acceptance-form';
import {getLegalStatus} from '@/lib/legal-acceptance';
import {isConfigured, supabase} from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const metadata = {title: 'Review service terms — Orbit', robots: {index: false, follow: false}};
export default async function AcceptTerms() {
  if (!isConfigured()) redirect('/login?setup=required');
  const client = await supabase();
  const {data: {user}, error} = await client.auth.getUser();
  if (error || !user) redirect('/login');
  let status;
  try {status = await getLegalStatus(client);} catch {/* The form supports a safe retry without granting access. */}
  if (status && !status.required) redirect('/app');
  return <div className="entry-shell"><PublicHeader auth/><main className="legal-acceptance-main"><LegalAcceptanceForm email={user.email || ''} initialError={status ? '' : 'Unable to check your agreement. Please try again.'}/></main><Footer/></div>;
}
