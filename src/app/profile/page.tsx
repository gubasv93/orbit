import {redirect} from 'next/navigation';
import {ProfilePage} from '@/components/profile-page';
import {accountProfile, profilePasswordMode} from '@/lib/profile';
import {isConfigured, supabase} from '@/lib/supabase';
import {workspaceContext} from '@/lib/workspace-context';

export const dynamic = 'force-dynamic';
export const metadata = {title: 'Profile — Orbit'};

export default async function Profile({searchParams}: {searchParams: Promise<{project?: string}>}) {
  if (!isConfigured()) redirect('/login?setup=required');
  const client = await supabase();
  const {data: {user}, error} = await client.auth.getUser();
  if (error || !user) redirect('/login');
  const {project} = await searchParams;
  const context = await workspaceContext(client, project);
  return <ProfilePage initialProfile={accountProfile(user)} passwordMode={profilePasswordMode(user)} {...context}/>;
}
