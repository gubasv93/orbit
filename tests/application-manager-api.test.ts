import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
import {GET} from '../src/app/api/applicationmanager/route';
import {PATCH,DELETE as deleteUser} from '../src/app/api/applicationmanager/users/[id]/route';
import {DELETE as deleteProject} from '../src/app/api/applicationmanager/users/[id]/projects/[projectId]/route';
import {ManagerAuthError} from '../src/lib/application-manager-auth';
import {fullWorkspace} from './fixtures';

const backend=vi.hoisted(()=>({requireManager:vi.fn(),client:vi.fn(),rpc:vi.fn(),getUserById:vi.fn(),updateUserById:vi.fn(),deleteUser:vi.fn()}));
vi.mock('../src/lib/application-manager-auth',()=>{
 class ManagerAuthError extends Error{constructor(message:string,public status=401,public code='authentication_required'){super(message);}}
 return {ManagerAuthError,requireManager:backend.requireManager};
});
vi.mock('../src/lib/application-admin-server',()=>({adminClient:backend.client}));

const origin='https://orbit.example',target='11111111-1111-4111-8111-111111111111';
const manager={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',email:'owner@example.com',sessionId:'session',mfaEnabled:true,freshUntil:'2030-01-01T00:00:00Z'};
const user={id:target,email:'sam@example.com',user_metadata:{first_name:'Sam',last_name:'Reed',full_name:'Sam Reed',custom_preference:'retain me'}};
const changes={email:'NEW@example.com',firstName:' Grace ',lastName:' Hopper '};
const projectId='project-shared-id',projectName='My project',revision=7;
const userContext=(id=target)=>({params:Promise.resolve({id})});
const projectContext=(id=target,project=projectId)=>({params:Promise.resolve({id,projectId:project})});
function request(method:string,body:unknown,url='/api/applicationmanager/users/'+target,source=origin){
 return new NextRequest(origin+url,{method,headers:{Origin:source,'Content-Type':'application/json'},body:JSON.stringify(body)});
}
function expectPrivate(response:Response){
 expect(response.headers.get('cache-control')).toBe('private, no-store');
 expect(response.headers.get('referrer-policy')).toBe('no-referrer');
 expect(response.headers.get('x-content-type-options')).toBe('nosniff');
}
function projectRequest(body:unknown,source=origin){return request('DELETE',body,`/api/applicationmanager/users/${target}/projects/${projectId}`,source);}
function deletionCalls(){return backend.rpc.mock.calls.filter(([name])=>name==='orbit_application_delete_project');}

beforeEach(()=>{
 vi.stubEnv('APP_URL',origin);for(const fn of Object.values(backend))fn.mockReset();
 backend.requireManager.mockResolvedValue(manager);
 backend.client.mockReturnValue({rpc:backend.rpc,auth:{admin:{getUserById:backend.getUserById,updateUserById:backend.updateUserById,deleteUser:backend.deleteUser}}});
 backend.getUserById.mockResolvedValue({data:{user},error:null});
 backend.updateUserById.mockResolvedValue({data:{user:{...user,email:'new@example.com'}},error:null});
 backend.deleteUser.mockResolvedValue({data:{user},error:null});
 backend.rpc.mockImplementation(async(name:string,input?:{p_days?:number})=>{
  if(name==='orbit_application_analytics')return {data:{users:[{id:target,planner:{activeSeconds:777}}],totals:{current:{projects:2},planner:{sessions:5}},coverage:{history:'Observed operations',poker:'Operational room facts',engagement:'Retired optional signal'},landing:{visitors:12,activeSeconds:777}},error:null};
  if(name==='orbit_landing_pageviews')return {data:{pageviews:17,days:input?.p_days||30,startedAt:'2026-11-01T00:00:00Z'},error:null};
  if(name==='orbit_application_user_workspace')return {data:{workspace:fullWorkspace(),revision},error:null};
  if(name==='orbit_application_delete_project')return {data:{revision:revision+1},error:null};
  return {data:true,error:null};
 });
 vi.spyOn(console,'error').mockImplementation(()=>{});
});
afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks();});

