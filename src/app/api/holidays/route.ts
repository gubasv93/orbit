import {NextRequest,NextResponse} from 'next/server';
import {isConfigured,supabase} from '@/lib/supabase';
import {legalApiGate} from '@/lib/legal-acceptance';
import {HolidayCalendarError,publicHolidayCalendar,publicHolidayCountries} from '@/lib/public-holiday-calendar';

export const dynamic='force-dynamic';
function response(body:unknown,status=200){return NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});}
export async function GET(request:NextRequest){
  try{
    if(!isConfigured())return response({error:'Please log in.'},401);
    const client=await supabase(),{data:{user},error}=await client.auth.getUser();
    if(error||!user)return response({error:'Please log in.'},401);
    const legal=await legalApiGate(client);if(legal)return legal;
    const parameters=request.nextUrl.searchParams;
    if([...parameters.keys()].some(key=>!['action','country','state','region','year'].includes(key)))return response({error:'Choose valid calendar options.'},400);
    if(parameters.get('action')==='countries'){
      if([...parameters.keys()].some(key=>key!=='action'))return response({error:'Choose valid calendar options.'},400);
      return response(publicHolidayCountries());
    }
    if(parameters.has('action'))return response({error:'Choose a valid calendar action.'},400);
    const country=parameters.get('country')||'',year=parameters.get('year');
    const calendar=publicHolidayCalendar({country,year:year===null?new Date().getUTCFullYear():Number(year),
      ...(parameters.get('state')?{state:parameters.get('state')!}:{}),...(parameters.get('region')?{region:parameters.get('region')!}:{})});
    return response(calendar);
  }catch(error){
    if(error instanceof HolidayCalendarError)return response({error:error.message},error.status);
    console.error('holiday_calendar_read_failed');
    return response({error:'The holiday calendar could not be loaded. Please retry.'},503);
  }
}
