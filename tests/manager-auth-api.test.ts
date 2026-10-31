import {afterEach,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
import {randomBytes} from 'node:crypto';
import {managerAuthGet,managerAuthPost,requireManager,hashManagerPassword,managerCookieName,encryptManagerSecret,encodeManagerBase32,managerTotp,managerTokenHash,verifyManagerTotp} from '../src/lib/application-manager-auth';
const backend=vi.hoisted(()=>({rpc:vi.fn(),cookies:new Map<string,string>(),sets:vi.fn()}));
vi.mock('../src/lib/application-admin-server',()=>({adminClient:()=>({rpc:backend.rpc})}));
vi.mock('next/headers',()=>({cookies:async()=>({get:(name:string)=>backend.cookies.has(name)?{value:backend.cookies.get(name)}:undefined,set:(name:string,value:string,options:unknown)=>{backend.cookies.set(name,value);backend.sets(name,value,options);}})}));
const origin='https://orbit.example',password='ManagerPassword9!',token='a'.repeat(43),secret=encodeManagerBase32(Buffer.from('12345678901234567890'));
let encoded:string;
const session=()=>({id:'11111111-1111-4111-8111-111111111111',email:'owner@example.com',sessionId:'22222222-2222-4222-8222-222222222222',credentialVersion:1,verified:true,fresh:true,mfaEnabled:false,freshUntil:new Date(Date.now()+240000).toISOString(),passwordHash:encoded,totpSecret:null,pendingSecret:null,pendingExpiresAt:null});
function request(action:string,body:unknown,source=origin){return managerAuthPost(new NextRequest(origin+'/api/applicationmanager/auth/'+action,{method:'POST',headers:{Origin:source,'Content-Type':'application/json'},body:JSON.stringify(body)}),action);}
beforeAll(async()=>{encoded=await hashManagerPassword(password);});
beforeEach(()=>{
 vi.stubEnv('APP_URL',origin);vi.stubEnv('APPLICATION_MANAGER_ENCRYPTION_KEY',randomBytes(32).toString('base64'));
 backend.cookies.clear();backend.sets.mockReset();backend.rpc.mockReset();backend.rpc.mockImplementation(async(_name:string,{p_action}:{p_action:string})=>({error:null,data:p_action==='rate'?true:p_action==='bootstrap-available'?false:p_action==='session'?session():p_action==='credentials'?{...session(),mfaEnabled:false}:p_action==='login'?{requiresMfa:false}:{ok:true}}));
});
afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks();});
describe('manager authentication HTTP boundary',()=>{
 it('denies unauthenticated and ordinary Orbit cookies, and never exposes private authentication material in status',async()=>{
  backend.cookies.set('sb-regular-auth-token','normal-user');await expect(requireManager()).rejects.toMatchObject({status:401});expect(backend.rpc).not.toHaveBeenCalled();
  backend.cookies.set(managerCookieName(),token);const result=await managerAuthGet('status');expect(result.headers.get('cache-control')).toBe('private, no-store');
  const body=await result.json();expect(body).toMatchObject({authenticated:true,requiresMfa:false,admin:{email:'owner@example.com'}});expect(JSON.stringify(body)).not.toMatch(/passwordHash|totpSecret|pendingSecret|credentialVersion/);
  expect(await requireManager()).toEqual({id:session().id,email:'owner@example.com',sessionId:session().sessionId,mfaEnabled:false,freshUntil:expect.any(String)});
 });
 it('rejects cross-origin requests and unconfigured encryption before any database or cryptographic authentication',async()=>{
  expect((await request('login',{email:'owner@example.com',password},'https://attacker.example')).status).toBe(403);expect(backend.rpc).not.toHaveBeenCalled();
  vi.stubEnv('APPLICATION_MANAGER_ENCRYPTION_KEY','');expect((await request('login',{email:'owner@example.com',password})).status).toBe(503);expect(backend.rpc).not.toHaveBeenCalled();
 });
 it('uses generic login failure, requires the sole stored email, and issues only a random strict HttpOnly session cookie',async()=>{
  expect((await request('login',{email:'wrong@example.com',password})).status).toBe(401);expect((await request('login',{email:'owner@example.com',password:'WrongPassword9!'})).status).toBe(401);expect(backend.sets).not.toHaveBeenCalled();
  const response=await request('login',{email:'OWNER@example.com',password});expect(response.status).toBe(200);expect(await response.json()).toEqual({ok:true,requiresMfa:false});
  const [name,value,options]=backend.sets.mock.calls.at(-1)!;expect(name).toBe(managerCookieName());expect(value).toMatch(/^[A-Za-z0-9_-]{43}$/);expect(value).not.toContain(password);expect(options).toMatchObject({httpOnly:true,sameSite:'strict',path:'/',maxAge:43200});
  const calls=backend.rpc.mock.calls.filter(call=>call[1].p_action==='login');expect(calls).toHaveLength(1);expect(calls[0][1].p_input.sessionHash).toBe(managerTokenHash(value));
 });
 it('enforces durable attempt limits before a password login and returns fresh-auth errors for stale sessions',async()=>{
  backend.rpc.mockResolvedValue({data:false,error:null});expect((await request('login',{email:'owner@example.com',password})).status).toBe(429);expect(backend.rpc).toHaveBeenCalledTimes(1);
  backend.cookies.set(managerCookieName(),token);backend.rpc.mockResolvedValue({data:{...session(),fresh:false,freshUntil:new Date(Date.now()-1000).toISOString()},error:null});
  await expect(requireManager({fresh:true})).rejects.toMatchObject({status:403,code:'reauthentication_required'});
 });
 it('never authorizes a pending MFA cookie and requires an actual six-digit current authenticator code to verify it',async()=>{
  backend.cookies.set(managerCookieName(),token);const encrypted=encryptManagerSecret(secret),pending={...session(),verified:false,mfaEnabled:true,totpSecret:encrypted};
  backend.rpc.mockImplementation(async(_name:string,{p_action}:{p_action:string})=>({error:null,data:p_action==='rate'?true:p_action==='session'?pending:{ok:true}}));
  await expect(requireManager()).rejects.toMatchObject({status:401,code:'mfa_required'});expect((await managerAuthGet('status')).status).toBe(200);
  const status=await (await managerAuthGet('status')).json();expect(status).toEqual({authenticated:false,requiresMfa:true,bootstrapAvailable:false});
  const code=managerTotp(secret,Math.floor(Date.now()/1000/30)),response=await request('verify',{code});expect(response.status).toBe(200);
  const call=backend.rpc.mock.calls.find(call=>call[1].p_action==='verify')!;expect(call[1].p_input.counter).toBe(Math.floor(Date.now()/1000/30));expect(call[1].p_input.nextSessionHash).not.toBe(managerTokenHash(token));
  expect(backend.sets.mock.calls.at(-1)?.[2]).toMatchObject({maxAge:43200});
 });
 it('requires current password plus TOTP for disabling MFA, rejects stale encrypted material and does not leak secrets',async()=>{
  backend.cookies.set(managerCookieName(),token);const encrypted=encryptManagerSecret(secret),active={...session(),mfaEnabled:true,totpSecret:encrypted};
  backend.rpc.mockImplementation(async(_name:string,{p_action}:{p_action:string})=>({error:null,data:p_action==='rate'?true:p_action==='session'?active:{ok:true,mfaEnabled:false}}));
  expect((await request('mfa-disable',{password:'WrongPassword9!',code:'123456'})).status).toBe(400);
  expect(backend.rpc.mock.calls.some(call=>call[1].p_action==='mfa-disable')).toBe(false);
  const response=await request('mfa-disable',{password,code:managerTotp(secret,Math.floor(Date.now()/1000/30))});expect(response.status).toBe(200);expect(await response.json()).toEqual({ok:true,mfaEnabled:false});
  const call=backend.rpc.mock.calls.find(call=>call[1].p_action==='mfa-disable')!;expect(call[1].p_input).not.toHaveProperty('password');expect(call[1].p_input).not.toHaveProperty('code');
 });
 it('does not let new pending sessions bypass the identity-wide authenticator guess limit',async()=>{
  backend.cookies.set(managerCookieName(),token);const encrypted=encryptManagerSecret(secret),attempts=new Map<string,number>();let ordinal=0;
  backend.rpc.mockImplementation(async(_name:string,{p_action,p_input}:{p_action:string;p_input:Record<string,unknown>})=>{
   if(p_action==='session')return {error:null,data:{...session(),sessionId:'pending-'+(++ordinal),verified:false,mfaEnabled:true,totpSecret:encrypted}};
   if(p_action==='rate'){if(p_input.limit===15)return {error:null,data:true};const key=String(p_input.key),count=(attempts.get(key)||0)+1;attempts.set(key,count);return {error:null,data:count<=Number(p_input.limit)};}
   return {error:null,data:{ok:true}};
  });
  let invalid='000000';while(verifyManagerTotp(secret,invalid)!==null)invalid=String(Number(invalid)+1).padStart(6,'0');
  for(let attempt=0;attempt<30;attempt++)expect((await request('verify',{code:invalid})).status).toBe(400);
  expect((await request('verify',{code:invalid})).status).toBe(429);expect(attempts.size).toBe(1);
  expect(backend.rpc.mock.calls.some(call=>call[1].p_action==='verify')).toBe(false);
 });
 it('has no public registration path or client role override, and a consumed bootstrap link remains unavailable',async()=>{
  expect((await request('signup',{email:'attacker@example.com',password})).status).toBe(404);
  expect((await request('login',{email:'owner@example.com',password,isAdmin:true})).status).toBe(400);
  backend.rpc.mockImplementation(async(_name:string,{p_action}:{p_action:string})=>p_action==='bootstrap-check'?{data:null,error:{code:'PT404'}}:{data:true,error:null});
  expect((await request('bootstrap',{token:'b'.repeat(43)})).status).toBe(404);
  expect(backend.rpc.mock.calls.some(call=>call[1].p_action==='bootstrap')).toBe(false);
 });
});
