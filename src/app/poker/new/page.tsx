import {redirect} from 'next/navigation';
import {isConfigured,supabase} from '@/lib/supabase';
import {CreatePokerRoom} from '@/components/planning-poker';
export const dynamic='force-dynamic';
export const metadata={title:'Create Poker Room — Orbit'};
export default async function NewPokerRoom({searchParams}:{searchParams:Promise<{project?:string}>}){
 if(!isConfigured())redirect('/login?setup=required');
 const {data:{user},error}=await (await supabase()).auth.getUser();if(error||!user)redirect('/login');
 const params=await searchParams;return <CreatePokerRoom projectId={params.project||''}/>;
}
