import { randomBytes } from 'node:crypto';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { limitedJson, problem, sameOrigin } from '@/lib/http';
import { pokerClient, pokerCookie, pokerFailure, pokerIssue, pokerJson, pokerSettings, pokerToken } from '@/lib/poker-server';
export const dynamic='force-dynamic';
const action=z.discriminatedUnion('action',[
 z.object({action:z.literal('join'),name:z.string().trim().min(1).max(60),spectator:z.boolean().default(false),issue:pokerIssue}),
 z.object({action:z.literal('vote'),issue:pokerIssue,roundId:z.uuid(),value:z.string().min(1).max(12)}),
 z.object({action:z.literal('reveal'),issue:pokerIssue,roundId:z.uuid()}),z.object({action:z.literal('restart'),issue:pokerIssue,roundId:z.uuid()}),
 z.object({action:z.literal('accept'),issue:pokerIssue,roundId:z.uuid(),value:z.string().trim().min(1).max(32)}),
 z.object({action:z.literal('leave'),issue:pokerIssue}),z.object({action:z.literal('close'),closed:z.boolean().default(true),issue:pokerIssue}),
 z.object({action:z.literal('configure'),settings:pokerSettings,issue:pokerIssue}),
]);
type Context={params:Promise<{token:string}>};
export async function GET(request:NextRequest,context:Context) {
 try {
  const token=pokerToken.safeParse((await context.params).token);if(!token.success)return problem('Room not found.',404);
  const issue=pokerIssue.safeParse(request.nextUrl.searchParams.get('issue')||'free');if(!issue.success)return problem('Invalid story.');
  const {client,ownerName}=await pokerClient();const session=request.cookies.get(pokerCookie(token.data))?.value||'';
  const {data,error}=await client.rpc('orbit_poker_room_state',{p_token:token.data,p_session:session,p_input:{issue:issue.data,ownerName}});
  return error?pokerFailure(error):pokerJson(data);
 }catch{return problem('Planning Poker is temporarily unavailable. Please retry.',503);}
}
export async function POST(request:NextRequest,context:Context) {
 if(!sameOrigin(request))return problem('Request origin is not allowed.',403);
 try {
  const token=pokerToken.safeParse((await context.params).token);if(!token.success)return problem('Room not found.',404);
  const parsed=action.safeParse(await limitedJson(request,16384));if(!parsed.success)return problem(parsed.error.issues[0]?.message||'Invalid poker action.');
  const {client,ownerName}=await pokerClient();const cookie=pokerCookie(token.data),previous=request.cookies.get(cookie)?.value||'';
  const session=parsed.data.action==='join'&&!/^[a-f0-9]{64}$/.test(previous)?randomBytes(32).toString('hex'):previous;
  const {action:verb,...input}=parsed.data;
  const {data,error}=await client.rpc('orbit_poker',{p_action:verb,p_token:token.data,p_session:session,p_input:{...input,ownerName}});
  if(error)return pokerFailure(error);const response=pokerJson(data);
  if(verb==='join')response.cookies.set(cookie,session,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:`/api/poker/${token.data}`,maxAge:30*86400});
  if(verb==='leave')response.cookies.set(cookie,'',{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:`/api/poker/${token.data}`,maxAge:0});
  return response;
 }catch{return problem('Invalid poker request.');}
}