describe('application manager HTTP authorization and analytics boundary',()=>{
 it('rejects ordinary and signed-out visitors before instantiating any privileged provider client',async()=>{
  backend.requireManager.mockRejectedValue(new ManagerAuthError('Please log in.',401));
  const read=await GET(new NextRequest(origin+'/api/applicationmanager',{headers:{cookie:'sb-normal-user=ordinary-account'}}));
  const changed=await PATCH(request('PATCH',changes),userContext());
  const removed=await deleteUser(request('DELETE',{confirmation:user.email}),userContext());
  const project=await deleteProject(projectRequest({confirmation:projectName,revision}),projectContext());
  for(const response of [read,changed,removed,project]){expect(response.status).toBe(401);expectPrivate(response);}
  expect(backend.client).not.toHaveBeenCalled();expect(backend.rpc).not.toHaveBeenCalled();
  expect(backend.updateUserById).not.toHaveBeenCalled();expect(backend.deleteUser).not.toHaveBeenCalled();
 });

 it('rejects cross-origin mutations before reading an admin session',async()=>{
  const hostile='https://attacker.example';
  const responses=[await PATCH(request('PATCH',changes,undefined,hostile),userContext()),await deleteUser(request('DELETE',{confirmation:user.email},undefined,hostile),userContext()),await deleteProject(projectRequest({confirmation:projectName,revision},hostile),projectContext())];
  for(const response of responses){expect(response.status).toBe(403);expectPrivate(response);}
  expect(backend.requireManager).not.toHaveBeenCalled();expect(backend.client).not.toHaveBeenCalled();
 });

 it('requires recent admin authentication for every mutation and preserves the reauthentication code',async()=>{
  backend.requireManager.mockRejectedValue(new ManagerAuthError('Confirm your password to continue.',403,'reauthentication_required'));
  const responses=[await PATCH(request('PATCH',changes),userContext()),await deleteUser(request('DELETE',{confirmation:user.email}),userContext()),await deleteProject(projectRequest({confirmation:projectName,revision}),projectContext())];
  for(const response of responses){expect(response.status).toBe(403);expect(await response.json()).toMatchObject({code:'reauthentication_required'});expectPrivate(response);}
  expect(backend.requireManager.mock.calls.every(([options])=>options?.fresh===true)).toBe(true);
  expect(backend.client).not.toHaveBeenCalled();
 });

 it('returns only guarded analytics and safe manager fields for an allowlisted period and optional UUID',async()=>{
  const response=await GET(new NextRequest(origin+`/api/applicationmanager?days=90&user=${target}`));
  expect(response.status).toBe(200);expectPrivate(response);
  expect(backend.rpc).toHaveBeenCalledWith('orbit_application_analytics',{p_user_id:target,p_days:90});
  expect(backend.rpc).toHaveBeenCalledWith('orbit_landing_pageviews',{p_days:90});
  const body=await response.json();expect(body.analytics.totals.current.projects).toBe(2);
  expect(body.analytics.landingPageviews).toEqual({pageviews:17,days:90,startedAt:'2026-11-01T00:00:00Z'});
  expect(body.analytics).not.toHaveProperty('landing');expect(body.analytics.totals).not.toHaveProperty('planner');expect(body.analytics.users[0]).not.toHaveProperty('planner');expect(body.analytics.coverage).not.toHaveProperty('engagement');
  expect(body.manager).toMatchObject({email:manager.email,mfaEnabled:true});
  expect(JSON.stringify(body)).not.toMatch(/sessionId|passwordHash|credentialVersion|totpSecret/);
 });

 it('rejects arbitrary periods and malformed user IDs before querying privileged analytics',async()=>{
  for(const query of ['days=-1','days=0','days=31','days=99999999','days=NaN','user=not-a-uuid']){
   const response=await GET(new NextRequest(origin+'/api/applicationmanager?'+query));expect(response.status).toBe(400);expectPrivate(response);
  }
  expect(backend.client).not.toHaveBeenCalled();expect(backend.rpc).not.toHaveBeenCalled();
 });

 it('suppresses provider details from analytics failures and keeps failure responses private',async()=>{
  backend.rpc.mockResolvedValue({data:null,error:{message:'private provider credential',code:'PGRST000'}});
  const response=await GET(new NextRequest(origin+'/api/applicationmanager'));expect(response.status).toBe(503);expectPrivate(response);
  expect(JSON.stringify(await response.json())).not.toContain('private provider credential');
 });
});

