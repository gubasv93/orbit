import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
import {POST} from '../src/app/api/activity/route';

const backend=vi.hoisted(()=>({adminClient:vi.fn(),supabase:vi.fn()}));
vi.mock('../src/lib/application-admin-server',()=>({adminClient:backend.adminClient}));
vi.mock('../src/lib/supabase',()=>({supabase:backend.supabase}));
const origin='https://orbit.example';
const event={action:'event',surface:'landing',sessionId:'22222222-2222-4222-8222-222222222222',sequence:1,seconds:15,end:false};
function request(input:unknown,source=origin){return POST(new NextRequest(origin+'/api/activity',{method:'POST',headers:{Origin:source,'Content-Type':'application/json',Cookie:`orbit_analytics_consent=v1; orbit_analytics_visitor=${'b'.repeat(64)}`},body:JSON.stringify(input)}));}
function expired(response:Awaited<ReturnType<typeof POST>>){
 expect(response.headers.get('cache-control')).toBe('private, no-store');
 expect(response.cookies.getAll().map(cookie=>({name:cookie.name,value:cookie.value,maxAge:cookie.maxAge}))).toEqual([
  {name:'orbit_analytics_consent',value:'',maxAge:0},{name:'orbit_analytics_visitor',value:'',maxAge:0},
 ]);
}
beforeEach(()=>{
 vi.stubEnv('APP_URL',origin);for(const fn of Object.values(backend))fn.mockReset();
 backend.adminClient.mockImplementation(()=>{throw new Error('Private backend unavailable');});
 backend.supabase.mockImplementation(()=>{throw new Error('Authentication unavailable');});
});
afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks();});

describe('retired optional analytics endpoint',()=>{
 it.each(['landing','planner'])('rejects stale %s timing events and expires identifiers without storage',async surface=>{
  const response=await request({...event,surface});expect(response.status).toBe(410);expect(await response.json()).toMatchObject({enabled:false});expired(response);
  expect(backend.adminClient).not.toHaveBeenCalled();expect(backend.supabase).not.toHaveBeenCalled();
 });
 it('does not re-enable tracking even for previously consenting visitors',async()=>{
  vi.stubEnv('NODE_ENV','production');const response=await request({action:'consent',enabled:true});
  expect(response.status).toBe(410);expired(response);
  for(const cookie of response.cookies.getAll())expect(cookie).toMatchObject({httpOnly:true,secure:true,sameSite:'strict',path:'/'});
  expect(backend.adminClient).not.toHaveBeenCalled();expect(backend.supabase).not.toHaveBeenCalled();
 });
 it('keeps revocation available through backend and authentication outages',async()=>{
  const response=await request({action:'consent',enabled:false});expect(response.status).toBe(200);expect(await response.json()).toEqual({ok:true,enabled:false});expired(response);
  expect(backend.adminClient).not.toHaveBeenCalled();expect(backend.supabase).not.toHaveBeenCalled();
 });
 it('rejects cross-origin mutations without changing cookies or accessing any account',async()=>{
  const response=await request(event,'https://other.example');expect(response.status).toBe(403);expect(response.cookies.getAll()).toEqual([]);
  expect(backend.adminClient).not.toHaveBeenCalled();expect(backend.supabase).not.toHaveBeenCalled();
 });
 it('bounds malformed input and never reflects submitted identity or content',async()=>{
  for(const input of [null,[],{},'invalid',{action:'unknown'},{action:'consent',enabled:'true'},{padding:'x'.repeat(3000)}]){
   const response=await request(input);expect(response.status).toBe(400);expired(response);
  }
  const response=await request({...event,email:'private@example.com',url:'/secret-project'});
  expect(response.status).toBe(410);expect(await response.text()).not.toMatch(/private@example.com|secret-project/);
  expect(backend.adminClient).not.toHaveBeenCalled();expect(backend.supabase).not.toHaveBeenCalled();
 });
});
