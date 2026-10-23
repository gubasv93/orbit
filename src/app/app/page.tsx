import { redirect } from 'next/navigation';
import { isConfigured, supabase } from '@/lib/supabase';
import { Planner } from '@/components/planner';
export const dynamic = 'force-dynamic';
export default async function App() {
  if (!isConfigured()) redirect('/login?setup=required');
  const { data: { user }, error } = await (await supabase()).auth.getUser();
  if (error || !user) redirect('/login');
  return <Planner/>;
}