describe('application manager user mutations',()=>{
 it('rejects malformed identities and mass-assigned fields without any provider operation',async()=>{
  const responses=[
   await PATCH(request('PATCH',changes),userContext('other-user')),
   await PATCH(request('PATCH',{...changes,userId:'other-user'}),userContext()),
   await PATCH(request('PATCH',{...changes,email_confirm:false}),userContext()),
   await PATCH(request('PATCH',{...changes,app_metadata:{admin:true}}),userContext()),
   await PATCH(request('PATCH',{...changes,password:'unrequested password'}),userContext()),
   await deleteUser(request('DELETE',{confirmation:user.email,userId:'other-user'}),userContext()),
   await deleteProject(projectRequest({confirmation:projectName,revision,userId:'other-user'}),projectContext()),
   await deleteProject(projectRequest({confirmation:projectName,revision}),projectContext(target,'../other-project')),
  ];
  for(const response of responses){expect(response.status).toBe(400);expectPrivate(response);}
  expect(backend.client).not.toHaveBeenCalled();expect(backend.updateUserById).not.toHaveBeenCalled();expect(backend.deleteUser).not.toHaveBeenCalled();
 });

 it('rejects malformed, non-JSON and oversized bodies as bad requests, never mutations',async()=>{
  for(const method of ['patch','user-delete','project-delete']){
   for(const [body,contentType] of [['{','application/json'],['x','text/plain'],[JSON.stringify({...changes,firstName:'x'.repeat(5000)}),'application/json']]){
    const incoming=new NextRequest(origin+'/api/applicationmanager/users/'+target,{method:method==='patch'?'PATCH':'DELETE',headers:{Origin:origin,'Content-Type':contentType},body});
    const response=method==='patch'?await PATCH(incoming,userContext()):method==='user-delete'?await deleteUser(incoming,userContext()):await deleteProject(incoming,projectContext());
    expect(response.status).toBe(400);expectPrivate(response);
   }
  }
  expect(backend.client).not.toHaveBeenCalled();expect(backend.updateUserById).not.toHaveBeenCalled();
 });

 it('updates precisely the selected user, immediately confirms the supplied email and preserves unrelated metadata',async()=>{
  const response=await PATCH(request('PATCH',changes),userContext());expect(response.status).toBe(200);expectPrivate(response);expect(await response.json()).toEqual({ok:true});
  expect(backend.requireManager).toHaveBeenCalledWith({fresh:true});expect(backend.getUserById).toHaveBeenCalledWith(target);
  expect(backend.updateUserById).toHaveBeenCalledExactlyOnceWith(target,{email:'new@example.com',email_confirm:true,user_metadata:{...user.user_metadata,first_name:'Grace',last_name:'Hopper',full_name:'Grace Hopper'}});
  const requested=backend.rpc.mock.calls.findIndex(([name,input])=>name==='orbit_application_audit'&&input.p_action==='user_update_requested');
  expect(requested).toBeGreaterThanOrEqual(0);expect(backend.rpc.mock.invocationCallOrder[requested]).toBeLessThan(backend.updateUserById.mock.invocationCallOrder[0]);
  expect(backend.rpc).toHaveBeenCalledWith('orbit_application_audit',{p_admin:manager.id,p_action:'user_updated',p_target:target,p_details:{fields:['email','firstName','lastName']}});
 });

 it('permits a legacy account with no last name to change email without inventing one',async()=>{
  const response=await PATCH(request('PATCH',{...changes,lastName:''}),userContext());expect(response.status).toBe(200);
  expect(backend.updateUserById.mock.calls[0][1].user_metadata).toMatchObject({last_name:'',full_name:'Grace'});
 });

 it('reports a duplicate email without exposing provider data or claiming a successful update',async()=>{
  backend.updateUserById.mockResolvedValue({data:{user:null},error:{status:400,code:'email_exists',message:'sensitive provider response'}});
  const response=await PATCH(request('PATCH',changes),userContext());expect(response.status).toBe(409);expectPrivate(response);
  expect(await response.json()).toEqual({error:'This email is already used by another account.'});
  expect(backend.rpc.mock.calls.some(([name,input])=>name==='orbit_application_audit'&&input.p_action==='user_updated')).toBe(false);
 });

 it('never modifies an absent user and requires the exact current email before hard deletion',async()=>{
  const mismatched=await deleteUser(request('DELETE',{confirmation:'different@example.com'}),userContext());expect(mismatched.status).toBe(400);expect(backend.deleteUser).not.toHaveBeenCalled();
  backend.getUserById.mockResolvedValue({data:{user:null},error:{status:404}});
  const missing=await PATCH(request('PATCH',changes),userContext());expect(missing.status).toBe(404);expectPrivate(missing);expect(backend.updateUserById).not.toHaveBeenCalled();
 });

 it('distinguishes a provider outage from an absent user without leaking provider details',async()=>{
  backend.getUserById.mockResolvedValue({data:{user:null},error:{status:503,message:'private upstream details'}});
  const responses=[await PATCH(request('PATCH',changes),userContext()),await deleteUser(request('DELETE',{confirmation:user.email}),userContext())];
  for(const response of responses){expect(response.status).toBe(503);expectPrivate(response);expect(JSON.stringify(await response.json())).not.toContain('private upstream details');}
  expect(backend.updateUserById).not.toHaveBeenCalled();expect(backend.deleteUser).not.toHaveBeenCalled();expect(backend.rpc).not.toHaveBeenCalled();
 });

 it('records intent before deleting precisely one confirmed user with cascade-capable hard deletion',async()=>{
  const response=await deleteUser(request('DELETE',{confirmation:user.email}),userContext());expect(response.status).toBe(200);expectPrivate(response);
  expect(backend.deleteUser).toHaveBeenCalledExactlyOnceWith(target,false);
  const requested=backend.rpc.mock.calls.findIndex(([name,input])=>name==='orbit_application_audit'&&input.p_action==='user_deletion_requested');
  expect(requested).toBeGreaterThanOrEqual(0);expect(backend.rpc.mock.invocationCallOrder[requested]).toBeLessThan(backend.deleteUser.mock.invocationCallOrder[0]);
 });

 it('fails closed when the intent audit cannot be persisted, before changing or deleting an account',async()=>{
  backend.rpc.mockResolvedValue({data:null,error:{code:'57014'}});
  expect((await PATCH(request('PATCH',changes),userContext())).status).toBe(503);
  expect((await deleteUser(request('DELETE',{confirmation:user.email}),userContext())).status).toBe(503);
  expect(backend.updateUserById).not.toHaveBeenCalled();expect(backend.deleteUser).not.toHaveBeenCalled();
 });

 it('does not report a completed mutation as retryable failure when only the completion audit is unavailable',async()=>{
  backend.rpc.mockImplementation(async(name:string,input:Record<string,unknown>)=>{
   if(name==='orbit_application_audit'&&['user_updated','user_deleted','project_deleted'].includes(String(input.p_action)))return {data:null,error:{code:'57014'}};
   if(name==='orbit_application_user_workspace')return {data:{workspace:fullWorkspace(),revision},error:null};
   if(name==='orbit_application_delete_project')return {data:{revision:revision+1},error:null};
   return {data:true,error:null};
  });
  const responses=[await PATCH(request('PATCH',changes),userContext()),await deleteUser(request('DELETE',{confirmation:user.email}),userContext()),await deleteProject(projectRequest({confirmation:projectName,revision}),projectContext())];
  for(const response of responses){expect(response.status).toBe(200);expectPrivate(response);expect(await response.json()).toMatchObject({ok:true});}
  expect(backend.updateUserById).toHaveBeenCalledTimes(1);expect(backend.deleteUser).toHaveBeenCalledTimes(1);expect(deletionCalls()).toHaveLength(1);
 });
});

