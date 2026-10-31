import {afterEach,describe,expect,it,vi} from 'vitest';
import {randomBytes} from 'node:crypto';
import {decryptManagerSecret,encodeManagerBase32,encryptManagerSecret,hashManagerPassword,managerTotp,verifyManagerPassword,verifyManagerTotp,managerPasswordSchema} from '../src/lib/application-manager-auth';

afterEach(()=>vi.unstubAllEnvs());
describe('dedicated manager password and authenticator cryptography',()=>{
 it('salts independent scrypt hashes and never accepts incorrect credentials or malformed stored hashes',async()=>{
  const password='ManagerPassword9!',first=await hashManagerPassword(password),second=await hashManagerPassword(password);
  expect(first).not.toEqual(second);expect(first).not.toContain(password);
  expect(await verifyManagerPassword(password,first)).toBe(true);expect(await verifyManagerPassword('WrongPassword9!',first)).toBe(false);expect(await verifyManagerPassword(password,'bad-format')).toBe(false);
 });
 it('supports independent 12–128-character Unicode manager passwords with an input-work bound',()=>{
  expect(managerPasswordSchema.safeParse('ПравильнийПароль9').success).toBe(true);
  expect(managerPasswordSchema.safeParse('Short9').success).toBe(false);expect(managerPasswordSchema.safeParse('OnlyLongLetters').success).toBe(false);expect(managerPasswordSchema.safeParse('1'.repeat(14)).success).toBe(false);
  expect(managerPasswordSchema.safeParse('A9'+'x'.repeat(126)).success).toBe(true);expect(managerPasswordSchema.safeParse('A9'+'x'.repeat(127)).success).toBe(false);
 });
 it('matches every RFC6238 SHA1 reference vector instead of testing against its own verifier',()=>{
  const secret=encodeManagerBase32(Buffer.from('12345678901234567890'));
  expect(secret).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
  for(const [seconds,expected] of [[59,'94287082'],[1111111109,'07081804'],[1111111111,'14050471'],[1234567890,'89005924'],[2000000000,'69279037'],[20000000000,'65353130']] as const)expect(managerTotp(secret,Math.floor(seconds/30),8)).toBe(expected);
 });
 it('accepts only the narrow 30-second drift window and fixed six-digit codes',()=>{
  const secret=encodeManagerBase32(randomBytes(20)),now=1_000_000_000_000,counter=Math.floor(now/1000/30);
  expect(verifyManagerTotp(secret,managerTotp(secret,counter),now)).toBe(counter);
  expect(verifyManagerTotp(secret,managerTotp(secret,counter-1),now)).toBe(counter-1);
  expect(verifyManagerTotp(secret,managerTotp(secret,counter+1),now)).toBe(counter+1);
  expect(verifyManagerTotp(secret,managerTotp(secret,counter-2),now)).toBeNull();expect(verifyManagerTotp(secret,'12345',now)).toBeNull();expect(verifyManagerTotp(secret,'1234567',now)).toBeNull();
 });
 it('authenticates encrypted TOTP secrets and fails closed for missing/wrong runtime keys or tampering',()=>{
  const key=randomBytes(32).toString('base64');vi.stubEnv('APPLICATION_MANAGER_ENCRYPTION_KEY',key);
  const secret=encodeManagerBase32(randomBytes(20)),first=encryptManagerSecret(secret),second=encryptManagerSecret(secret);
  expect(first).not.toBe(second);expect(first).not.toContain(secret);expect(decryptManagerSecret(first)).toBe(secret);
  const parts=first.split('.');parts[2]=(parts[2][0]==='A'?'B':'A')+parts[2].slice(1);expect(()=>decryptManagerSecret(parts.join('.'))).toThrow(/unavailable/);
  vi.stubEnv('APPLICATION_MANAGER_ENCRYPTION_KEY',randomBytes(32).toString('base64'));expect(()=>decryptManagerSecret(first)).toThrow(/unavailable/);
  vi.stubEnv('APPLICATION_MANAGER_ENCRYPTION_KEY','');expect(()=>encryptManagerSecret(secret)).toThrow(/not configured/);
 });
});
