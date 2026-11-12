import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {NextRequest,NextResponse} from 'next/server';
import {GET} from '../src/app/api/holidays/route';

const backend=vi.hoisted(()=>({configured:vi.fn(),supabase:vi.fn(),getUser:vi.fn(),legal:vi.fn()}));
vi.mock('../src/lib/supabase',()=>({isConfigured:backend.configured,supabase:backend.supabase}));
vi.mock('../src/lib/legal-acceptance',()=>({legalApiGate:backend.legal}));
const request=(query='')=>GET(new NextRequest('https://orbit.example/api/holidays'+query));
beforeEach(()=>{
  for(const fn of Object.values(backend))fn.mockReset();
  backend.configured.mockReturnValue(true);backend.getUser.mockResolvedValue({data:{user:{id:'own-user'}},error:null});
  backend.supabase.mockResolvedValue({auth:{getUser:backend.getUser}});backend.legal.mockResolvedValue(null);
  vi.spyOn(console,'error').mockImplementation(()=>{});
});
afterEach(()=>vi.restoreAllMocks());
describe('private authenticated public-holiday calendar endpoint',()=>{
  it('requires a valid signed-in application user',async()=>{
    backend.getUser.mockResolvedValue({data:{user:null},error:null});
    const response=await request('?action=countries');expect(response.status).toBe(401);expect(backend.legal).not.toHaveBeenCalled();
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    backend.configured.mockReturnValue(false);expect((await request('?country=DE&year=2026')).status).toBe(401);
  });
  it('honors the existing legal gate before providing data',async()=>{
    backend.legal.mockResolvedValue(NextResponse.json({error:'Acceptance required'},{status:428}));
    const response=await request('?action=countries');expect(response.status).toBe(428);
  });
  it('returns country choices and supported public dates without shared HTTP caching',async()=>{
    const countries=await request('?action=countries');expect(countries.status).toBe(200);expect((await countries.json()).countries.length).toBeGreaterThan(100);
    const response=await request('?country=DE&state=BY&year=2026');expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    const value=await response.json();expect(value).toMatchObject({countryCode:'DE',stateCode:'BY',years:[2026,2027],provider:'date-holidays',providerVersion:'3.39.1'});
    expect(value.holidays).toContainEqual({date:'2027-03-29',name:'Easter Monday'});
    expect(JSON.stringify(value)).not.toMatch(/own-user|access_token|service_role/);
  });
  it('rejects invalid input and known unavailable calendars without provider details',async()=>{
    for(const query of ['?action=unknown','?action=countries&country=DE','?country=XX&year=2026','?country=DE&year=2026.5','?country=DE&year=1999','?country=DE&year=2201','?country=DE&state=XX&year=2026','?country=DE&region=A&year=2026','?country=DE&year=2026&anything=private'])expect((await request(query)).status).toBe(400);
    const unavailable=await request('?country=UA&year=2026');expect(unavailable.status).toBe(422);expect((await unavailable.json()).error).toContain('unavailable');
  });
  it('suppresses authentication-provider failures',async()=>{
    backend.supabase.mockRejectedValue(new Error('private provider key'));
    const response=await request('?action=countries');expect(response.status).toBe(503);expect(await response.text()).not.toContain('private provider key');
  });
});