describe('application manager project deletion',()=>{
 it('requires the current workspace revision and exact target project name before deletion',async()=>{
  const stale=await deleteProject(projectRequest({confirmation:projectName,revision:revision-1}),projectContext());expect(stale.status).toBe(409);expectPrivate(stale);
  const mismatch=await deleteProject(projectRequest({confirmation:'Another project',revision}),projectContext());expect(mismatch.status).toBe(400);
  const missing=await deleteProject(projectRequest({confirmation:projectName,revision}),projectContext(target,'unknown-project'));expect(missing.status).toBe(404);
  expect(deletionCalls()).toHaveLength(0);
 });

 it('passes only the guarded owner, project and revision to the atomic project deletion RPC',async()=>{
  const response=await deleteProject(projectRequest({confirmation:projectName,revision}),projectContext());expect(response.status).toBe(200);expectPrivate(response);
  expect(await response.json()).toEqual({ok:true,revision:revision+1});
  expect(backend.rpc).toHaveBeenCalledWith('orbit_application_user_workspace',{p_user:target});
  expect(deletionCalls()).toEqual([['orbit_application_delete_project',{p_user:target,p_project:projectId,p_expected_revision:revision}]]);
  expect(backend.deleteUser).not.toHaveBeenCalled();expect(backend.updateUserById).not.toHaveBeenCalled();
  const requested=backend.rpc.mock.calls.findIndex(([name,input])=>name==='orbit_application_audit'&&input.p_action==='project_deletion_requested');
  const deletion=backend.rpc.mock.calls.findIndex(([name])=>name==='orbit_application_delete_project');
  expect(requested).toBeLessThan(deletion);
 });

 it('returns an atomic-save race as conflict rather than retrying against a newer snapshot',async()=>{
  backend.rpc.mockImplementation(async(name:string)=>{
   if(name==='orbit_application_user_workspace')return {data:{workspace:fullWorkspace(),revision},error:null};
   if(name==='orbit_application_delete_project')return {data:null,error:{code:'PT409',message:'internal revision conflict'}};
   return {data:true,error:null};
  });
  const response=await deleteProject(projectRequest({confirmation:projectName,revision}),projectContext());expect(response.status).toBe(409);expectPrivate(response);
  expect(deletionCalls()).toHaveLength(1);expect(JSON.stringify(await response.json())).not.toContain('internal');
 });
});
