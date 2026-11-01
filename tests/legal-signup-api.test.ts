import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
import {POST as auth} from '../src/app/api/auth/[action]/route';
import {POST as agreement} from '../src/app/api/legal/route';
import {currentLegalAcceptance,PRIVACY_VERSION,TERMS_VERSION} from '../src/lib/legal';

const backend=vi.hoisted(()=>({supabase:vi.fn(),getUser:vi.fn(),rpc:vi.fn(),signUp:vi.fn(),signInWithPassword:vi.fn(),signOut:vi.fn()}));
vi.mock('../src/lib/supabase',()=>({isConfigured:()=>true,supabase:backend.supabase}));
const origin='https://orbit.example',user={id:'11111111-1111-4111-8111-111111111111',email:'new@example.com'};
const body={firstName:'New',lastName:'User',email:user.email,password:'Password9!',confirm:'Password9!',...currentLegalAcceptance};
const accepted={required:false,termsVersion:TERMS_VERSION,privacyVersion:PRIVACY_VERSION,acceptedAt:'2026-11-01T12:00:00Z'};
function request(path:string,input:unknown,source=origin){return new NextRequest(origin+path,{method:'POST',headers:{Origin:source,'Content-Type':'application/json'},body:JSON.stringify(input)});}
function signup(input:unknown=body,source=origin){return auth(request('/api/auth/signup',input,source),{params:Promise.resolve({action:'signup'})});}
beforeEach(()=>{
 vi.stubEnv('APP_URL',origin);vi.stubEnv('SIGNUP_MODE','public');for(const fn of Object.values(backend))fn.mockReset();
 backend.supabase.mockResolvedValue({auth:{getUser:backend.getUser,signUp:backend.signUp,signInWithPassword:backend.signInWithPassword,signOut:backend.signOut},rpc:backend.rpc});
 backend.getUser.mockResolvedValue({data:{user},error:null});backend.signUp.mockResolvedValue({data:{user,session:{access_token:'fixture-access'}},error:null});
 backend.signInWithPassword.mockResolvedValue({data:{user},error:null});backend.signOut.mockResolvedValue({error:null});
 backend.rpc.mockImplementation(async name=>({data:name==='orbit_auth_allow'?true:accepted,error:null}));
});
afterEach(()=>{vi.unstubAllEnvs();});

describe('signup requires terms without analytics consent',()=>{
 it('records a successful signup agreement with fixed versions and no metadata consent flag',async()=>{
  const response=await signup();expect(response.status).toBe(200);expect(await response.json()).toEqual({ok:true,confirmationRequired:false});
  expect(backend.rpc).toHaveBeenLastCalledWith('orbit_accept_legal',{p_terms_version:TERMS_VERSION,p_privacy_version:PRIVACY_VERSION});
  expect(backend.signUp).toHaveBeenCalledWith(expect.objectContaining({options:expect.objectContaining({data:{first_name:'New',last_name:'User',full_name:'New User'}})}));
 });
 it.each([{acceptTerms:undefined},{acceptTerms:false},{termsVersion:'old'},{privacyVersion:'old'}])('rejects missing, false or outdated agreement %# before account creation',async change=>{
  const response=await signup({...body,...change});expect(response.status).toBe(400);expect(backend.signUp).not.toHaveBeenCalled();expect(backend.rpc).not.toHaveBeenCalled();
 });
 it('does not invent a recorded agreement if signup has no authenticated session yet',async()=>{
  backend.signUp.mockResolvedValue({data:{user,session:null},error:null});const response=await signup();
  expect(response.status).toBe(200);expect(await response.json()).toEqual({ok:true,confirmationRequired:true});
  expect(backend.rpc.mock.calls.map(([name])=>name)).toEqual(['orbit_auth_allow']);
 });
 it('preserves the new account session and directs agreement retry when durable recording fails',async()=>{
  backend.rpc.mockImplementation(async name=>name==='orbit_auth_allow'?{data:true,error:null}:{data:null,error:{message:'private database failure'}});
  const response=await signup();expect(response.status).toBe(503);expect(await response.json()).toMatchObject({redirectTo:'/accept-terms?retry=1'});
  expect(backend.signOut).not.toHaveBeenCalled();
 });
 it('leaves existing password login and logout independent from signup agreement fields',async()=>{
  for(const action of ['login','logout']){
   const response=await auth(request('/api/auth/'+action,{email:user.email,password:'Password9!'}),{params:Promise.resolve({action})});expect(response.status).toBe(200);
  }
  expect(backend.rpc.mock.calls.some(([name])=>name==='orbit_accept_legal')).toBe(false);
 });
});

describe('deferred legal acceptance boundary',()=>{
 it('accepts only the signed-in account and current documents',async()=>{
  const response=await agreement(request('/api/legal',currentLegalAcceptance));expect(response.status).toBe(200);expect(await response.json()).toEqual({ok:true,redirectTo:'/app'});
  expect(backend.rpc).toHaveBeenCalledExactlyOnceWith('orbit_accept_legal',{p_terms_version:TERMS_VERSION,p_privacy_version:PRIVACY_VERSION});
  expect(response.headers.get('cache-control')).toBe('private, no-store');
 });
 it('rejects client-selected identities, timestamps and versions',async()=>{
  for(const change of [{userId:user.id},{acceptedAt:'2000-01-01T00:00:00Z'},{privacyVersion:'old'},{acceptTerms:false}])expect((await agreement(request('/api/legal',{...currentLegalAcceptance,...change}))).status).toBe(400);
  expect(backend.rpc).not.toHaveBeenCalled();expect(backend.getUser).not.toHaveBeenCalled();
 });
 it('rejects foreign origins and signed-out accounts before recording anything',async()=>{
  expect((await agreement(request('/api/legal',currentLegalAcceptance,'https://other.example'))).status).toBe(403);
  backend.getUser.mockResolvedValue({data:{user:null},error:null});expect((await agreement(request('/api/legal',currentLegalAcceptance))).status).toBe(401);
  expect(backend.rpc).not.toHaveBeenCalled();
 });
});
