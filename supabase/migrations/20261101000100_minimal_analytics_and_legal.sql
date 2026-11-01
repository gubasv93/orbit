-- Minimal aggregate measurement and versioned service terms acceptance.
-- Operational account, project, team, Poker and lifecycle records are preserved.
begin;

create table orbit_private.application_privacy_settings (
 singleton boolean primary key default true check(singleton),
 started_at timestamptz not null default clock_timestamp()
);
insert into orbit_private.application_privacy_settings(singleton) values(true);

create table orbit_private.application_landing_pageviews (
 view_date date primary key,
 pageviews bigint not null default 0 check(pageviews >= 0)
);

create table orbit_private.application_legal_acceptances (
 user_id uuid not null references auth.users(id) on delete cascade,
 terms_version text not null check(terms_version = '2026-11-01'),
 privacy_version text not null check(privacy_version = '2026-11-01'),
 accepted_at timestamptz not null default clock_timestamp(),
 primary key(user_id, terms_version, privacy_version)
);

revoke all on orbit_private.application_privacy_settings,orbit_private.application_landing_pageviews,
 orbit_private.application_legal_acceptances from public,anon,authenticated;

-- Previously optional identifiers, IP-derived rate-limit keys and durations
-- are no longer retained. No operational statistics or planning data is deleted.
-- These table constraints also stop an old function body that was already
-- cached by a server connection before the RPC is retired below.
alter table orbit_private.application_activity_sessions add constraint application_activity_retired check(false) not valid;
alter table orbit_private.application_activity_limits add constraint application_activity_limits_retired check(false) not valid;
delete from orbit_private.application_activity_sessions;
delete from orbit_private.application_activity_limits;
alter table orbit_private.application_activity_sessions validate constraint application_activity_retired;
alter table orbit_private.application_activity_limits validate constraint application_activity_limits_retired;

-- Disable old server builds as well as stale browser clients. Leave signatures
-- available so the retirement is explicit and existing schema readers still work.
create or replace function public.orbit_application_activity_allow(p_key text) returns boolean
language sql security definer set search_path='' as $$select false;$$;
create or replace function public.orbit_application_activity(p_session uuid,p_surface text,p_user uuid default null,p_visitor text default null,p_seconds integer default 0,p_end boolean default false,p_sequence integer default 0) returns void
language plpgsql security definer set search_path='' as $$begin
 raise exception 'Optional usage analytics has been retired' using errcode='0A000';
end;$$;
revoke all on function public.orbit_application_activity_allow(text),public.orbit_application_activity(uuid,text,uuid,text,integer,boolean,integer) from public,anon,authenticated;
do $$begin if exists(select 1 from pg_roles where rolname='service_role') then
 revoke all on function public.orbit_application_activity_allow(text),public.orbit_application_activity(uuid,text,uuid,text,integer,boolean,integer) from service_role;
end if;end;$$;

create function public.orbit_record_landing_pageview() returns void
language plpgsql security definer set search_path='' as $$
declare today_utc date := (clock_timestamp() at time zone 'UTC')::date;
begin
 insert into orbit_private.application_landing_pageviews(view_date,pageviews) values(today_utc,1)
 on conflict(view_date) do update set pageviews=orbit_private.application_landing_pageviews.pageviews+1;
end;$$;

create function public.orbit_landing_pageviews(p_days integer default 30) returns jsonb
language plpgsql security definer set search_path='' as $$
declare today_utc date := (clock_timestamp() at time zone 'UTC')::date;
begin
 if p_days is null or p_days not in (7,30,90,365) then raise exception 'Invalid reporting period' using errcode='22023';end if;
 return jsonb_build_object('pageviews',(select coalesce(sum(pageviews),0) from orbit_private.application_landing_pageviews where view_date between today_utc-(p_days-1) and today_utc),
  'days',p_days,'startedAt',(select started_at from orbit_private.application_privacy_settings where singleton));
end;$$;
revoke all on function public.orbit_record_landing_pageview(),public.orbit_landing_pageviews(integer) from public,anon,authenticated;
do $$begin if exists(select 1 from pg_roles where rolname='service_role') then
 grant execute on function public.orbit_record_landing_pageview(),public.orbit_landing_pageviews(integer) to service_role;
end if;end;$$;

-- The activation boundary affects only accounts created after this cutover.
-- Missing/invalid creation dates fail closed instead of silently grandfathering.
create function public.orbit_legal_status() returns jsonb
language plpgsql security definer set search_path='' as $$
declare current_user_id uuid := auth.uid(); created timestamptz; accepted timestamptz; activated timestamptz;
begin
 if current_user_id is null then raise exception 'Please log in' using errcode='PT401';end if;
 select orbit_private.application_timestamp(to_jsonb(u)->>'created_at') into created from auth.users u where u.id=current_user_id;
 if not found then raise exception 'Please log in' using errcode='PT401';end if;
 select started_at into activated from orbit_private.application_privacy_settings where singleton;
 select accepted_at into accepted from orbit_private.application_legal_acceptances where user_id=current_user_id and terms_version='2026-11-01' and privacy_version='2026-11-01';
 return jsonb_build_object('required',accepted is null and (created is null or created>=activated),
  'termsVersion','2026-11-01','privacyVersion','2026-11-01','acceptedAt',accepted);
end;$$;

create function public.orbit_accept_legal(p_terms_version text,p_privacy_version text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare current_user_id uuid := auth.uid();
begin
 if current_user_id is null or not exists(select 1 from auth.users where id=current_user_id) then raise exception 'Please log in' using errcode='PT401';end if;
 if p_terms_version is distinct from '2026-11-01' or p_privacy_version is distinct from '2026-11-01' then raise exception 'Accept the current Terms of Use and read the Privacy Policy' using errcode='22023';end if;
 insert into orbit_private.application_legal_acceptances(user_id,terms_version,privacy_version) values(current_user_id,p_terms_version,p_privacy_version) on conflict(user_id,terms_version,privacy_version) do nothing;
 return public.orbit_legal_status();
end;$$;
revoke all on function public.orbit_legal_status(),public.orbit_accept_legal(text,text) from public,anon;
grant execute on function public.orbit_legal_status(),public.orbit_accept_legal(text,text) to authenticated;

commit;
