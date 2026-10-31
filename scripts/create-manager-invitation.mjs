// Read-only by default. --create seeds the first invitation exactly once. It
// never creates an administrator or resets an existing/consumed invitation.
import {createHash,randomBytes} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {chromium,expect} from '@playwright/test';
const origin='https://orbit-sigma-nine-72.vercel.app',project='vvvptboxmyibdfzfqxzz',team='team_oNOoaQsKCl1YvwhM0S8CNHbk',vercelProject='prj_OEjKW1GPAn5AnBaQbQO75PvI8voj';
const create=process.argv.includes('--create');
if(process.argv.slice(2).some(arg=>arg!=='--create'))throw new Error('Only --create is supported.');
if(!process.env.SUPABASE_ACCESS_TOKEN||!process.env.VERCEL_TOKEN)throw new Error('Transient provider credentials required.');
if(process.env.NODE_TLS_REJECT_UNAUTHORIZED==='0')throw new Error('Normal TLS verification is required.');
const sha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();execFileSync('git',['diff','--quiet','HEAD']);
const proof=JSON.parse(readFileSync('.vercel/orbit-deployment.json','utf8')),ci=JSON.parse(readFileSync('.vercel/application-manager-ci.json','utf8'));
if(proof.commit!==sha||proof.readyState!=='READY'||!proof.published||proof.canonicalUrl!==origin+'/app'||ci.sha!==sha||ci.conclusion!=='success')throw new Error('The exact reviewed source must be published and verified first.');
async function json(url,options={},label='Provider operation'){
 const response=await fetch(url,{...options,signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw new Error(label+' failed (HTTP '+response.status+'); response suppressed.');return response.json();
}
const vh={Authorization:'Bearer '+process.env.VERCEL_TOKEN},sh={Authorization:'Bearer '+process.env.SUPABASE_ACCESS_TOKEN,'Content-Type':'application/json'};
const query=query=>json(`https://api.supabase.com/v1/projects/${project}/database/query`,{method:'POST',headers:sh,body:JSON.stringify({query})},'Invitation state operation');
const [deployment,alias,config,backend]=await Promise.all([
 json(`https://api.vercel.com/v13/deployments/${proof.id}?teamId=${team}`,{headers:vh}),
 json(`https://api.vercel.com/v4/aliases/${new URL(origin).host}?teamId=${team}`,{headers:vh}),
 json(`https://api.vercel.com/v9/projects/${vercelProject}?teamId=${team}`,{headers:vh}),
 json(`https://api.supabase.com/v1/projects/${project}`,{headers:sh})
]);
if(deployment.readyState!=='READY'||deployment.meta?.sourceCommit!==sha||deployment.projectId!==vercelProject||deployment.target!=='production'||alias.deployment?.id!==proof.id||config.accountId!==team||config.name!=='orbit'||backend.id!==project||backend.status!=='ACTIVE_HEALTHY')throw new Error('Expected production ownership/source/readiness differs.');
const [state]=await query('select (select count(*) from orbit_private.manager_identity)::int as administrators,(select count(*) from orbit_private.manager_bootstrap)::int as invitations');
if(state.administrators||state.invitations)throw new Error('An administrator or invitation already exists. It will not be reset.');
if(!create){console.log({project,commit:sha,mode:'preflight',canCreate:true});process.exit(0);}
const token=randomBytes(32).toString('base64url'),hash=createHash('sha256').update(token).digest('hex');
await query(`begin;select pg_advisory_xact_lock(hashtextextended('orbit-manager-first-invitation',0));do $$begin
 if exists(select 1 from orbit_private.manager_identity) or exists(select 1 from orbit_private.manager_bootstrap) then raise exception 'Manager invitation is already initialized';end if;
 insert into orbit_private.manager_bootstrap(singleton,token_hash,expires_at) values(true,'${hash}',clock_timestamp()+interval '7 days');end;$$;commit;`);
const [seeded]=await query(`select expires_at,consumed_at from orbit_private.manager_bootstrap where token_hash='${hash}'`);
if(!seeded||seeded.consumed_at)throw new Error('New invitation state differs.');
const url=origin+'/applicationmanager/bootstrap#setup='+token;
let browser,context,verified=false,issue=null;
try{
 const launch={headless:true,args:['--no-sandbox'],...(existsSync('/usr/bin/chromium')?{executablePath:'/usr/bin/chromium'}:{})};if(process.env.HTTPS_PROXY)launch.proxy={server:process.env.HTTPS_PROXY};
 browser=await chromium.launch(launch);context=await browser.newContext({baseURL:origin});
 await context.route('**/*',async route=>{
  const request=route.request();
  if(request.url().includes(token))throw new Error('Invitation appeared in a request URL.');
  const readOnly=['GET','HEAD','OPTIONS'].includes(request.method());
  let inspectOnly=false;
  if(request.method()==='POST'&&request.url()===origin+'/api/applicationmanager/auth/bootstrap'){
   const body=request.postDataJSON();inspectOnly=body?.token===token&&Object.keys(body).length===1;
  }
  if(!readOnly&&!inspectOnly){await route.abort();return;}
  if(request.url().startsWith(origin+'/'))await route.fulfill({response:await route.fetch({maxRedirects:0})});else await route.continue();
 });
 const page=await context.newPage();await page.goto(url);
 await expect(page.getByRole('heading',{name:'Create your administrator',exact:true})).toBeVisible({timeout:25000});
 await expect(page.getByLabel('Administrator email',{exact:true})).toHaveValue('');
 await expect(page.getByLabel('Administrator password',{exact:true})).toHaveValue('');
 const [checked]=await query(`select (select count(*) from orbit_private.manager_identity)::int as administrators,consumed_at from orbit_private.manager_bootstrap where token_hash='${hash}'`);
 if(!checked||checked.administrators||checked.consumed_at)throw new Error('Invitation was unexpectedly consumed.');verified=true;
}catch{issue='Invitation was created but its non-consuming browser inspection needs review.';process.exitCode=1;}
finally{try{if(context){await context.unrouteAll({behavior:'ignoreErrors'});await context.close();}if(browser)await browser.close();}catch{issue||='Invitation inspection cleanup needs review.';process.exitCode=1;}}
// The raw invitation is intentionally delivered only to the owner via stdout.
// It is never saved in the repository, deployment evidence or provider logs.
const result={project,commit:sha,deploymentId:proof.id,createdAt:new Date().toISOString(),expiresAt:seeded.expires_at,formVerified:verified,administratorCreated:false,issue};
mkdirSync('.vercel',{recursive:true});writeFileSync('.vercel/application-manager-invitation.json',JSON.stringify(result,null,2)+'\n',{mode:0o600});
console.log({...result,ownerSetupUrl:url});
