import {createCipheriv,createDecipheriv,createHash,createHmac,randomBytes,scrypt,timingSafeEqual} from 'node:crypto';
import {cookies} from 'next/headers';
import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import QRCode from 'qrcode';
import {adminClient} from './application-admin-server';
import {limitedJson,sameOrigin} from './http';

export class ManagerAuthError extends Error {
 constructor(message:string,public status=401,public code='authentication_required'){super(message);}
}
export type ManagerSession={id:string;email:string;sessionId:string;mfaEnabled:boolean;freshUntil:string};
type PrivateSession=ManagerSession&{credentialVersion:number;verified:boolean;fresh:boolean;passwordHash:string;totpSecret:string|null;pendingSecret:string|null;pendingExpiresAt:string|null};
type Credentials={id:string;email:string;passwordHash:string;credentialVersion:number;mfaEnabled:boolean};
export const managerPasswordSchema=z.string().max(512).refine(value=>Array.from(value).length>=12&&Array.from(value).length<=128,'Use 12–128 characters')
 .refine(value=>Buffer.byteLength(value,'utf8')<=512,'Password is too long').regex(/\p{L}/u,'Include a letter').regex(/\p{N}/u,'Include a number');
const passwordInput=z.string().min(1).max(512).refine(value=>Buffer.byteLength(value,'utf8')<=512,'Password is too long');
const emailInput=z.string().trim().toLowerCase().max(254).pipe(z.email());
const otpInput=z.string().regex(/^\d{6}$/,'Enter the six-digit authenticator code');
const bootstrapToken=z.string().regex(/^[A-Za-z0-9_-]{43,128}$/);
const hashPattern=/^scrypt-v1\.([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{86})$/;
const dummyHash='scrypt-v1.'+Buffer.alloc(16).toString('base64url')+'.'+Buffer.alloc(64).toString('base64url');
const seconds12h=12*60*60;

export const managerCookieName=()=>process.env.NODE_ENV==='production'?'__Host-orbit-manager':'orbit-manager';
export const managerTokenHash=(token:string)=>createHash('sha256').update(token).digest('hex');
function freshToken(){return randomBytes(32).toString('base64url');}
// scrypt-v1 is immutable: N=32768,r=8,p=3 (OWASP 32 MiB alternative). A future KDF change requires a new hash version.
function scryptKey(password:string,salt:Buffer):Promise<Buffer>{return new Promise((resolve,reject)=>scrypt(password,salt,64,{N:32768,r:8,p:3,maxmem:64*1024*1024},(error,key)=>error?reject(error):resolve(key)));}
export async function hashManagerPassword(password:string){const salt=randomBytes(16),key=await scryptKey(password,salt);return 'scrypt-v1.'+salt.toString('base64url')+'.'+key.toString('base64url');}
export async function verifyManagerPassword(password:string,encoded:string){
 const match=hashPattern.exec(encoded),salt=match?Buffer.from(match[1],'base64url'):Buffer.alloc(16),expected=match?Buffer.from(match[2],'base64url'):Buffer.alloc(64);
 const actual=await scryptKey(password,salt);return Boolean(match)&&expected.length===actual.length&&timingSafeEqual(actual,expected);
}
function encryptionKey(){
 const encoded=process.env.APPLICATION_MANAGER_ENCRYPTION_KEY||'',key=Buffer.from(encoded,'base64');
 if(key.length!==32||key.toString('base64')!==encoded)throw new ManagerAuthError('Application management security is not configured.',503,'manager_unavailable');
 return key;
}
function configured(){encryptionKey();adminClient();}
const aad=Buffer.from('Orbit application manager TOTP v1');
export function encryptManagerSecret(secret:string){const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',encryptionKey(),nonce);cipher.setAAD(aad);const encrypted=Buffer.concat([cipher.update(secret,'utf8'),cipher.final()]);return ['v1',nonce.toString('base64url'),cipher.getAuthTag().toString('base64url'),encrypted.toString('base64url')].join('.');}
export function decryptManagerSecret(encrypted:string){
 try{
  const [version,nonceText,tagText,dataText,...rest]=encrypted.split('.');
  if(version!=='v1'||rest.length||![nonceText,tagText,dataText].every(value=>/^[A-Za-z0-9_-]+$/.test(value)))throw new Error('Invalid encrypted format');
  const nonce=Buffer.from(nonceText,'base64url'),tag=Buffer.from(tagText,'base64url');if(nonce.length!==12||tag.length!==16)throw new Error('Invalid encrypted format');
  const decipher=createDecipheriv('aes-256-gcm',encryptionKey(),nonce);decipher.setAAD(aad);decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(Buffer.from(dataText,'base64url')),decipher.final()]).toString('utf8');
 }catch{throw new ManagerAuthError('Authenticator security is temporarily unavailable.',503,'manager_unavailable');}
}
const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function encodeManagerBase32(bytes:Buffer){let out='',bits=0,value=0;for(const byte of bytes){value=(value<<8)|byte;bits+=8;while(bits>=5){bits-=5;out+=alphabet[(value>>>bits)&31];}}if(bits)out+=alphabet[(value<<(5-bits))&31];return out;}
function decodeBase32(secret:string){if(!/^[A-Z2-7]{16,128}$/.test(secret))throw new Error('Invalid authenticator secret');let value=0,bits=0;const bytes:number[]=[];for(const character of secret){value=(value<<5)|alphabet.indexOf(character);bits+=5;if(bits>=8){bits-=8;bytes.push((value>>>bits)&255);}}return Buffer.from(bytes);}
export function managerTotp(secret:string,counter:number,digits=6){
 if(!Number.isSafeInteger(counter)||counter<0)throw new Error('Invalid authenticator counter');
 const moving=Buffer.alloc(8);moving.writeBigUInt64BE(BigInt(counter));const hmac=createHmac('sha1',decodeBase32(secret)).update(moving).digest(),offset=hmac[hmac.length-1]&15;
 return String((hmac.readUInt32BE(offset)&0x7fffffff)%10**digits).padStart(digits,'0');
}
export function verifyManagerTotp(secret:string,code:string,now=Date.now()){
 if(!/^\d{6}$/.test(code))return null;const current=Math.floor(now/1000/30);let matched:number|null=null;
 for(const counter of [current-1,current,current+1])if(counter>=0&&timingSafeEqual(Buffer.from(managerTotp(secret,counter)),Buffer.from(code)))matched=counter;
 return matched;
}
async function rpc<T=unknown>(action:string,input:Record<string,unknown>={}):Promise<T>{
 configured();const {data,error}=await adminClient().rpc('orbit_manager_auth',{p_action:action,p_input:input});
 if(error){
  const code=error.code||'';
  if(code==='PT401')throw new ManagerAuthError('Please log in.',401);
  if(code==='PT403')throw new ManagerAuthError('Confirm your password to continue.',403,'reauthentication_required');
  if(code==='PT404')throw new ManagerAuthError('Not found.',404,'not_found');
  if(code==='PT409')throw new ManagerAuthError(error.message||'Security settings changed. Retry with a new code.',409,'security_conflict');
  throw new ManagerAuthError('Application management is temporarily unavailable.',503,'manager_unavailable');
 }
 return data as T;
}
export async function managerBootstrapAvailable(){try{return await rpc<boolean>('bootstrap-available');}catch{return false;}}
async function cookieToken(){const token=(await cookies()).get(managerCookieName())?.value;return token&&/^[A-Za-z0-9_-]{43}$/.test(token)?token:null;}
async function privateSession(allowPending=false){const token=await cookieToken();if(!token)throw new ManagerAuthError('Please log in.');const session=await rpc<PrivateSession>('session',{sessionHash:managerTokenHash(token)});if(!session.verified&&!allowPending)throw new ManagerAuthError('Complete two-factor verification.',401,'mfa_required');return {token,session};}
export async function requireManager(options:{fresh?:boolean}={}):Promise<ManagerSession>{
 const {session}=await privateSession();if(options.fresh&&session.fresh!==true)throw new ManagerAuthError('Confirm your password to continue.',403,'reauthentication_required');
 return {id:session.id,email:session.email,sessionId:session.sessionId,mfaEnabled:session.mfaEnabled,freshUntil:session.freshUntil};
}
async function setToken(token:string,pending=false){(await cookies()).set(managerCookieName(),token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/',maxAge:pending?600:seconds12h});}
async function clearToken(){(await cookies()).set(managerCookieName(),'',{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/',maxAge:0});}
async function rate(request:NextRequest,purpose:string,extra?:string){
 const ip=request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'local';
 const keys=[{key:managerTokenHash('manager:'+purpose+':ip:'+ip),limit:15}];if(extra)keys.push({key:managerTokenHash('manager:'+purpose+':'+extra),limit:30});
 for(const key of keys)if(!await rpc<boolean>('rate',key))throw new ManagerAuthError('Too many attempts. Please wait before trying again.',429,'rate_limited');
}
function output(value:unknown,status=200){return NextResponse.json(value,{status,headers:{'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow'}});}
export function managerAuthFailure(error:unknown){return error instanceof ManagerAuthError?output({error:error.message,code:error.code},error.status):output({error:'Application management is temporarily unavailable.',code:'manager_unavailable'},503);}
function parsed<T>(schema:z.ZodType<T>,input:unknown){const value=schema.safeParse(input);if(!value.success)throw new ManagerAuthError(value.error.issues[0]?.message||'Check the form fields.',400,'invalid_request');return value.data;}
function verifiedCounter(secret:string|null,code:string|undefined){if(!secret)throw new ManagerAuthError('Authenticator is not configured.',409,'security_conflict');const counter=verifyManagerTotp(decryptManagerSecret(secret),code||'');if(counter===null)throw new ManagerAuthError('Authenticator code is incorrect or expired.',400,'invalid_code');return counter;}
async function checkCurrentPassword(session:PrivateSession,password:string){if(!await verifyManagerPassword(password,session.passwordHash))throw new ManagerAuthError('Current password is incorrect.',400,'invalid_password');}
const passwordChange=z.object({currentPassword:passwordInput,password:managerPasswordSchema,confirm:z.string(),code:otpInput.optional()}).strict().refine(value=>value.password===value.confirm,{message:'Passwords do not match',path:['confirm']});

export async function managerAuthGet(action:string){
 try{
  if(action!=='status')throw new ManagerAuthError('Not found.',404,'not_found');configured();
  try{
   const {session}=await privateSession(true);
   return output({authenticated:session.verified,requiresMfa:!session.verified,bootstrapAvailable:false,...(session.verified?{admin:{id:session.id,email:session.email},mfaEnabled:session.mfaEnabled,freshUntil:session.freshUntil}:{})});
  }catch(error){if(!(error instanceof ManagerAuthError)||error.status!==401)throw error;return output({authenticated:false,requiresMfa:false,bootstrapAvailable:await managerBootstrapAvailable()});}
 }catch(error){return managerAuthFailure(error);}
}
export async function managerAuthPost(request:NextRequest,action:string){
 if(!sameOrigin(request))return output({error:'Request origin is not allowed.',code:'invalid_origin'},403);
 try{
  configured();if(!['bootstrap','login','verify','logout','password','mfa-start','mfa-enable','mfa-disable'].includes(action))throw new ManagerAuthError('Not found.',404,'not_found');
  let input:unknown;try{input=await limitedJson(request,8192);}catch{throw new ManagerAuthError('Invalid request.',400,'invalid_request');}
  if(action==='bootstrap'){
   const value=parsed(z.union([z.object({token:bootstrapToken}).strict(),z.object({token:bootstrapToken,email:emailInput,password:managerPasswordSchema,confirm:z.string()}).strict().refine(value=>value.password===value.confirm,{message:'Passwords do not match',path:['confirm']})]),input);
   await rate(request,'bootstrap');const tokenHash=managerTokenHash(value.token);await rpc('bootstrap-check',{tokenHash});
   if(!('email' in value))return output({available:true});
   const token=freshToken();await rpc('bootstrap',{tokenHash,email:value.email,passwordHash:await hashManagerPassword(value.password),sessionHash:managerTokenHash(token)});await setToken(token);return output({ok:true,requiresMfa:false});
  }
  if(action==='login'){
   const value=parsed(z.object({email:emailInput,password:passwordInput}).strict(),input);await rate(request,'login','global');
   const credentials=await rpc<Credentials|null>('credentials');
   const valid=await verifyManagerPassword(value.password,credentials?.passwordHash||dummyHash);
   if(!credentials||!valid||credentials.email!==value.email)throw new ManagerAuthError('Email or password is incorrect.',401,'invalid_credentials');
   const token=freshToken(),result=await rpc<{requiresMfa:boolean}>('login',{credentialVersion:credentials.credentialVersion,sessionHash:managerTokenHash(token)});await setToken(token,result.requiresMfa);return output({ok:true,requiresMfa:result.requiresMfa});
  }
  if(action==='logout'){
   try{const token=await cookieToken();if(token)await rpc('logout',{sessionHash:managerTokenHash(token)});}catch(error){if(!(error instanceof ManagerAuthError)||error.status!==401)throw error;}
   await clearToken();return output({ok:true});
  }
  const {token,session}=await privateSession(action==='verify');await rate(request,action,session.id);
  const base={sessionHash:managerTokenHash(token),credentialVersion:session.credentialVersion};
  if(action==='verify'){
   const value=parsed(z.object({code:otpInput.optional(),password:passwordInput.optional()}).strict(),input);
   if(session.verified){if(!value.password)throw new ManagerAuthError('Enter your current password.',400,'invalid_password');await checkCurrentPassword(session,value.password);}
   const counter=session.mfaEnabled?verifiedCounter(session.totpSecret,value.code):undefined;
   const next=freshToken();await rpc('verify',{...base,counter,nextSessionHash:managerTokenHash(next)});await setToken(next);return output({ok:true,requiresMfa:false});
  }
  if(action==='password'){
   const value=parsed(passwordChange,input);await checkCurrentPassword(session,value.currentPassword);
   if(value.currentPassword===value.password)throw new ManagerAuthError('Choose a different new password.',400,'invalid_password');
   const counter=session.mfaEnabled?verifiedCounter(session.totpSecret,value.code):undefined,next=freshToken();
   const result=await rpc('password',{...base,counter,passwordHash:await hashManagerPassword(value.password),nextSessionHash:managerTokenHash(next)});await setToken(next);return output(result);
  }
  if(action==='mfa-start'){
   parsed(z.object({}).strict(),input);await requireManager({fresh:true});if(session.mfaEnabled)throw new ManagerAuthError('Two-factor authentication is already enabled.',409,'security_conflict');
   const secret=encodeManagerBase32(randomBytes(20)),uri='otpauth://totp/'+encodeURIComponent('Orbit Application Manager:'+session.email)+'?secret='+secret+'&issuer='+encodeURIComponent('Orbit Application Manager')+'&algorithm=SHA1&digits=6&period=30';
   const result=await rpc<{expiresAt:string}>('mfa-start',{...base,pendingSecret:encryptManagerSecret(secret)});
   const qrCodeDataUrl=await QRCode.toDataURL(uri,{width:240,margin:2,errorCorrectionLevel:'M'});return output({secret,uri,qrCodeDataUrl,expiresAt:result.expiresAt});
  }
  if(action==='mfa-enable'){
   const value=parsed(z.object({code:otpInput}).strict(),input);await requireManager({fresh:true});
   if(!session.pendingSecret||!session.pendingExpiresAt||Date.parse(session.pendingExpiresAt)<=Date.now())throw new ManagerAuthError('Authenticator setup expired. Start again.',409,'security_conflict');
   const next=freshToken(),result=await rpc('mfa-enable',{...base,pendingSecret:session.pendingSecret,counter:verifiedCounter(session.pendingSecret,value.code),nextSessionHash:managerTokenHash(next)});await setToken(next);return output(result);
  }
  const value=parsed(z.object({password:passwordInput,code:otpInput}).strict(),input);await checkCurrentPassword(session,value.password);
  const next=freshToken(),result=await rpc('mfa-disable',{...base,counter:verifiedCounter(session.totpSecret,value.code),nextSessionHash:managerTokenHash(next)});await setToken(next);return output(result);
 }catch(error){return managerAuthFailure(error);}
}
