import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {NextRequest,NextResponse} from 'next/server';
import {GET as workspaceGet,PUT as workspacePut} from '../src/app/api/workspace/route';
import {GET as pokerGet,POST as pokerPost} from '../src/app/api/poker/route';
import {GET as roomGet,POST as roomPost} from '../src/app/api/poker/[token]/route';
import {POST as publish} from '../src/app/api/poker/[token]/publish/route';

const backend=vi.hoisted(()=>({getUser:vi.fn(),rpc:vi.fn(),gate:vi.fn(),pokerClient:vi.fn()}));
vi.mock('../src/lib/supabase',()=>({isConfigured:()=>true,supabase:async()=>({auth:{getUser:backend.getUser},rpc:backend.rpc})}));
vi.mock('../src/lib/legal-acceptance',()=>({legalApiGate:backend.gate}));
vi.mock('../src/lib/poker-server',async importOriginal=>({...await importOriginal<typeof import('../src/lib/poker-server')>(),pokerClient:backend.pokerClient}));
const origin='https://orbit.example',token='a'.repeat(64),user={id:'11111111-1111-4111-8111-111111111111',email:'new@example.com',user_metadata:{first_name:'New',last_name:'User'}};
const context={params:Promise.resolve({token})};
function request(path:string,method='GET',body?:unknown){return new NextRequest(origin+path,{method,headers:{Origin:origin,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});}
const routes:[string,()=>Promise<Response>][]=[
 ['workspace read',()=>workspaceGet(request('/api/workspace'))],
 ['workspace write',()=>workspacePut(request('/api/workspace','PUT',{}))],
 ['Poker listing',()=>pokerGet(request('/api/poker?project=own-project'))],
 ['Poker creation',()=>pokerPost(request('/api/poker','POST',{action:'create',projectId:'own-project',name:'Planning',deck:['1','2']}))],
 ['room read',()=>roomGet(request('/api/poker/'+token),context)],
 ['room join',()=>roomPost(request('/api/poker/'+token,'POST',{action:'join',name:'New User',issue:'free'}),context)],
 ['publication',()=>publish(request('/api/poker/'+token+'/publish','POST',{}),context)],
];
beforeEach(()=>{
 vi.stubEnv('APP_URL',origin);for(const fn of Object.values(backend))fn.mockReset();
 backend.getUser.mockResolvedValue({data:{user},error:null});
 backend.pokerClient.mockResolvedValue({client:{rpc:backend.rpc},user,ownerName:'New User'});
 backend.rpc.mockResolvedValue({data:{room:{},self:null},error:null});
 backend.gate.mockResolvedValue(NextResponse.json({error:'Accept the current terms.',code:'legal_acceptance_required',redirectTo:'/accept-terms'},{status:403}));
});
afterEach(()=>{vi.unstubAllEnvs();});

describe('account terms gate protects planning operations',()=>{
 it.each(routes)('blocks %s before reading or changing planning data',async(_name,call)=>{
  const response=await call();expect(response.status).toBe(403);expect(await response.json()).toMatchObject({code:'legal_acceptance_required',redirectTo:'/accept-terms'});
  expect(backend.gate).toHaveBeenCalledTimes(1);expect(backend.rpc).not.toHaveBeenCalled();
 });
 it('keeps anonymous invited guests independent from account registration',async()=>{
  backend.pokerClient.mockResolvedValue({client:{rpc:backend.rpc},user:null,ownerName:''});
  expect((await roomGet(request('/api/poker/'+token),context)).status).toBe(200);
  expect((await roomPost(request('/api/poker/'+token,'POST',{action:'join',name:'Guest',issue:'free'}),context)).status).toBe(200);
  expect(backend.gate).not.toHaveBeenCalled();expect(backend.rpc).toHaveBeenCalledTimes(2);
 });
 it('always allows an authenticated participant to leave a room',async()=>{
  const response=await roomPost(request('/api/poker/'+token,'POST',{action:'leave',issue:'free'}),context);
  expect(response.status).toBe(200);expect(backend.gate).not.toHaveBeenCalled();expect(backend.rpc).toHaveBeenCalledWith('orbit_poker',expect.objectContaining({p_action:'leave'}));
 });
 it('does not query legal status or private workspaces without authentication',async()=>{
  backend.getUser.mockResolvedValue({data:{user:null},error:null});
  expect((await workspaceGet(request('/api/workspace'))).status).toBe(401);
  expect(backend.gate).not.toHaveBeenCalled();expect(backend.rpc).not.toHaveBeenCalled();
 });
});
