// Disposable integration backend: real GoTrue + PostgREST + PostgreSQL.
// No connection to the owner's hosted Supabase project. Never use these settings in production.
import { spawn, spawnSync } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, request as httpRequest } from 'node:http';
const temp = mkdtempSync(join(tmpdir(), 'orbit-integration-'));
const suffix = randomBytes(4).toString('hex'), network = `orbit-test-${suffix}`;
const names = { db: `orbit-test-db-${suffix}`, auth: `orbit-test-auth-${suffix}`, rest: `orbit-test-rest-${suffix}` };
const secret = randomBytes(32).toString('hex'), password = randomBytes(24).toString('hex');
let next, gateway, closing = false;
function docker(args, input) {
  const result = spawnSync('docker', args, { encoding: 'utf8', input, maxBuffer: 4_000_000 });
  if (result.status !== 0) throw new Error(`Docker command failed (${args[0]} ${args[1] || ''}): ${result.stderr.slice(0,400)}`);
  return result.stdout.trim();
}
function envfile(name, values) { const path = join(temp, name); writeFileSync(path, Object.entries(values).map(([key,value]) => `${key}=${value}`).join('\n')+'\n', { mode: 0o600 }); return path; }
async function wait(url) {
  const deadline = Date.now()+60000;
  while (Date.now()<deadline) { try { if ((await fetch(url)).ok) return; } catch {} await new Promise(resolve => setTimeout(resolve,500)); }
  throw new Error(`Local service did not become healthy: ${new URL(url).pathname}`);
}
async function cleanup() {
  if (closing) return; closing = true; if(next?.pid){try{process.kill(-next.pid,'SIGTERM');}catch{}} gateway?.close();
  for (const name of Object.values(names).reverse()) spawnSync('docker', ['rm','-fv',name], { stdio: 'ignore' });
  spawnSync('docker',['network','rm',network],{stdio:'ignore'}); rmSync(temp,{recursive:true,force:true});
}
for (const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>{void cleanup().then(()=>process.exit(0));});
try {
  docker(['network','create',network]);
  const pgEnv = envfile('postgres.env',{POSTGRES_PASSWORD:password});
  docker(['run','-d','--name',names.db,'--network',network,'--env-file',pgEnv,'--label','orbit.integration=true','postgres:16-alpine']);
  let ready = false;
  for(let i=0;i<60;i++) { const result=spawnSync('docker',['exec',names.db,'pg_isready','-U','postgres'],{stdio:'ignore'});if(result.status===0){ready=true;break;}await new Promise(resolve=>setTimeout(resolve,500)); }
  if(!ready)throw new Error('Local PostgreSQL did not start');
  docker(['exec','-i',names.db,'psql','-U','postgres','-v','ON_ERROR_STOP=1'],`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create role authenticator noinherit login password '${password}'; grant anon,authenticated,service_role to authenticator;
    create schema auth; grant usage on schema auth to anon,authenticated;
    create function auth.uid() returns uuid language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid;
    $$;`);
  const authEnv=envfile('auth.env',{
    GOTRUE_API_HOST:'0.0.0.0',PORT:'9999',API_EXTERNAL_URL:'http://localhost:54321',GOTRUE_SITE_URL:'http://localhost:3000',
    GOTRUE_URI_ALLOW_LIST:'http://localhost:3000/auth/callback',GOTRUE_DB_DRIVER:'postgres',
    GOTRUE_DB_DATABASE_URL:`postgres://postgres:${password}@${names.db}:5432/postgres?search_path=auth`,
    GOTRUE_JWT_SECRET:secret,GOTRUE_JWT_EXP:'3600',GOTRUE_JWT_AUD:'authenticated',GOTRUE_JWT_ADMIN_ROLES:'service_role',
    GOTRUE_JWT_DEFAULT_GROUP_NAME:'authenticated',GOTRUE_DISABLE_SIGNUP:'false',GOTRUE_EXTERNAL_EMAIL_ENABLED:'true',
    GOTRUE_MAILER_AUTOCONFIRM:'true',GOTRUE_PASSWORD_MIN_LENGTH:'8',GOTRUE_PASSWORD_REQUIRED_CHARACTERS:'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ:0123456789',
    // Deliberately invalid, local-only Google credentials. Tests capture the
    // authorization navigation and never send these to Google or fake consent.
    GOTRUE_EXTERNAL_GOOGLE_ENABLED:'true',GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID:'orbit-integration.apps.googleusercontent.com',
    GOTRUE_EXTERNAL_GOOGLE_SECRET:'local-integration-placeholder',GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI:'http://localhost:54321/auth/v1/callback',
    GOTRUE_RATE_LIMIT_EMAIL_SENT:'1000',GOTRUE_LOG_LEVEL:'warn'
  });
  docker(['run','-d','--name',names.auth,'--network',network,'--env-file',authEnv,'--label','orbit.integration=true','-p','127.0.0.1:54326:9999','ghcr.io/supabase/gotrue:v2.197.0']);
  await wait('http://localhost:54326/health');
  const migrations = new URL('../supabase/migrations/', import.meta.url);
  for (const file of readdirSync(migrations).filter(name => /^\d{14}_[a-z0-9_]+\.sql$/.test(name)).sort()) {
    docker(['exec','-i',names.db,'psql','-U','postgres','-v','ON_ERROR_STOP=1'], readFileSync(new URL(file,migrations),'utf8'));
  }
  const restEnv=envfile('rest.env',{PGRST_DB_URI:`postgres://authenticator:${password}@${names.db}:5432/postgres`,PGRST_DB_SCHEMAS:'public',PGRST_DB_ANON_ROLE:'anon',PGRST_JWT_SECRET:secret,PGRST_SERVER_PORT:'3000'});
  docker(['run','-d','--name',names.rest,'--network',network,'--env-file',restEnv,'--label','orbit.integration=true','-p','127.0.0.1:54327:3000','ghcr.io/supabase/postgrest:v16.5']);
  await wait('http://localhost:54327/');
  gateway=createServer((incoming,outgoing)=>{
    const auth=incoming.url?.startsWith('/auth/v1/'), rest=incoming.url?.startsWith('/rest/v1/');
    if(!auth&&!rest){outgoing.writeHead(404).end();return;}
    const path=incoming.url.slice(auth?8:8)||'/';
    const upstream=httpRequest({hostname:'127.0.0.1',port:auth?54326:54327,path,method:incoming.method,headers:{...incoming.headers,host:auth?'localhost:54326':'localhost:54327'}},response=>{outgoing.writeHead(response.statusCode||502,response.headers);response.pipe(outgoing);});
    upstream.on('error',()=>outgoing.writeHead(502).end());incoming.pipe(upstream);
  });
  await new Promise(resolve=>gateway.listen(54321,'127.0.0.1',resolve));
  const b64=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned=`${b64({alg:'HS256',typ:'JWT'})}.${b64({role:'anon',iss:'supabase',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+86400})}`;
  const anon=`${unsigned}.${createHmac('sha256',secret).update(unsigned).digest('base64url')}`;
  next=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','0.0.0.0'],{detached:true,cwd:new URL('..',import.meta.url),env:{...process.env,SUPABASE_URL:'http://127.0.0.1:54321',SUPABASE_PUBLISHABLE_KEY:anon,APP_URL:'http://localhost:3000',SIGNUP_MODE:'public'},stdio:['ignore','pipe','pipe']});
  const log=join(temp,'next.log');
  const {createWriteStream}=await import('node:fs'); const stream=createWriteStream(log,{mode:0o600});next.stdout.pipe(stream);next.stderr.pipe(stream);
  next.on('exit',code=>{if(!closing){console.error('Local app exited',code);void cleanup().then(()=>process.exit(code||1));}});
  await wait('http://localhost:3000/api/health');
  console.log('Local real-auth backend and production app are running. Test-only email confirmation is automatic.');
  console.log('Run ORBIT_E2E_AUTH=1 npm run test:e2e. Stop this process to remove only its disposable containers.');
} catch(error) {
  console.error(error.message);
  if (process.env.GITHUB_ACTIONS === 'true') {
    // Surface startup failures in the check annotations as well as the job log.
    const message = String(error.message).replaceAll('%','%25').replaceAll('\r','%0D').replaceAll('\n','%0A');
    console.error(`::error title=Disposable backend startup failed::${message}`);
  }
  await cleanup(); process.exit(1);
}
