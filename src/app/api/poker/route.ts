import { randomBytes } from 'node:crypto';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { limitedJson, problem, sameOrigin } from '@/lib/http';
import { pokerClient, pokerDeck, pokerFailure, pokerJson, pokerSettings } from '@/lib/poker-server';
export const dynamic='force-dynamic';
const projectId=z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
const create=z.discriminatedUnion('action',[
 z.object({action:z.literal('create'),projectId,name:z.string().trim().min(1).max(100),deck:pokerDeck,settings:pokerSettings.default({autoReveal:false,showAverage:true,countdown:true})}),
 z.object({action:z.literal('save-deck'),projectId,name:z.string().trim().min(1).max(60),values:pokerDeck}),
]);
export async function GET(request:NextRequest) {
 try {
  const parsed=projectId.safeParse(request.nextUrl.searchParams.get('project'));if(!parsed.success)return problem('Choose the current Orbit project.');
  const {client,user}=await pokerClient();if(!user)return problem('Please log in.',401);
  const {data,error}=await client.rpc('orbit_poker',{p_action:'list',p_input:{projectId:parsed.data}});
  return error?pokerFailure(error):pokerJson(data);
 }catch{return problem('Planning Poker is temporarily unavailable. Please retry.',503);}
}
export async function POST(request:NextRequest) {
 if(!sameOrigin(request))return problem('Request origin is not allowed.',403);
 try {
  const parsed=create.safeParse(await limitedJson(request,16384));if(!parsed.success)return problem(parsed.error.issues[0]?.message||'Check room settings.');
  const {client,user}=await pokerClient();if(!user)return problem('Please log in.',401);
  const {action,...input}=parsed.data;const token=action==='create'?randomBytes(32).toString('hex'):'';
  const {data,error}=await client.rpc('orbit_poker',{p_action:action,p_token:token,p_input:input});
  return error?pokerFailure(error):pokerJson(data);
 }catch{return problem('Invalid room request.');}
}
