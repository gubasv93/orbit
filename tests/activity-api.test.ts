import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {createHash} from 'node:crypto';
import {NextRequest} from 'next/server';
import {POST} from '../src/app/api/activity/route';

const backend=vi.hoisted(()=>({adminClient:vi.fn(),rpc:vi.fn(),getUser:vi.fn(),supabase:vi.fn()}));
vi.mock('../src/lib/application-admin-server',()=>({adminClient:backend.adminClient}));
vi.mock('../src/lib/supabase',()=>({supabase:backend.supabase}));
const origin='https://orbit.example',visitor='b'.repeat(64),userId='11111111-1111-4111-8111-111111111111';
const event={action:'event',surface:'landing',sessionId:'22222222-2222-4222-8222-222222222222',sequence:1,seconds:15,end:false};
function request(body:unknown,{source=origin,cookie=`orbit_analytics_consent=v1; orbit_analytics_visitor=${visitor}`,referer=origin+'/'}:{source?:string;cookie?:string;referer?:string}={}){
 return POST(new NextRequest(origin+'/api/activity',{method:'POST',headers:{Origin:source,'Content-Type':'application/json',Cookie:cookie,Referer:referer,'X-Forwarded-For':'192.0.2.50'},body:JSON.stringify(body)}));
}
beforeEach(()=>{
 vi.stubEnv('APP_URL',origin);for(const fn of Object.values(backend))fn.mockReset();
 backend.adminClient.mockReturnValue({rpc:backend.rpc});backend.supabase.mockResolvedValue({auth:{getUser:backend.getUser}});
 backend.getUser.mockResolvedValue({data:{user:{id:userId}},error:null});
 backend.rpc.mockImplementation(async(name:string)=>({data:name==='orbit_application_activity_allow'?true:null,error:null}));
});
afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks();});

describe('optional activity measurement boundary',()=>{
 it('rejects foreign origins and absent consent before touching privileged storage',async()=>{
  expect((await request(event,{source:'https://other.example'})).status).toBe(403);
  expect((await request(event,{cookie:''})).status).toBe(403);
  expect((await request(event,{cookie:`orbit_analytics_consent=v0; orbit_analytics_visitor=${visitor}`})).status).toBe(403);
  expect(backend.adminClient).not.toHaveBeenCalled();expect(backend.rpc).not.toHaveBeenCalled();
 });
 it('sets opaque first-party consent cookies only after opt-in and exposes neither identifier nor key',async()=>{
  vi.stubEnv('NODE_ENV','production');
  const response=await request({action:'consent',enabled:true},{cookie:''});expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ok:true,enabled:true});
  const cookies=response.cookies.getAll(),identity=cookies.find(cookie=>cookie.name==='orbit_analytics_visitor')!;
  expect(identity.value).toMatch(/^[a-f0-9]{64}$/);expect(identity.httpOnly).toBe(true);expect(identity.secure).toBe(true);expect(identity.sameSite).toBe('strict');expect(identity.maxAge).toBe(365*86400);
  expect(cookies.find(cookie=>cookie.name==='orbit_analytics_consent')?.value).toBe('v1');
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(backend.rpc.mock.calls.every(([name])=>name==='orbit_application_activity_allow')).toBe(true);
 });
 it('reuses an existing consented browser identifier and revokes even during a backend outage',async()=>{
  const accepted=await request({action:'consent',enabled:true});expect(accepted.cookies.get('orbit_analytics_visitor')?.value).toBe(visitor);
  backend.rpc.mockClear();backend.adminClient.mockImplementation(()=>{throw new Error('private configuration');});
  const revoked=await request({action:'consent',enabled:false});expect(revoked.status).toBe(200);
  expect(revoked.cookies.getAll().map(cookie=>({name:cookie.name,maxAge:cookie.maxAge}))).toEqual([{name:'orbit_analytics_consent',maxAge:0},{name:'orbit_analytics_visitor',maxAge:0}]);
  expect(backend.rpc).not.toHaveBeenCalled();
 });
 it('persists only a visitor hash, bounded seconds and a sequence, without identity or browsing content',async()=>{
  const response=await request(event);expect(response.status).toBe(200);
  const [limitName,limit]=backend.rpc.mock.calls[0];expect(limitName).toBe('orbit_application_activity_allow');expect(limit.p_key).toMatch(/^[a-f0-9]{64}$/);
  expect(backend.rpc).toHaveBeenLastCalledWith('orbit_application_activity',{
   p_session:event.sessionId,p_surface:'landing',p_user:null,p_visitor:createHash('sha256').update(visitor).digest('hex'),p_seconds:15,p_end:false,p_sequence:1,
  });
  expect(backend.supabase).not.toHaveBeenCalled();
 });
 it('uses the verified signed-in planner identity and rejects client-targeted identities or unrecognized surfaces',async()=>{
  const planner={...event,surface:'planner'};
  expect((await request(planner,{referer:origin+'/app?project=private-title'})).status).toBe(200);
  expect(backend.rpc).toHaveBeenLastCalledWith('orbit_application_activity',expect.objectContaining({p_user:userId,p_visitor:null,p_surface:'planner'}));
  backend.rpc.mockClear();
  expect((await request({...planner,userId:'another-account'},{referer:origin+'/app'})).status).toBe(400);
  expect((await request({...event,surface:'applicationmanager'},{referer:origin+'/applicationmanager'})).status).toBe(400);
  expect((await request(event,{referer:origin+'/applicationmanager'})).status).toBe(400);
  expect(backend.rpc).not.toHaveBeenCalled();
 });
 it('does not store planner events for signed-out or failed authentication',async()=>{
  backend.getUser.mockResolvedValue({data:{user:null},error:null});
  expect((await request({...event,surface:'planner'},{referer:origin+'/app'})).status).toBe(401);
  expect(backend.rpc.mock.calls.map(([name])=>name)).toEqual(['orbit_application_activity_allow']);
 });
 it('rejects oversized or malformed timing and arbitrary payload data before database calls',async()=>{
  for(const input of [{...event,seconds:61},{...event,seconds:-1},{...event,sequence:1.5},{...event,sessionId:'chosen-identifier'},{...event,url:'https://private.example'}])expect((await request(input)).status).toBe(400);
  expect(backend.rpc).not.toHaveBeenCalled();
 });
 it('fails closed on throttling and unavailable analytics without leaking provider details',async()=>{
  backend.rpc.mockResolvedValue({data:false,error:null});expect((await request(event)).status).toBe(429);expect(backend.rpc).toHaveBeenCalledTimes(1);
  backend.rpc.mockResolvedValue({data:null,error:{message:'sensitive provider error'}});const unavailable=await request(event);expect(unavailable.status).toBe(503);expect(await unavailable.text()).not.toContain('sensitive');
 });
});
