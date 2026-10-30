import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
import {GET,PATCH} from '../src/app/api/profile/route';

const backend=vi.hoisted(()=>({getUser:vi.fn(),getClaims:vi.fn(),rpc:vi.fn(),updateUser:vi.fn(),setSession:vi.fn(),signInWithPassword:vi.fn()}));
vi.mock('../src/lib/supabase',()=>({isConfigured:()=>true,supabase:async()=>({auth:{getUser:backend.getUser,getClaims:backend.getClaims,updateUser:backend.updateUser,setSession:backend.setSession},rpc:backend.rpc})}));
vi.mock('@supabase/supabase-js',()=>({createClient:()=>({auth:{signInWithPassword:backend.signInWithPassword}})}));
const origin='https://orbit.example',user={id:'current-user',email:'sam@example.com',user_metadata:{first_name:'Sam',last_name:'Reed'},app_metadata:{providers:['email']},identities:[{provider:'email'}]};
const passwordInput={action:'password',currentPassword:'OldPassword9',password:'NewPassword9',confirm:'NewPassword9'};
function request(input:unknown,source=origin){return PATCH(new NextRequest(origin+'/api/profile',{method:'PATCH',headers:{Origin:source,'Content-Type':'application/json'},body:JSON.stringify(input)}));}
beforeEach(()=>{
 vi.stubEnv('APP_URL',origin);vi.stubEnv('SUPABASE_URL','https://example.supabase.co');vi.stubEnv('SUPABASE_PUBLISHABLE_KEY','test-key');
 for(const fn of Object.values(backend))fn.mockReset();
 backend.getUser.mockResolvedValue({data:{user},error:null});backend.rpc.mockResolvedValue({data:true,error:null});
 backend.getClaims.mockResolvedValue({data:{claims:{sub:user.id,amr:[]}},error:null});
 backend.updateUser.mockResolvedValue({data:{user},error:null});backend.setSession.mockResolvedValue({data:{user},error:null});
 backend.signInWithPassword.mockResolvedValue({data:{user,session:{access_token:'local-access-token',refresh_token:'local-refresh-token'}},error:null});
});
afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks();});

describe('authenticated profile HTTP boundary',()=>{
 it('returns only this account display fields with private caching',async()=>{
  const response=await GET();expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(await response.json()).toEqual({profile:{firstName:'Sam',lastName:'Reed',displayName:'Sam Reed',email:'sam@example.com'},password:{mode:'current-password',recentGoogle:false}});
 });
 it('rejects signed-out reads and writes before any update',async()=>{
  backend.getUser.mockResolvedValue({data:{user:null},error:null});expect((await GET()).status).toBe(401);expect((await request({action:'name',firstName:'Sam',lastName:'Reed'})).status).toBe(401);expect(backend.updateUser).not.toHaveBeenCalled();
 });
 it('rejects foreign-origin mutations before reading the session',async()=>{
  expect((await request(passwordInput,'https://attacker.example')).status).toBe(403);expect(backend.getUser).not.toHaveBeenCalled();expect(backend.signInWithPassword).not.toHaveBeenCalled();
 });
 it('updates only validated name metadata and cannot target another account or email',async()=>{
  const response=await request({action:'name',firstName:' Олена ',lastName:'Д’Арк'});expect(response.status).toBe(200);
  expect(backend.updateUser).toHaveBeenCalledWith({data:{first_name:'Олена',last_name:'Д’Арк',full_name:'Олена Д’Арк'}});
  backend.updateUser.mockClear();expect((await request({action:'name',firstName:'Sam',lastName:'Reed',userId:'other-user'})).status).toBe(400);expect((await request({action:'name',firstName:'Sam',lastName:'Reed',email:'other@example.com'})).status).toBe(400);expect(backend.updateUser).not.toHaveBeenCalled();
 });
 it('requires the current password and keeps the active session on a wrong password or wrong returned identity',async()=>{
  expect((await request({action:'password',password:'NewPassword9',confirm:'NewPassword9'})).status).toBe(400);
  backend.signInWithPassword.mockResolvedValue({data:{user:null,session:null},error:{status:400}});expect((await request(passwordInput)).status).toBe(400);expect(backend.setSession).not.toHaveBeenCalled();expect(backend.updateUser).not.toHaveBeenCalled();
  backend.signInWithPassword.mockResolvedValue({data:{user:{id:'other-user'},session:{access_token:'other',refresh_token:'other'}},error:null});expect((await request(passwordInput)).status).toBe(400);expect(backend.setSession).not.toHaveBeenCalled();
 });
 it('uses the verified same-user fresh session, never returns tokens, and preserves the password byte limit',async()=>{
  const response=await request(passwordInput);expect(response.status).toBe(200);expect(await response.json()).toEqual({ok:true});
  expect(backend.signInWithPassword).toHaveBeenCalledWith({email:user.email,password:'OldPassword9'});expect(backend.setSession).toHaveBeenCalledWith({access_token:'local-access-token',refresh_token:'local-refresh-token'});expect(backend.updateUser).toHaveBeenCalledWith({password:'NewPassword9'});
  backend.updateUser.mockClear();const tooLong='A1'+'é'.repeat(36);expect((await request({...passwordInput,password:tooLong,confirm:tooLong})).status).toBe(400);expect(backend.updateUser).not.toHaveBeenCalled();
 });
 it('enforces rate limits before checking a password or changing metadata',async()=>{
  backend.rpc.mockResolvedValue({data:false,error:null});expect((await request(passwordInput)).status).toBe(429);expect(backend.signInWithPassword).not.toHaveBeenCalled();expect(backend.updateUser).not.toHaveBeenCalled();
 });
 it('requires fresh verified OAuth claims for a Google-only account, never client-provided recent-login data',async()=>{
  const googleUser={...user,app_metadata:{providers:['google']},identities:[{provider:'google'}]};backend.getUser.mockResolvedValue({data:{user:googleUser},error:null});
  const input={action:'password',password:'NewPassword9',confirm:'NewPassword9'};
  expect((await request(input)).status).toBe(403);expect(backend.updateUser).not.toHaveBeenCalled();
  backend.getClaims.mockResolvedValue({data:{claims:{sub:'another-user',amr:[{method:'oauth',timestamp:Date.now()/1000}]}},error:null});expect((await request(input)).status).toBe(403);
  backend.getClaims.mockResolvedValue({data:{claims:{sub:user.id,amr:[{method:'oauth',timestamp:Date.now()/1000-30}]}},error:null});const response=await request(input);expect(response.status).toBe(200);expect(backend.signInWithPassword).not.toHaveBeenCalled();expect(backend.updateUser).toHaveBeenCalledWith({password:'NewPassword9'});
 });
});
