import {NextRequest} from 'next/server';
import {z} from 'zod';
import {adminClient} from '@/lib/application-admin-server';
import {requireManager} from '@/lib/application-manager-auth';
import {managerFailure,managerJson} from '@/lib/application-manager-api';
import {minimalAnalytics} from '@/lib/minimal-analytics';
import {parseAnalyticsTrends} from '@/lib/application-analytics-trends';

export const dynamic='force-dynamic';
export async function GET(request:NextRequest){
  try{
    const manager=await requireManager();
    const days=z.coerce.number().int().refine(value=>[7,30,90,365].includes(value)).safeParse(request.nextUrl.searchParams.get('days')||30);
    const user=z.uuid().optional().safeParse(request.nextUrl.searchParams.get('user')||undefined);
    if(!days.success||!user.success)return managerJson({error:'Choose a valid reporting period and user.'},400);
    const client=adminClient();
    const [inventory,pageviews,trends]=await Promise.all([
      client.rpc('orbit_application_analytics',{p_user_id:user.data||null,p_days:days.data}),
      client.rpc('orbit_landing_pageviews',{p_days:days.data}),
      client.rpc('orbit_application_analytics_trends',{p_user_id:user.data||null,p_days:days.data}),
    ]);
    if(inventory.error||pageviews.error||trends.error)throw new Error('Analytics unavailable.');
    const safeTrends=parseAnalyticsTrends(trends.data,{periodDays:days.data,userId:user.data||null});
    return managerJson({analytics:{...minimalAnalytics(inventory.data,pageviews.data),trends:safeTrends},manager:{email:manager.email,mfaEnabled:manager.mfaEnabled}});
  }catch(error){return managerFailure(error);}
}
