// Reads integration metadata only. Never prints tokens, API keys, or response bodies.
const project = 'vvvptboxmyibdfzfqxzz';
async function check(name, token, url, summarize) {
  if (!token) { console.log(`${name}: missing authentication binding`); return false; }
  try {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) });
    if (!response.ok) { console.log(`${name}: HTTP ${response.status}`); return false; }
    console.log(`${name}: authenticated`, summarize(await response.json())); return true;
  } catch { console.log(`${name}: connection failed`); return false; }
}
const supabase = await check('Supabase', process.env.SUPABASE_ACCESS_TOKEN, `https://api.supabase.com/v1/projects/${project}`, value => ({ project: value.id, name: value.name, region: value.region, status: value.status }));
const vercel = await check('Vercel', process.env.VERCEL_TOKEN, 'https://api.vercel.com/v2/teams', value => ({ teams: value.teams?.map(team => ({ id: team.id, slug: team.slug, plan: team.billing?.plan })) }));
if (!supabase || !vercel) process.exitCode = 1;
