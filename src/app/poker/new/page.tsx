import {redirect} from 'next/navigation';
import {isConfigured,supabase} from '@/lib/supabase';
import {CreatePokerRoom} from '@/components/planning-poker';
import {workspaceContext} from '@/lib/workspace-context';
export const dynamic='force-dynamic';
export const metadata={title:'Create Poker Room — Orbit'};
export default async function NewPokerRoom({searchParams}:{searchParams:Promise<{project?:string}>}){
 if(!isConfigured())redirect('/login?setup=required');
 const client=await supabase();
 const {data:{user},error}=await client.auth.getUser();if(error||!user)redirect('/login');
 const params=await searchParams,context=await workspaceContext(client,params.project);
 if(!context.projectId)redirect('/app');
 return <CreatePokerRoom projectId={context.projectId}/>;
}
