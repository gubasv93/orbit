import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {acceptCurrentLegal,getLegalStatus,legalApiGate} from '../src/lib/legal-acceptance';
import {createLegalReceipt,legalReceiptCookieOptions,verifyLegalReceipt} from '../src/lib/legal-receipt';
import {PRIVACY_VERSION,TERMS_VERSION} from '../src/lib/legal';

const versions={termsVersion:TERMS_VERSION,privacyVersion:PRIVACY_VERSION};
const required={...versions,required:true,acceptedAt:null},legacy={...versions,required:false,acceptedAt:null};
const accepted={...versions,required:false,acceptedAt:'2026-11-01T12:00:00.000Z'};
const rpc=vi.fn(),client={rpc} as unknown as Parameters<typeof getLegalStatus>[0];
beforeEach(()=>{rpc.mockReset();vi.stubEnv('APPLICATION_MANAGER_ENCRYPTION_KEY','server-only-receipt-secret-with-at-least-32-chars');});
afterEach(()=>{vi.unstubAllEnvs();});

describe('trusted legal status and account gate',()=>{
 it.each([required,legacy,accepted])('accepts a valid current DB status %#',async value=>{
  rpc.mockResolvedValue({data:value,error:null});expect(await getLegalStatus(client)).toEqual(value);expect(rpc).toHaveBeenCalledExactlyOnceWith('orbit_legal_status');
 });
 it('binds agreement to server-selected versions with no user ID or client timestamp',async()=>{
  rpc.mockResolvedValue({data:accepted,error:null});expect(await acceptCurrentLegal(client)).toEqual(accepted);
  expect(rpc).toHaveBeenCalledExactlyOnceWith('orbit_accept_legal',{p_terms_version:TERMS_VERSION,p_privacy_version:PRIVACY_VERSION});
 });
 it.each([null,{},true,{...legacy,termsVersion:'old'},{...legacy,privacyVersion:'old'},{...required,acceptedAt:accepted.acceptedAt},{...accepted,acceptedAt:'chosen-date'}])('fails closed on untrusted or obsolete legal status %#',async value=>{
  rpc.mockResolvedValue({data:value,error:null});await expect(getLegalStatus(client)).rejects.toThrow();
  const response=await legalApiGate(client);expect(response?.status).toBe(503);expect(response?.headers.get('cache-control')).toBe('private, no-store');
 });
 it('does not claim an agreement was recorded after an empty or still-required response',async()=>{
  for(const data of [legacy,required]){rpc.mockResolvedValue({data,error:null});await expect(acceptCurrentLegal(client)).rejects.toThrow();}
 });
 it('allows accepted and grandfathered accounts while directing required accounts to a fixed same-site route',async()=>{
  for(const data of [legacy,accepted]){rpc.mockResolvedValue({data,error:null});expect(await legalApiGate(client)).toBeNull();}
  rpc.mockResolvedValue({data:required,error:null});const response=await legalApiGate(client);expect(response?.status).toBe(403);
  expect(await response?.json()).toMatchObject({code:'legal_acceptance_required',redirectTo:'/accept-terms'});
 });
 it('does not reveal provider details when the check is unavailable',async()=>{
  rpc.mockResolvedValue({data:accepted,error:{message:'secret provider detail'}});
  const response=await legalApiGate(client);expect(response?.status).toBe(503);expect(await response?.text()).not.toContain('secret provider detail');
 });
});

describe('purpose-bound short-lived Google signup receipt',()=>{
 const time=Date.parse('2026-11-01T12:00:00Z');
 it('creates unpredictable receipts accepted only within their server expiry',()=>{
  const receipt=createLegalReceipt(time);expect(verifyLegalReceipt(receipt,time)).toBe(true);
  expect(createLegalReceipt(time)).not.toBe(receipt);
  expect(verifyLegalReceipt(receipt,time+1799_000)).toBe(true);expect(verifyLegalReceipt(receipt,time+1800_000)).toBe(false);
  expect(verifyLegalReceipt(receipt,time-31_000)).toBe(false);
 });
 it('rejects forged payloads, altered signatures and malformed values',()=>{
  const receipt=createLegalReceipt(time),[payload,signature]=receipt.split('.');
  const changed=(signature[0]==='a'?'b':'a')+signature.slice(1);
  for(const value of [undefined,'','not-a-receipt','x'.repeat(2000),payload+'.'+changed,'e30.'+signature])expect(verifyLegalReceipt(value,time)).toBe(false);
 });
 it('does not issue a receipt without a server secret or verify one after the key changes',()=>{
  const receipt=createLegalReceipt(time);vi.stubEnv('APPLICATION_MANAGER_ENCRYPTION_KEY','different-server-secret-with-at-least32chars');expect(verifyLegalReceipt(receipt,time)).toBe(false);
  vi.stubEnv('APPLICATION_MANAGER_ENCRYPTION_KEY','');vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY','');
  expect(()=>createLegalReceipt(time)).toThrow();expect(verifyLegalReceipt(receipt,time)).toBe(false);
 });
 it('uses only the callback path and essential OAuth cookie protections',()=>{
  vi.stubEnv('NODE_ENV','production');expect(legalReceiptCookieOptions()).toEqual({httpOnly:true,secure:true,sameSite:'lax',path:'/auth/callback',maxAge:1800});
 });
});
