import {redirect} from 'next/navigation';
import {ProfilePage} from '@/components/profile-page';
import {accountProfile, profilePasswordMode} from '@/lib/profile';
import {isConfigured, supabase} from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const metadata = {title: 'Profile — Orbit'};

export default async function Profile() {
  if (!isConfigured()) redirect('/login?setup=required');
  const {data: {user}, error} = await (await supabase()).auth.getUser();
  if (error || !user) redirect('/login');
  return <ProfilePage initialProfile={accountProfile(user)} passwordMode={profilePasswordMode(user)}/>;
}
