-- Dedicated singleton manager identity: independent from public application users.
-- Only server-held service_role credentials may call these functions.
begin;
create table orbit_private.manager_bootstrap (
 singleton boolean primary key default true check(singleton),
 token_hash text check(token_hash ~ '^[a-f0-9]{64}$'),
 expires_at timestamptz not null,
 consumed_at timestamptz,
 check((consumed_at is null and token_hash is not null) or (consumed_at is not null and token_hash is null))
);
create table orbit_private.manager_identity (
 singleton boolean primary key default true check(singleton),
 id uuid not null unique default gen_random_uuid(),
 email text not null check(length(email) between 3 and 254 and email=lower(btrim(email))),
 password_hash text not null check(length(password_hash) between 80 and 200),
 credential_version bigint not null default 1,
 totp_secret text,
 totp_pending_secret text,
 totp_pending_expires_at timestamptz,
 totp_last_counter bigint not null default -1,
 created_at timestamptz not null default clock_timestamp(),
 security_changed_at timestamptz not null default clock_timestamp()
);
create table orbit_private.manager_sessions (
 id uuid primary key default gen_random_uuid(),
 token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
 credential_version bigint not null,
 verified boolean not null,
 created_at timestamptz not null default clock_timestamp(),
 last_seen timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null,
 challenge_expires_at timestamptz,
 fresh_until timestamptz not null,
 check(expires_at<=created_at+interval '12 hours')
);
create table orbit_private.manager_attempts (
 key text not null check(key ~ '^[a-f0-9]{64}$'),
 bucket bigint not null,
 attempts integer not null,
 primary key(key,bucket)
);
revoke all on orbit_private.manager_bootstrap,orbit_private.manager_identity,orbit_private.manager_sessions,orbit_private.manager_attempts from public,anon,authenticated,service_role;

