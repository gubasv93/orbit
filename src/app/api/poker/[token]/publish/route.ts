import { NextRequest, NextResponse } from 'next/server';
import { isConfigured, supabase } from '@/lib/supabase';
import { limitedJson, problem, sameOrigin } from '@/lib/http';
import { workspaceSchema } from '@/lib/schema';
import { planPokerPublication, pokerPublicationSchema, PokerPublicationError } from '@/lib/poker-publication';

export const dynamic = 'force-dynamic';
const headers = {'Cache-Control':'private, no-store'};
function failure(error:{code?:string;message?:string}) {
  if(error.code==='PT409'||error.code==='40001')return NextResponse.json({error:'Another tab or device saved newer changes. Reload the story before publishing.',code:'revision_conflict'},{status:409,headers});
  if(error.code==='PT401')return problem('Please log in as the room facilitator.',401);
  if(error.code==='42501'||error.code==='PT403')return problem('Only the room facilitator can publish Orbit work.',403);
  if(error.code==='PT404'||error.code==='P0002')return problem('This room or story is no longer available.',404);
  if(error.code==='PT429')return problem('Too many requests. Please wait and retry.',429);
  if(error.code==='22023'||error.code==='23514')return problem(error.message||'Invalid publication.');
  console.error('poker_publication_failed',{code:error.code});return problem('The story could not be saved. Retry with the same request or reload.',503);
}
export async function POST(request:NextRequest,context:{params:Promise<{token:string}>}) {
  if(!sameOrigin(request))return problem('Request origin is not allowed.',403);
  if(!isConfigured())return problem('Planning Poker is unavailable.',503);
  const client=await supabase(),{data:{user},error:authError}=await client.auth.getUser();
  if(authError||!user)return problem('Please log in as the room facilitator.',401);
  const {token}=await context.params;if(!/^[a-f0-9]{64}$/.test(token))return problem('Room not found.',404);
  let raw:unknown;try{raw=await limitedJson(request,250_000);}catch{return problem('Invalid or oversized publication.');}
  const parsed=pokerPublicationSchema.safeParse(raw);if(!parsed.success)return problem(parsed.error.issues[0]?.message||'Invalid publication.');
  const input=parsed.data;
  // Completed requests are resolved before reading a newer workspace revision. A network retry cannot duplicate work.
  const replay=await client.rpc('orbit_poker',{p_action:'publication',p_token:token,p_session:'',p_input:{operationId:input.operationId}});
  if(replay.error)return failure(replay.error);if(replay.data)return NextResponse.json(replay.data,{headers});
  const room=await client.rpc('orbit_poker',{p_action:'state',p_token:token,p_session:'',p_input:{issue:'free'}});
  if(room.error)return failure(room.error);
  if(!room.data?.self?.owner)return problem('Only the room facilitator can publish Orbit work.',403);
  if(room.data.room?.closed)return problem('This room is closed.',409);
  const loaded=await client.rpc('orbit_get_workspace');if(loaded.error)return failure(loaded.error);
  if(loaded.data?.revision!==input.revision)return NextResponse.json({error:'Another tab or device saved newer changes. Reload the story before publishing.',code:'revision_conflict'},{status:409,headers});
  try{
    const plan=planPokerPublication(workspaceSchema.parse(loaded.data.workspace),room.data.room.projectId,input);
    const saved=await client.rpc('orbit_poker_publish',{p_token:token,p_expected_revision:input.revision,p_snapshot:plan.workspace,p_operation_id:input.operationId,p_story_key:plan.storyKey,p_result:plan.result});
    if(saved.error)return failure(saved.error);
    return NextResponse.json(saved.data,{headers});
  }catch(error){
    if(error instanceof PokerPublicationError)return NextResponse.json({error:error.message,code:error.code},{status:error.status,headers});
    if(error instanceof Error&&error.name==='ZodError')return problem('Check the story fields and role estimates.');
    console.error('poker_publication_invalid',{kind:input.kind});return problem('The story could not be saved. Your existing work was kept.');
  }
}
