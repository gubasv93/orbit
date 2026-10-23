// Direct deployment while GitHub App authorization is pending. No environment files uploaded.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
const token = process.env.VERCEL_TOKEN;
if (!token) throw new Error('Supply VERCEL_TOKEN through secure environment settings.');
const team = 'team_oNOoaQsKCl1YvwhM0S8CNHbk', project = 'prj_OEjKW1GPAn5AnBaQbQO75PvI8voj';
const git = (...args) => execFileSync('git',args,{encoding:'utf8'});
if (git('status','--porcelain').trim()) throw new Error('Commit and review source before deploying.');
const head = git('rev-parse','HEAD').trim();
const remote = git('ls-remote','origin','refs/heads/main').split(/\s/)[0];
if (head !== remote) throw new Error('Deployment source must match the pushed production branch.');
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
const existing = await fetch(`https://api.vercel.com/v9/projects/${project}?teamId=${team}`,{headers,signal:AbortSignal.timeout(15000)});
if (!existing.ok) throw new Error(`Project inspection failed (HTTP ${existing.status}).`);
const config = await existing.json();
if (config.name !== 'orbit' || config.accountId !== team) throw new Error('Selected project ownership differs; refusing deployment.');
const root = new Set(['package.json','package-lock.json','tsconfig.json','next-env.d.ts','next.config.ts']);
const paths = git('ls-files','-z').split('\0').filter(file => file && (root.has(file) || file.startsWith('src/') || file.startsWith('public/')));
if (!paths.includes('package.json') || !paths.some(path=>path.startsWith('src/app/'))) throw new Error('Application source is incomplete.');
const files = paths.map(file=>({file,data:execFileSync('git',['show',`${head}:${file}`]).toString('base64'),encoding:'base64'}));
const response = await fetch(`https://api.vercel.com/v13/deployments?teamId=${team}`,{
  method:'POST',headers,signal:AbortSignal.timeout(60000),
  body:JSON.stringify({name:'orbit',project,target:'production',files,
    projectSettings:{framework:'nextjs',nodeVersion:'24.x',installCommand:'npm ci',buildCommand:'npm run build'},
    meta:{sourceCommit:head,repository:'gubasv93/orbit',sourceMethod:'reviewed-source-upload'}}),
});
const value = await response.json();
if (!response.ok) throw new Error(`Deployment creation failed (HTTP ${response.status}, ${value.error?.code || 'provider_error'}).`);
const deployment = {id:value.id,url:value.url,readyState:value.readyState,commit:head,team,project};
mkdirSync('.vercel',{recursive:true});
writeFileSync('.vercel/orbit-deployment.json',JSON.stringify(deployment,null,2)+'\n',{mode:0o600});
console.log('Deployment accepted; readiness still requires verification.',deployment);