create function public.orbit_manager_auth(p_action text,p_input jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare i orbit_private.manager_identity%rowtype; s orbit_private.manager_sessions%rowtype;
 b orbit_private.manager_bootstrap%rowtype; now_time timestamptz:=clock_timestamp();
 attempt_count integer; bucket_number bigint:=floor(extract(epoch from clock_timestamp())/600);
 counter_value bigint; next_hash text;
begin
 if jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>8192 then raise exception 'Invalid manager request' using errcode='22023'; end if;
 if p_action='rate' then
  if p_input->>'key' !~ '^[a-f0-9]{64}$' then raise exception 'Invalid request key' using errcode='22023'; end if;
  delete from orbit_private.manager_attempts where bucket<bucket_number-6;
  insert into orbit_private.manager_attempts(key,bucket,attempts) values(p_input->>'key',bucket_number,1)
   on conflict(key,bucket) do update set attempts=manager_attempts.attempts+1 returning attempts into attempt_count;
  return to_jsonb(attempt_count<=least(100,greatest(1,(p_input->>'limit')::integer)));
 end if;
 if p_action in ('bootstrap-available','bootstrap-check','bootstrap') then
  select * into b from orbit_private.manager_bootstrap where singleton for update;
  if p_action='bootstrap-available' then return to_jsonb(b.token_hash is not null and b.consumed_at is null and b.expires_at>now_time and not exists(select 1 from orbit_private.manager_identity)); end if;
  if b.token_hash is null or b.consumed_at is not null or b.expires_at<=now_time or b.token_hash is distinct from p_input->>'tokenHash' or exists(select 1 from orbit_private.manager_identity) then raise exception 'Not found' using errcode='PT404'; end if;
  if p_action='bootstrap-check' then return jsonb_build_object('available',true); end if;
  if p_input->>'email' is null or length(p_input->>'email') not between 3 and 254 or p_input->>'passwordHash' is null or length(p_input->>'passwordHash') not between 80 and 200 or p_input->>'sessionHash' !~ '^[a-f0-9]{64}$' then raise exception 'Invalid manager setup' using errcode='22023'; end if;
  insert into orbit_private.manager_identity(email,password_hash) values(lower(btrim(p_input->>'email')),p_input->>'passwordHash') returning * into i;
  update orbit_private.manager_bootstrap set token_hash=null,consumed_at=now_time where singleton;
  insert into orbit_private.manager_sessions(token_hash,credential_version,verified,expires_at,fresh_until)
   values(p_input->>'sessionHash',i.credential_version,true,now_time+interval '12 hours',now_time+interval '5 minutes') returning * into s;
  return jsonb_build_object('id',i.id,'email',i.email,'sessionId',s.id,'mfaEnabled',false,'freshUntil',s.fresh_until);
 end if;
 if p_action='credentials' then
  select * into i from orbit_private.manager_identity where singleton;
  if not found then return 'null'::jsonb; end if;
  return jsonb_build_object('id',i.id,'email',i.email,'passwordHash',i.password_hash,'credentialVersion',i.credential_version,'mfaEnabled',i.totp_secret is not null);
 end if;
 -- A single identity row lock serializes login, TOTP counters and security changes.
 select * into i from orbit_private.manager_identity where singleton for update;
 if not found then raise exception 'Please log in.' using errcode='PT401'; end if;
 if p_action='login' then
  if i.credential_version is distinct from (p_input->>'credentialVersion')::bigint or p_input->>'sessionHash' !~ '^[a-f0-9]{64}$' then raise exception 'Security settings changed. Please log in again.' using errcode='PT401'; end if;
  delete from orbit_private.manager_sessions where expires_at<=now_time or last_seen<now_time-interval '30 minutes';
  if (select count(*) from orbit_private.manager_sessions)>=50 then delete from orbit_private.manager_sessions where id in(select id from orbit_private.manager_sessions order by last_seen limit 1); end if;
  insert into orbit_private.manager_sessions(token_hash,credential_version,verified,expires_at,challenge_expires_at,fresh_until)
   values(p_input->>'sessionHash',i.credential_version,i.totp_secret is null,now_time+interval '12 hours',case when i.totp_secret is not null then now_time+interval '10 minutes' else null end,case when i.totp_secret is null then now_time+interval '5 minutes' else now_time end) returning * into s;
  return jsonb_build_object('requiresMfa',not s.verified);
 end if;
 select * into s from orbit_private.manager_sessions where token_hash=p_input->>'sessionHash' for update;
 if not found or s.credential_version<>i.credential_version or s.expires_at<=now_time or s.last_seen<=now_time-interval '30 minutes' or not s.verified and (s.challenge_expires_at is null or s.challenge_expires_at<=now_time) then raise exception 'Please log in.' using errcode='PT401'; end if;
 if p_action='logout' then delete from orbit_private.manager_sessions where id=s.id;return jsonb_build_object('ok',true);end if;
 if p_action='session' then
  if s.verified then update orbit_private.manager_sessions set last_seen=now_time where id=s.id;end if;
  return jsonb_build_object('id',i.id,'email',i.email,'sessionId',s.id,'credentialVersion',i.credential_version,'verified',s.verified,'fresh',s.fresh_until>now_time,'mfaEnabled',i.totp_secret is not null,'freshUntil',s.fresh_until,'passwordHash',i.password_hash,'totpSecret',i.totp_secret,'pendingSecret',i.totp_pending_secret,'pendingExpiresAt',i.totp_pending_expires_at);
 end if;
 if (p_input->>'credentialVersion')::bigint is distinct from i.credential_version then raise exception 'Security settings changed. Please log in again.' using errcode='PT401'; end if;
 if p_action='verify' then
  if i.totp_secret is not null then
   counter_value:=(p_input->>'counter')::bigint;
   if counter_value is null or counter_value<=i.totp_last_counter then raise exception 'Code already used. Enter a new code.' using errcode='PT409'; end if;
   update orbit_private.manager_identity set totp_last_counter=counter_value where singleton;
  elsif not s.verified then raise exception 'Please log in.' using errcode='PT401';end if;
  next_hash:=p_input->>'nextSessionHash';
  if next_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid session' using errcode='22023';end if;
  update orbit_private.manager_sessions set token_hash=next_hash,verified=true,challenge_expires_at=null,last_seen=now_time,fresh_until=now_time+interval '5 minutes' where id=s.id;
  return jsonb_build_object('ok',true);
 end if;
 if not s.verified then raise exception 'Complete two-factor verification.' using errcode='PT401'; end if;
 if s.fresh_until<=now_time and p_action not in ('password','mfa-disable') then raise exception 'Confirm your password to continue.' using errcode='PT403'; end if;
 if p_action='mfa-start' then
  if i.totp_secret is not null then raise exception 'Two-factor authentication is already enabled.' using errcode='PT409';end if;
  if p_input->>'pendingSecret' is null or length(p_input->>'pendingSecret') not between 60 and 300 then raise exception 'Invalid authenticator setup' using errcode='22023';end if;
  update orbit_private.manager_identity set totp_pending_secret=p_input->>'pendingSecret',totp_pending_expires_at=now_time+interval '10 minutes' where singleton;
  return jsonb_build_object('expiresAt',now_time+interval '10 minutes');
 end if;
 if p_action not in ('password','mfa-enable','mfa-disable') then raise exception 'Not found' using errcode='PT404';end if;
 if p_action='mfa-enable' then
  if i.totp_secret is not null or i.totp_pending_secret is null or i.totp_pending_expires_at<=now_time or i.totp_pending_secret is distinct from p_input->>'pendingSecret' then raise exception 'Authenticator setup expired. Start again.' using errcode='PT409';end if;
  counter_value:=(p_input->>'counter')::bigint;
  if counter_value is null or counter_value<0 then raise exception 'Invalid verification code' using errcode='22023';end if;
 elsif i.totp_secret is not null then
  counter_value:=(p_input->>'counter')::bigint;
  if counter_value is null or counter_value<=i.totp_last_counter then raise exception 'Code already used. Enter a new code.' using errcode='PT409';end if;
 end if;
 if p_action='password' and (p_input->>'passwordHash' is null or length(p_input->>'passwordHash') not between 80 and 200) then raise exception 'Invalid password' using errcode='22023';end if;
 if p_action='mfa-disable' and i.totp_secret is null then raise exception 'Two-factor authentication is not enabled.' using errcode='PT409';end if;
 next_hash:=p_input->>'nextSessionHash';if next_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid session' using errcode='22023';end if;
 update orbit_private.manager_identity set
  password_hash=case when p_action='password' then p_input->>'passwordHash' else password_hash end,
  totp_secret=case when p_action='mfa-enable' then totp_pending_secret when p_action='mfa-disable' then null else totp_secret end,
  totp_pending_secret=null,totp_pending_expires_at=null,
  totp_last_counter=case when p_action='mfa-disable' then -1 else coalesce(counter_value,totp_last_counter) end,
  credential_version=credential_version+1,security_changed_at=now_time where singleton returning * into i;
 delete from orbit_private.manager_sessions where id<>s.id;
 update orbit_private.manager_sessions set token_hash=next_hash,credential_version=i.credential_version,verified=true,last_seen=now_time,fresh_until=now_time+interval '5 minutes',challenge_expires_at=null where id=s.id;
 return jsonb_build_object('ok',true,'mfaEnabled',i.totp_secret is not null);
end;
$$;
revoke all on function public.orbit_manager_auth(text,jsonb) from public,anon,authenticated;
grant execute on function public.orbit_manager_auth(text,jsonb) to service_role;
commit;
