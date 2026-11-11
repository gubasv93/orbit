-- Daily charts derive from retained operational facts and aggregate page views.
-- No browser tracking, new lifecycle collection, or planning data is introduced.
begin;

create index application_entities_observed on orbit_private.application_entities(first_seen_at,kind,project_lifetime_id);
create index application_projects_observed on orbit_private.application_projects(first_seen_at,user_id);
create index application_poker_games_created on orbit_private.application_poker_games(created_at,user_id);

create function public.orbit_application_analytics_trends(p_user_id uuid default null,p_days integer default 30) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
 as_of timestamptz:=clock_timestamp();
 today_utc date:=(as_of at time zone 'UTC')::date;
 first_date date;
 history_at timestamptz;
 landing_at timestamptz;
 result jsonb;
begin
 if p_days is null or p_days not in (7,30,90,365) then raise exception 'Invalid reporting period' using errcode='22023';end if;
 first_date:=today_utc-(p_days-1);
 select started_at into history_at from orbit_private.application_analytics_settings where singleton;
 select started_at into landing_at from orbit_private.application_privacy_settings where singleton;
 if history_at is null or landing_at is null then raise exception 'Analytics coverage is unavailable';end if;

 with dates as (
  select first_date+offset_day as day from generate_series(0,p_days-1) as offsets(offset_day)
 ), account_events as (
  select (a.created_at at time zone 'UTC')::date as day,1 as created,0 as deleted
  from orbit_private.application_accounts a
  where (p_user_id is null or a.user_id=p_user_id) and a.created_at_source='auth'
   and a.created_at>=greatest(first_date::timestamp at time zone 'UTC',history_at) and a.created_at<=as_of
  union all
  select (a.deleted_at at time zone 'UTC')::date,0,1 from orbit_private.application_accounts a
  where (p_user_id is null or a.user_id=p_user_id)
   and a.deleted_at>=greatest(first_date::timestamp at time zone 'UTC',history_at) and a.deleted_at<=as_of
 ), account_counts as (
  select day,sum(created) as created,sum(deleted) as deleted from account_events group by day
 ), project_events as (
  select (p.first_seen_at at time zone 'UTC')::date as day,1 as created,0 as deleted,null::numeric as lifetime
  from orbit_private.application_projects p
  where (p_user_id is null or p.user_id=p_user_id)
   and p.first_seen_at>=greatest(first_date::timestamp at time zone 'UTC',history_at) and p.first_seen_at<=as_of
  union all
  select (p.deleted_at at time zone 'UTC')::date,0,1,
   case when p.created_at_source='observed' and p.created_at is not null and p.deleted_at>=p.created_at
    then extract(epoch from p.deleted_at-p.created_at) end
  from orbit_private.application_projects p
  where (p_user_id is null or p.user_id=p_user_id)
   and p.deleted_at>=greatest(first_date::timestamp at time zone 'UTC',history_at) and p.deleted_at<=as_of
 ), project_counts as (
  select day,sum(created) as created,sum(deleted) as deleted,round(avg(lifetime),2) as average_lifetime,
   count(lifetime) as lifetime_samples from project_events group by day
 ), resource_events as (
  select e.kind,e.first_seen_at as observed from orbit_private.application_entities e
  join orbit_private.application_projects p on p.id=e.project_lifetime_id
  where e.kind<>'platform' and (p_user_id is null or p.user_id=p_user_id)
   and e.first_seen_at>=greatest(first_date::timestamp at time zone 'UTC',history_at) and e.first_seen_at<=as_of
  union all
  -- A platform label is a type. Its earliest observation counts once across
  -- the whole selected scope, even when copied into another project later.
  select 'platform',min(e.first_seen_at) from orbit_private.application_entities e
  join orbit_private.application_projects p on p.id=e.project_lifetime_id
  where e.kind='platform' and (p_user_id is null or p.user_id=p_user_id)
  group by e.entity_key
  having min(e.first_seen_at)>=greatest(first_date::timestamp at time zone 'UTC',history_at) and min(e.first_seen_at)<=as_of
 ), resource_counts as (
  select (observed at time zone 'UTC')::date as day,
   count(*) filter(where kind='feature') as features,count(*) filter(where kind='story') as stories,
   count(*) filter(where kind='workItem') as work_items,count(*) filter(where kind='person') as people,
   count(*) filter(where kind='role') as roles,count(*) filter(where kind='platform') as platforms,
   count(*) filter(where kind='meeting') as meetings,count(*) filter(where kind='holiday') as holidays,
   count(*) filter(where kind='timeOff') as time_off,count(*) filter(where kind='milestone') as milestones
  from resource_events group by (observed at time zone 'UTC')::date
 ), games as (
  select g.*,(select count(*) from orbit_private.application_poker_players p where p.room_id=g.room_id) as participants
  from orbit_private.application_poker_games g
  where (p_user_id is null or g.user_id=p_user_id)
   and g.created_at>=greatest(first_date::timestamp at time zone 'UTC',history_at) and g.created_at<=as_of
 ), game_counts as (
  select (created_at at time zone 'UTC')::date as day,count(*) as created,
   count(*) filter(where participants>0) as played,
   min(participants) filter(where participants>0) as participants_min,
   max(participants) filter(where participants>0) as participants_max,
   percentile_cont(0.5) within group(order by participants) filter(where participants>0) as participants_median,
   round(avg(participants) filter(where participants>0),2) as participants_average,
   round(avg(duration_seconds) filter(where participants>0 and closed_at is not null and duration_known),2) as average_duration,
   count(*) filter(where participants>0 and closed_at is not null and duration_known) as duration_samples
  from games group by (created_at at time zone 'UTC')::date
 )
 select jsonb_agg(jsonb_build_object(
  'date',to_char(d.day,'YYYY-MM-DD'),
  'accountsCreated',case when d.day>=(history_at at time zone 'UTC')::date then coalesce(a.created,0) end,
  'accountsDeleted',case when d.day>=(history_at at time zone 'UTC')::date then coalesce(a.deleted,0) end,
  'projectsCreated',case when d.day>=(history_at at time zone 'UTC')::date then coalesce(p.created,0) end,
  'projectsDeleted',case when d.day>=(history_at at time zone 'UTC')::date then coalesce(p.deleted,0) end,
  'featuresCreated',case when d.day>=(history_at at time zone 'UTC')::date then coalesce(r.features,0) end,
  'storiesCreated',case when d.day>=(history_at at time zone 'UTC')::date then coalesce(r.stories,0) end,
  'workItemsCreated',case when d.day>=(history_at at time zone 'UTC')::date then coalesce(r.work_items,0) end,
  'peopleCreated',case when d.day>=(history_at at time zone 'UTC')::date then coalesce(r.people,0) end,
  'rolesCreated',case when d.day>=(history_at at time zone 'UTC')::date then coalesce(r.roles,0) end,
  'platformsCreated',case when d.day>=(history_at at time zone 'UTC')::date then coalesce(r.platforms,0) end,
  'meetingsCreated',case when d.day>=(history_at at time zone 'UTC')::date then coalesce(r.meetings,0) end,
  'holidaysCreated',case when d.day>=(history_at at time zone 'UTC')::date then coalesce(r.holidays,0) end,
  'timeOffCreated',case when d.day>=(history_at at time zone 'UTC')::date then coalesce(r.time_off,0) end,
  'milestonesCreated',case when d.day>=(history_at at time zone 'UTC')::date then coalesce(r.milestones,0) end,
  'pokerGamesCreated',case when d.day>=(history_at at time zone 'UTC')::date then coalesce(g.created,0) end,
  'pokerGamesPlayed',case when d.day>=(history_at at time zone 'UTC')::date then coalesce(g.played,0) end,
  'pokerParticipantsMin',g.participants_min,'pokerParticipantsMax',g.participants_max,
  'pokerParticipantsMedian',g.participants_median,'pokerParticipantsAverage',g.participants_average,
  'pokerAverageDurationSeconds',g.average_duration,
  'pokerDurationSamples',case when d.day>=(history_at at time zone 'UTC')::date then coalesce(g.duration_samples,0) end,
  'projectAverageLifetimeSeconds',p.average_lifetime,
  'projectLifetimeSamples',case when d.day>=(history_at at time zone 'UTC')::date then coalesce(p.lifetime_samples,0) end,
  'landingPageviews',case when p_user_id is null and d.day>=(landing_at at time zone 'UTC')::date then coalesce(l.pageviews,0) end
 ) order by d.day) into result
 from dates d left join account_counts a on a.day=d.day left join project_counts p on p.day=d.day
 left join resource_counts r on r.day=d.day left join game_counts g on g.day=d.day
 left join orbit_private.application_landing_pageviews l on l.view_date=d.day;

 return jsonb_build_object('periodDays',p_days,'timezone','UTC','userId',p_user_id,'generatedAt',as_of,
  'startDate',to_char(first_date,'YYYY-MM-DD'),'endDate',to_char(today_utc,'YYYY-MM-DD'),'historyStartedAt',history_at,
  'coverage',jsonb_build_object(
   'history','Dates before operational tracking began are unavailable, not zero. The first and current day can be partial. Account creations use known authentication creation dates after tracking began; unknown registration dates are excluded.',
   'resources','Projects and resource creations mean first observed records, including the initial inventory baseline. Existing records can therefore appear together on the first tracking day. Edits and re-adding an already observed resource do not count again; exact historical current inventory cannot be reconstructed. Team copies count per project; platform labels count once across the selected scope.',
   'poker','Poker statistics group rooms by their creation day in UTC. Played rooms have at least one joined seat, including facilitator and spectators. Participant statistics can change when more seats join. Duration includes only played, closed rooms with known duration; open rooms and unknown historical durations are excluded.',
   'landing',case when p_user_id is null then 'Landing page views are daily aggregate requests, not unique visitors. Dates before the aggregate counter began are unavailable. No visitor identifiers or browsing duration are collected.' else 'Landing page views are global aggregate counts and cannot be attributed to this user.' end),
  'days',result);
end;$$;

revoke all on function public.orbit_application_analytics_trends(uuid,integer) from public,anon,authenticated;
do $$begin if exists(select 1 from pg_roles where rolname='service_role') then
 grant execute on function public.orbit_application_analytics_trends(uuid,integer) to service_role;
end if;end;$$;
commit;
