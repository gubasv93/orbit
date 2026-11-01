import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
import {recordLandingPageview,shouldCountLandingPageview} from '../src/lib/landing-pageviews';

const backend=vi.hoisted(()=>({adminClient:vi.fn(),rpc:vi.fn(),abortSignal:vi.fn()}));
vi.mock('../src/lib/application-admin-server',()=>({adminClient:backend.adminClient}));
const origin='https://orbit.example';
const human='Mozilla/5.0 Chrome/130.0.0.0 Safari/537.36';
function request(path='/',headers:Record<string,string>={},method='GET'){
 return new NextRequest(origin+path,{method,headers:{accept:'text/html,application/xhtml+xml','sec-fetch-dest':'document','user-agent':human,...headers}});
}
beforeEach(()=>{
 vi.stubEnv('APP_URL',origin);vi.stubEnv('VERCEL_ENV','production');
 for(const fn of Object.values(backend))fn.mockReset();
 backend.adminClient.mockReturnValue({rpc:backend.rpc});backend.rpc.mockReturnValue({abortSignal:backend.abortSignal});backend.abortSignal.mockResolvedValue({data:null,error:null});
});
afterEach(()=>{vi.unstubAllEnvs();});

describe('aggregate landing document loads',()=>{
 it('counts normal landing document loads without consulting cookie or account identity',async()=>{
  const load=request('/?campaign=private-name',{cookie:'account=private; orbit_analytics_consent=v1','x-forwarded-for':'192.0.2.50',referer:'https://private.example/internal'});
  expect(shouldCountLandingPageview(load)).toBe(true);await recordLandingPageview(load);
  expect(backend.rpc).toHaveBeenCalledExactlyOnceWith('orbit_record_landing_pageview');
  expect(backend.abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal));
 });
 it.each([
  ['HEAD document',()=>request('/',{},'HEAD')],['other page',()=>request('/app')],['API request',()=>request('/api/workspace')],
  ['RSC fetch',()=>request('/',{rsc:'1'})],['RSC query',()=>request('/?_rsc=abc')],['JSON request',()=>request('/',{accept:'application/json'})],
  ['router prefetch',()=>request('/',{'next-router-prefetch':'1'})],['segment prefetch',()=>request('/',{'next-router-segment-prefetch':'1'})],['Next data',()=>request('/',{'x-nextjs-data':'1'})],
  ['prefetch purpose',()=>request('/',{purpose:'prefetch'})],['prerender purpose',()=>request('/',{'sec-purpose':'prefetch;prerender'})],['embedded image',()=>request('/',{'sec-fetch-dest':'image'})],
  ['Googlebot',()=>request('/',{'user-agent':'Googlebot/2.1'})],['headless automation',()=>request('/',{'user-agent':'Mozilla/5.0 HeadlessChrome/130'})],['link preview',()=>request('/',{'user-agent':'facebookexternalhit/1.1'})],
 ])('excludes %s from the counter',async(_label,make)=>{
  expect(shouldCountLandingPageview(make())).toBe(false);await recordLandingPageview(make());expect(backend.adminClient).not.toHaveBeenCalled();
 });
 it('excludes Vercel preview deployments and production aliases outside the canonical site',async()=>{
  vi.stubEnv('VERCEL_ENV','preview');expect(shouldCountLandingPageview(request())).toBe(false);
  vi.stubEnv('VERCEL_ENV','production');const alias=new NextRequest('https://preview-example.vercel.app/',{headers:{accept:'text/html','user-agent':human}});
  expect(shouldCountLandingPageview(alias)).toBe(false);await recordLandingPageview(alias);expect(backend.rpc).not.toHaveBeenCalled();
 });
 it('never blocks a visit when counter configuration or storage fails',async()=>{
  backend.adminClient.mockImplementationOnce(()=>{throw new Error('No analytics backend');});await expect(recordLandingPageview(request())).resolves.toBeUndefined();
  backend.abortSignal.mockRejectedValueOnce(new Error('Timeout'));await expect(recordLandingPageview(request())).resolves.toBeUndefined();
  backend.abortSignal.mockResolvedValueOnce({data:null,error:{message:'Database unavailable'}});await expect(recordLandingPageview(request())).resolves.toBeUndefined();
 });
});
