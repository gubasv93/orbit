-- First-party operational analytics and consented activity. No planner data is rewritten.
begin;
create table orbit_private.application_analytics_settings (
 singleton boolean primary key default true check(singleton), started_at timestamptz not null default clock_timestamp()
);
insert into orbit_private.application_analytics_settings(singleton) values(true);
create table orbit_private.application_accounts (
 user_id uuid primary key, email text, first_name text, last_name text,
 created_at timestamptz not null, created_at_source text not null check(created_at_source in ('auth','observed')),
 first_seen_at timestamptz not null default clock_timestamp(), deleted_at timestamptz
);
create table orbit_private.application_projects (
 id uuid primary key default gen_random_uuid(), user_id uuid not null, workspace_id uuid not null, project_key text not null,
 name text not null, created_at timestamptz, created_at_source text not null check(created_at_source in ('observed','baseline-date','unknown')),
 first_seen_at timestamptz not null default clock_timestamp(), last_seen_at timestamptz not null default clock_timestamp(), deleted_at timestamptz
);
create unique index application_projects_active on orbit_private.application_projects(user_id,project_key) where deleted_at is null;
create index application_projects_owner on orbit_private.application_projects(user_id,deleted_at);
create table orbit_private.application_entities (
 project_lifetime_id uuid not null references orbit_private.application_projects(id), kind text not null,
 entity_key text not null, first_seen_at timestamptz not null default clock_timestamp(), last_seen_at timestamptz not null default clock_timestamp(), removed_at timestamptz,
 primary key(project_lifetime_id,kind,entity_key),
 check(kind in ('feature','story','workItem','person','role','platform','meeting','holiday','timeOff','milestone'))
);
create table orbit_private.application_story_links (
 project_lifetime_id uuid not null references orbit_private.application_projects(id), feature_key text not null, task_key text not null, story_key text not null,
 primary key(project_lifetime_id,feature_key,task_key)
);
create table orbit_private.application_poker_games (
 room_id uuid primary key, user_id uuid not null, project_key text not null, created_at timestamptz not null,
 started_at timestamptz, segment_started_at timestamptz, closed_at timestamptz, close_reason text, presence_deadline timestamptz,
 duration_seconds numeric not null default 0, duration_known boolean not null default true, rounds integer not null default 0
);
create table orbit_private.application_poker_players (
 room_id uuid not null references orbit_private.application_poker_games(room_id), participant_id uuid not null,
 first_joined_at timestamptz not null, ever_voter boolean not null, primary key(room_id,participant_id)
);
create table orbit_private.application_activity_sessions (
 session_id uuid primary key, surface text not null check(surface in ('landing','planner')),
 user_id uuid, visitor_hash text, started_at timestamptz not null default clock_timestamp(), last_seen_at timestamptz not null default clock_timestamp(),
 ended_at timestamptz, active_seconds bigint not null default 0 check(active_seconds>=0), last_sequence integer not null default -1,
 check((surface='planner' and user_id is not null and visitor_hash is null) or (surface='landing' and user_id is null and visitor_hash ~ '^[a-f0-9]{64}$'))
);
create index application_activity_owner on orbit_private.application_activity_sessions(user_id,started_at);
create index application_activity_surface on orbit_private.application_activity_sessions(surface,started_at);
create table orbit_private.application_activity_limits (key text primary key, window_start timestamptz not null, attempts integer not null);
create table orbit_private.application_audit (
 id bigint generated always as identity primary key, admin text not null, action text not null, target uuid, details jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default clock_timestamp()
);
revoke all on orbit_private.application_analytics_settings,orbit_private.application_accounts,orbit_private.application_projects,
 orbit_private.application_entities,orbit_private.application_story_links,orbit_private.application_poker_games,orbit_private.application_poker_players,
 orbit_private.application_activity_sessions,orbit_private.application_activity_limits,orbit_private.application_audit from public,anon,authenticated;

-- JSON extraction also works in minimal integration auth schemas with only an id.
create function orbit_private.application_timestamp(p_text text) returns timestamptz
language plpgsql immutable set search_path='' as $$begin return p_text::timestamptz;exception when others then return null;end;$$;
revoke all on function orbit_private.application_timestamp(text) from public,anon,authenticated;
create function orbit_private.application_account(p_row jsonb,p_deleted boolean default false) returns void
language plpgsql set search_path='' as $$
declare at_time timestamptz:=clock_timestamp(); created timestamptz:=orbit_private.application_timestamp(p_row->>'created_at');
 metadata jsonb:=coalesce(p_row->'raw_user_meta_data','{}'::jsonb);
 legacy_name text:=regexp_replace(btrim(regexp_replace(coalesce(nullif(metadata->>'full_name',''),metadata->>'name',''),'[[:cntrl:]]','','g')),'[[:space:]]+',' ','g');
 first_name text:=coalesce(nullif(btrim(metadata->>'first_name'),''),nullif(btrim(metadata->>'given_name'),''),nullif(split_part(legacy_name,' ',1),''),'');
 last_name text:=coalesce(nullif(btrim(metadata->>'last_name'),''),nullif(btrim(metadata->>'family_name'),''),nullif(btrim(substr(legacy_name,length(split_part(legacy_name,' ',1))+1)),''),'');
begin
 insert into orbit_private.application_accounts(user_id,email,first_name,last_name,created_at,created_at_source,deleted_at)
 values((p_row->>'id')::uuid,left(p_row->>'email',254),left(first_name,100),left(last_name,100),coalesce(created,at_time),case when created is null then 'observed' else 'auth' end,case when p_deleted then at_time end)
 on conflict(user_id) do update set email=excluded.email,first_name=excluded.first_name,last_name=excluded.last_name,
 created_at=case when excluded.created_at_source='auth' then excluded.created_at else orbit_private.application_accounts.created_at end,
 created_at_source=case when excluded.created_at_source='auth' then 'auth' else orbit_private.application_accounts.created_at_source end,
 deleted_at=case when p_deleted then at_time else orbit_private.application_accounts.deleted_at end;
end;$$;
revoke all on function orbit_private.application_account(jsonb,boolean) from public,anon,authenticated;

create function orbit_private.application_snapshot(p_user uuid,p_workspace uuid,p_snapshot jsonb,p_baseline boolean default false) returns void
language plpgsql set search_path='' as $$
declare at_time timestamptz:=clock_timestamp(); project jsonb; fact uuid; entry record; created timestamptz;
 story record; story_key text; used_stories text[]; member text;
begin
 -- The RPC validates and saves first; recording only committed snapshots avoids phantom deletions on every autosave.
 update orbit_private.application_projects f set deleted_at=at_time,last_seen_at=at_time
 where f.user_id=p_user and f.deleted_at is null and not exists(select 1 from jsonb_array_elements(p_snapshot->'projects') p where p->>'id'=f.project_key);
 update orbit_private.application_entities e set removed_at=coalesce(e.removed_at,at_time)
 from orbit_private.application_projects f where f.id=e.project_lifetime_id and f.user_id=p_user and f.deleted_at is not null;
 for project in select value from jsonb_array_elements(p_snapshot->'projects') loop
  select id into fact from orbit_private.application_projects where user_id=p_user and project_key=project->>'id' and deleted_at is null;
  if fact is null then
   created:=case when p_baseline then orbit_private.application_timestamp((project#>>'{data,createdAt}')||'T00:00:00Z') else at_time end;
   insert into orbit_private.application_projects(user_id,workspace_id,project_key,name,created_at,created_at_source)
    values(p_user,p_workspace,project->>'id',project->>'name',created,case when not p_baseline then 'observed' when created is null then 'unknown' else 'baseline-date' end) returning id into fact;
  else update orbit_private.application_projects set name=project->>'name',last_seen_at=at_time where id=fact; end if;
  update orbit_private.application_entities set removed_at=at_time where project_lifetime_id=fact and removed_at is null;
  -- A legacy singleton that gains role work items keeps its identity. Member
  -- bindings also survive role reorder/removal; splitting a group creates a new story.
  used_stories:='{}'::text[];
  for story in select t->>'featureId' feature_key,case when nullif(t->>'storyId','') is not null then 'story:'||(t->>'storyId') else 'task:'||(t->>'id') end grouping_key,
   array_agg(t->>'id' order by position) members,min(position) first_position
   from jsonb_array_elements(project#>'{data,tasks}') with ordinality as tasks(t,position)
   group by t->>'featureId',case when nullif(t->>'storyId','') is not null then 'story:'||(t->>'storyId') else 'task:'||(t->>'id') end order by min(position)
  loop
   select l.story_key into story_key from orbit_private.application_story_links l
    where l.project_lifetime_id=fact and l.feature_key=story.feature_key and l.task_key=any(story.members) and not l.story_key=any(used_stories)
    order by array_position(story.members,l.task_key) limit 1;
   story_key:=coalesce(story_key,story.feature_key||'|'||story.grouping_key);
   if story_key=any(used_stories) then story_key:=story_key||'|split:'||story.members[1];end if;
   used_stories:=array_append(used_stories,story_key);
   insert into orbit_private.application_entities(project_lifetime_id,kind,entity_key,first_seen_at,last_seen_at)
    values(fact,'story',story_key,at_time,at_time) on conflict(project_lifetime_id,kind,entity_key) do update set removed_at=null,last_seen_at=excluded.last_seen_at;
   foreach member in array story.members loop
    insert into orbit_private.application_story_links(project_lifetime_id,feature_key,task_key,story_key) values(fact,story.feature_key,member,story_key)
     on conflict(project_lifetime_id,feature_key,task_key) do update set story_key=excluded.story_key;
   end loop;
  end loop;
  for entry in
   select 'feature'::text kind,value->>'id' entity_key from jsonb_array_elements(project#>'{data,features}')
   union select 'workItem',value->>'id' from jsonb_array_elements(project#>'{data,tasks}')
   union select 'person',value->>'id' from jsonb_array_elements(project#>'{data,people}')
   union select 'role',value->>'id' from jsonb_array_elements(project#>'{data,roles}')
   union select 'platform',lower(btrim(value->>'platform')) from jsonb_array_elements(project#>'{data,roles}') where length(btrim(value->>'platform'))>0
   union select 'platform',lower(btrim(value->>'platform')) from jsonb_array_elements(project#>'{data,tasks}') where length(btrim(value->>'platform'))>0
   union select 'meeting',value->>'id' from jsonb_array_elements(project#>'{data,meetings}')
   union select 'holiday',value->>'date' from jsonb_array_elements(project#>'{data,holidays}')
   union select 'timeOff',value->>'id' from jsonb_array_elements(project#>'{data,leave}')
   union select 'milestone',value->>'id' from jsonb_array_elements(project#>'{data,milestones}')
  loop
   insert into orbit_private.application_entities(project_lifetime_id,kind,entity_key,first_seen_at,last_seen_at)
    values(fact,entry.kind,entry.entity_key,at_time,at_time)
    on conflict(project_lifetime_id,kind,entity_key) do update set removed_at=null,last_seen_at=excluded.last_seen_at;
  end loop;
 end loop;
end;$$;
revoke all on function orbit_private.application_snapshot(uuid,uuid,jsonb,boolean) from public,anon,authenticated;

-- Preserve the existing atomic storage implementation, including revision and identity checks.
alter function public.orbit_save_workspace(jsonb,bigint) rename to application_save_workspace_storage;
alter function public.application_save_workspace_storage(jsonb,bigint) set schema orbit_private;
revoke all on function orbit_private.application_save_workspace_storage(jsonb,bigint) from public,anon,authenticated;
create function public.orbit_save_workspace(p_snapshot jsonb,p_expected_revision bigint) returns bigint
language plpgsql security definer set search_path='' as $$
declare result bigint; workspace uuid;
begin
 result:=orbit_private.application_save_workspace_storage(p_snapshot,p_expected_revision);
 select id into workspace from public.orbit_workspaces where owner_user_id=auth.uid();
 perform orbit_private.application_snapshot(auth.uid(),workspace,p_snapshot,false);
 return result;
end;$$;
revoke all on function public.orbit_save_workspace(jsonb,bigint) from public,anon;
grant execute on function public.orbit_save_workspace(jsonb,bigint) to authenticated;

create function orbit_private.application_auth_event() returns trigger
language plpgsql security definer set search_path='' as $$
declare at_time timestamptz:=clock_timestamp();
begin
 if TG_OP='DELETE' then
  perform orbit_private.application_account(to_jsonb(OLD),true);
  update orbit_private.application_projects set deleted_at=coalesce(deleted_at,at_time),last_seen_at=at_time where user_id=OLD.id and deleted_at is null;
  update orbit_private.application_entities e set removed_at=coalesce(e.removed_at,at_time) from orbit_private.application_projects p where p.id=e.project_lifetime_id and p.user_id=OLD.id;
  update orbit_private.application_activity_sessions set ended_at=coalesce(ended_at,last_seen_at) where user_id=OLD.id;
  return OLD;
 end if;
 perform orbit_private.application_account(to_jsonb(NEW),false);return NEW;
end;$$;
revoke all on function orbit_private.application_auth_event() from public,anon,authenticated;
create trigger orbit_application_auth_upsert after insert or update on auth.users for each row execute function orbit_private.application_auth_event();
create trigger orbit_application_auth_delete before delete on auth.users for each row execute function orbit_private.application_auth_event();

create function orbit_private.application_poker_room_event() returns trigger
language plpgsql security definer set search_path='' as $$
declare fact orbit_private.application_poker_games%rowtype; finish timestamptz; lease_finish timestamptz; departure timestamptz; at_time timestamptz:=clock_timestamp();
begin
 if TG_OP='INSERT' then
  insert into orbit_private.application_poker_games(room_id,user_id,project_key,created_at,started_at,segment_started_at)
   values(NEW.id,NEW.owner_user_id,NEW.project_id,NEW.created_at,NEW.started_at,NEW.started_at) on conflict do nothing;return NEW;
 end if;
 select * into fact from orbit_private.application_poker_games where room_id=OLD.id for update;
 if not found then return case when TG_OP='DELETE' then OLD else NEW end; end if;
 if TG_OP='DELETE' then
  finish:=at_time;
  if OLD.empty_since is not null then finish:=least(at_time,OLD.empty_since+interval '10 seconds');
  elsif OLD.started_at is null then finish:=least(at_time,OLD.created_at+interval '90 seconds');
  else
   select max(case when left_at is null then last_seen+interval '60 seconds' else left_at end) into lease_finish from orbit_private.poker_connections where room_id=OLD.id;
   finish:=least(at_time,coalesce(lease_finish,fact.presence_deadline,at_time));
  end if;
  update orbit_private.application_poker_games set closed_at=coalesce(closed_at,finish),close_reason=coalesce(close_reason,'deleted'),
   duration_seconds=duration_seconds+case when closed_at is null and segment_started_at is not null then greatest(0,extract(epoch from finish-segment_started_at)) else 0 end,segment_started_at=null where room_id=OLD.id;
  return OLD;
 end if;
 if NEW.started_at is not null and fact.started_at is null then
  update orbit_private.application_poker_games set started_at=NEW.started_at,segment_started_at=NEW.started_at where room_id=NEW.id;
 end if;
 if NEW.closed and not OLD.closed then
  finish:=at_time;
  if NEW.closed_reason='empty' then
   if OLD.empty_since is not null then finish:=least(at_time,OLD.empty_since+interval '10 seconds');
   elsif OLD.started_at is null then finish:=least(at_time,OLD.created_at+interval '90 seconds');
   else
    select max(case when left_at is null then last_seen+interval '60 seconds' else left_at end),max(left_at)
      into lease_finish,departure from orbit_private.poker_connections where room_id=NEW.id;
    finish:=least(at_time,coalesce(lease_finish,departure,fact.presence_deadline,at_time));
   end if;
  end if;
  update orbit_private.application_poker_games set closed_at=finish,close_reason=NEW.closed_reason,
   duration_seconds=duration_seconds+case when segment_started_at is not null then greatest(0,extract(epoch from finish-segment_started_at)) else 0 end,
   segment_started_at=null where room_id=NEW.id;
 elsif not NEW.closed and OLD.closed then
  update orbit_private.application_poker_games set closed_at=null,close_reason=null,segment_started_at=at_time where room_id=NEW.id;
 end if;
 return NEW;
end;$$;
revoke all on function orbit_private.application_poker_room_event() from public,anon,authenticated;
create trigger orbit_application_poker_room after insert or update on public.orbit_poker_rooms for each row execute function orbit_private.application_poker_room_event();
create trigger orbit_application_poker_room_delete before delete on public.orbit_poker_rooms for each row execute function orbit_private.application_poker_room_event();
create function orbit_private.application_poker_connection_event() returns trigger
language plpgsql security definer set search_path='' as $$
declare spectator boolean;
begin
 -- Keep the last effective lease deadline independently of disposable presence
 -- rows. Runtime cleanup and account cascades may remove those rows before the
 -- room closes; late observation must not turn inactive days into game time.
 if TG_OP='DELETE' then
  update orbit_private.application_poker_games set presence_deadline=greatest(presence_deadline,
   case when OLD.left_at is null then OLD.last_seen+interval '60 seconds' else OLD.left_at end) where room_id=OLD.room_id;
  return OLD;
 end if;
 update orbit_private.application_poker_games set presence_deadline=greatest(presence_deadline,
  case when NEW.left_at is null then NEW.last_seen+interval '60 seconds' else NEW.left_at end) where room_id=NEW.room_id;
 if NEW.left_at is null then
  select p.spectator into spectator from public.orbit_poker_participants p where p.id=NEW.participant_id;
  insert into orbit_private.application_poker_players(room_id,participant_id,first_joined_at,ever_voter)
   values(NEW.room_id,NEW.participant_id,NEW.last_seen,not coalesce(spectator,false))
   on conflict(room_id,participant_id) do update set ever_voter=orbit_private.application_poker_players.ever_voter or excluded.ever_voter;
 end if;return NEW;
end;$$;
revoke all on function orbit_private.application_poker_connection_event() from public,anon,authenticated;
create trigger orbit_application_poker_connection after insert or update on orbit_private.poker_connections for each row execute function orbit_private.application_poker_connection_event();
create trigger orbit_application_poker_connection_delete before delete on orbit_private.poker_connections for each row execute function orbit_private.application_poker_connection_event();
create function orbit_private.application_poker_round_event() returns trigger language plpgsql security definer set search_path='' as $$begin
 update orbit_private.application_poker_games set rounds=rounds+1 where room_id=NEW.room_id;return NEW;end;$$;
revoke all on function orbit_private.application_poker_round_event() from public,anon,authenticated;
create trigger orbit_application_poker_round after insert on public.orbit_poker_rounds for each row execute function orbit_private.application_poker_round_event();

-- Baseline: existing inventories are observable; historic deleted records and closed durations are not recoverable.
do $$declare account record; workspace record; previous text:=current_setting('request.jwt.claim.sub',true); snapshot jsonb;
begin
 for account in select to_jsonb(u) document from auth.users u loop perform orbit_private.application_account(account.document,false);end loop;
 for workspace in select id,owner_user_id from public.orbit_workspaces loop
  perform set_config('request.jwt.claim.sub',workspace.owner_user_id::text,true);
  snapshot:=public.orbit_get_workspace()->'workspace';
  perform orbit_private.application_snapshot(workspace.owner_user_id,workspace.id,snapshot,true);
 end loop;
 perform set_config('request.jwt.claim.sub',coalesce(previous,''),true);
end;$$;
insert into orbit_private.application_poker_games(room_id,user_id,project_key,created_at,started_at,segment_started_at,close_reason,duration_known,rounds,presence_deadline)
 select r.id,r.owner_user_id,r.project_id,r.created_at,r.started_at,case when not r.closed then clock_timestamp() end,r.closed_reason,false,
 (select count(*) from public.orbit_poker_rounds rd where rd.room_id=r.id),
 (select max(case when c.left_at is null then c.last_seen+interval '60 seconds' else c.left_at end) from orbit_private.poker_connections c where c.room_id=r.id)
 from public.orbit_poker_rooms r;
insert into orbit_private.application_poker_players(room_id,participant_id,first_joined_at,ever_voter)
 select p.room_id,p.id,p.created_at,not p.spectator from public.orbit_poker_participants p
 where exists(select 1 from orbit_private.poker_connections c where c.participant_id=p.id)
 or exists(select 1 from public.orbit_poker_votes v where v.participant_id=p.id);

create function public.orbit_application_activity_allow(p_key text) returns boolean
language plpgsql security definer set search_path='' as $$declare bucket timestamptz:=date_trunc('minute',clock_timestamp()); n integer;
begin
 if p_key!~'^[a-f0-9]{64}$' then raise exception 'Invalid activity key' using errcode='22023';end if;
 delete from orbit_private.application_activity_limits where window_start<bucket-interval '10 minutes';
 insert into orbit_private.application_activity_limits(key,window_start,attempts) values(p_key,bucket,1)
 on conflict(key) do update set window_start=bucket,attempts=case when orbit_private.application_activity_limits.window_start=bucket then orbit_private.application_activity_limits.attempts+1 else 1 end returning attempts into n;
 return n<=120;
end;$$;
create function public.orbit_application_activity(p_session uuid,p_surface text,p_user uuid default null,p_visitor text default null,p_seconds integer default 0,p_end boolean default false,p_sequence integer default 0) returns void
language plpgsql security definer set search_path='' as $$
declare previous orbit_private.application_activity_sessions%rowtype; at_time timestamptz:=clock_timestamp(); allowed integer;
begin
 if p_surface not in ('landing','planner') or p_session is null or p_seconds is null or p_seconds not between 0 and 60 or p_sequence is null or p_sequence not between 0 and 1000000000
 or (p_surface='planner' and (p_user is null or p_visitor is not null or not exists(select 1 from auth.users where id=p_user)))
 or (p_surface='landing' and (p_user is not null or p_visitor is null or p_visitor!~'^[a-f0-9]{64}$')) then raise exception 'Invalid activity event' using errcode='22023';end if;
 insert into orbit_private.application_activity_sessions(session_id,surface,user_id,visitor_hash,started_at,last_seen_at)
  values(p_session,p_surface,p_user,p_visitor,at_time,at_time) on conflict(session_id) do nothing;
 select * into previous from orbit_private.application_activity_sessions where session_id=p_session for update;
 if previous.surface<>p_surface or previous.user_id is distinct from p_user or previous.visitor_hash is distinct from p_visitor then raise exception 'Activity identity mismatch' using errcode='22023';end if;
 if previous.ended_at is not null or p_sequence<=previous.last_sequence then return;end if;
 allowed:=least(p_seconds,greatest(0,floor(extract(epoch from at_time-previous.started_at)+2)::integer-previous.active_seconds));
 update orbit_private.application_activity_sessions set active_seconds=active_seconds+allowed,last_sequence=p_sequence,
  last_seen_at=case when allowed>0 or previous.last_sequence<0 then at_time else last_seen_at end,
  ended_at=case when p_end then at_time end where session_id=p_session;
end;$$;

create function public.orbit_application_audit(p_admin text,p_action text,p_target uuid,p_details jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path='' as $$begin
 if length(p_admin) not between 1 and 254 or length(p_action) not between 1 and 100 or jsonb_typeof(p_details) is distinct from 'object' or octet_length(p_details::text)>4096 then raise exception 'Invalid audit event' using errcode='22023';end if;
 insert into orbit_private.application_audit(admin,action,target,details) values(p_admin,p_action,p_target,p_details);
end;$$;

create function public.orbit_application_delete_project(p_user uuid,p_project text,p_expected_revision bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare previous text:=current_setting('request.jwt.claim.sub',true); snapshot jsonb; project jsonb; result bigint; workspace uuid;
begin
 if p_user is null or p_project!~'^[A-Za-z0-9_-]{1,100}$' then raise exception 'Invalid project' using errcode='22023';end if;
 select id into workspace from public.orbit_workspaces where owner_user_id=p_user for update;
 if not found then raise exception 'Workspace not found' using errcode='PT404';end if;
 perform set_config('request.jwt.claim.sub',p_user::text,true);
 snapshot:=public.orbit_get_workspace()->'workspace';
 if not exists(select 1 from jsonb_array_elements(snapshot->'projects') p where p->>'id'=p_project) then raise exception 'Project not found' using errcode='PT404';end if;
 snapshot:=jsonb_set(snapshot,'{projects}',coalesce((select jsonb_agg(p) from jsonb_array_elements(snapshot->'projects') p where p->>'id'<>p_project),'[]'::jsonb));
 if snapshot->>'activeId'=p_project then snapshot:=jsonb_set(snapshot,'{activeId}',coalesce(snapshot#>'{projects,0,id}','null'::jsonb));end if;
 result:=public.orbit_save_workspace(snapshot,p_expected_revision);
 perform set_config('request.jwt.claim.sub',coalesce(previous,''),true);return jsonb_build_object('revision',result);
exception when others then perform set_config('request.jwt.claim.sub',coalesce(previous,''),true);raise;
end;$$;

create function public.orbit_application_user_workspace(p_user uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare previous text:=current_setting('request.jwt.claim.sub',true); result jsonb;
begin
 if not exists(select 1 from auth.users where id=p_user) then raise exception 'User not found' using errcode='PT404';end if;
 if not exists(select 1 from public.orbit_workspaces where owner_user_id=p_user) then return jsonb_build_object('revision',null,'workspace',jsonb_build_object('version',1,'activeId',null,'preferences','{}'::jsonb,'projects','[]'::jsonb));end if;
 perform set_config('request.jwt.claim.sub',p_user::text,true);result:=public.orbit_get_workspace();
 perform set_config('request.jwt.claim.sub',coalesce(previous,''),true);return result;
exception when others then perform set_config('request.jwt.claim.sub',coalesce(previous,''),true);raise;
end;$$;

create function orbit_private.application_inventory(p_user uuid) returns jsonb
language sql stable set search_path='' as $$
 with active as (select e.kind,e.entity_key from orbit_private.application_entities e join orbit_private.application_projects p on p.id=e.project_lifetime_id where p.user_id=p_user and p.deleted_at is null and e.removed_at is null)
 select jsonb_build_object(
  'projects',(select count(*) from orbit_private.application_projects where user_id=p_user and deleted_at is null),
  'features',count(*) filter(where kind='feature'),'stories',count(*) filter(where kind='story'),'workItems',count(*) filter(where kind='workItem'),
  'people',count(*) filter(where kind='person'),'roles',count(*) filter(where kind='role'),'platforms',count(distinct entity_key) filter(where kind='platform'),
  'pokerGames',(select count(*) from public.orbit_poker_rooms where owner_user_id=p_user),
  'meetings',count(*) filter(where kind='meeting'),'holidays',count(*) filter(where kind='holiday'),'timeOff',count(*) filter(where kind='timeOff'),'milestones',count(*) filter(where kind='milestone')) from active;
$$;
create function orbit_private.application_lifetime(p_user uuid) returns jsonb
language sql stable set search_path='' as $$
 with entities as(select e.kind,e.entity_key from orbit_private.application_entities e join orbit_private.application_projects p on p.id=e.project_lifetime_id where p.user_id=p_user)
 select jsonb_build_object(
  'projectsCreated',(select count(*) from orbit_private.application_projects where user_id=p_user),
  'projectsDeleted',(select count(*) from orbit_private.application_projects where user_id=p_user and deleted_at is not null),
  'pokerGamesCreated',(select count(*) from orbit_private.application_poker_games where user_id=p_user),
  'featuresCreated',count(*) filter(where kind='feature'),'storiesCreated',count(*) filter(where kind='story'),'workItemsCreated',count(*) filter(where kind='workItem'),
  'peopleCreated',count(*) filter(where kind='person'),'rolesCreated',count(*) filter(where kind='role'),'platformsCreated',count(distinct entity_key) filter(where kind='platform'),
  'meetingsCreated',count(*) filter(where kind='meeting'),'holidaysCreated',count(*) filter(where kind='holiday'),'timeOffCreated',count(*) filter(where kind='timeOff'),'milestonesCreated',count(*) filter(where kind='milestone')) from entities;
$$;
create function orbit_private.application_poker_stats(p_user uuid,p_days integer) returns jsonb
language sql stable set search_path='' as $$
 with games as(
  select g.*,(select count(*) from orbit_private.application_poker_players p where p.room_id=g.room_id) participants
  from orbit_private.application_poker_games g where p_user is null or g.user_id=p_user
 ), played as(select * from games where participants>0)
 select jsonb_build_object(
  'games',(select count(*) from games),
  'gamesInPeriod',count(*) filter(where created_at>=clock_timestamp()-make_interval(days=>p_days)),
  'gamesPerWeek',round((count(*) filter(where created_at>=clock_timestamp()-make_interval(days=>p_days)))::numeric*7/p_days,2),
  'lastPlayedAt',max(started_at),
  'participants',jsonb_build_object('min',min(participants),'max',max(participants),'median',percentile_cont(0.5) within group(order by participants),'average',round(avg(participants),2)),
  'averageDurationSeconds',round(avg(duration_seconds) filter(where closed_at is not null and duration_known),2),
  'durationSamples',count(*) filter(where closed_at is not null and duration_known),
  'rounds',coalesce(sum(rounds),0),
  'uniqueParticipants',coalesce(sum(participants),0)) from played;
$$;
create function orbit_private.application_engagement(p_user uuid,p_days integer) returns jsonb
language sql stable set search_path='' as $$
 with sessions as(select * from orbit_private.application_activity_sessions where surface='planner' and (p_user is null or user_id=p_user) and started_at>=clock_timestamp()-make_interval(days=>p_days)),
 visits as(select user_id,(started_at at time zone 'UTC')::date as visit_date from sessions group by user_id,(started_at at time zone 'UTC')::date),
 gaps as(select extract(epoch from (visit_date::timestamp-(lag(visit_date) over(partition by user_id order by visit_date))::timestamp))/86400 gap from visits)
 select jsonb_build_object('sessions',count(*),'activeSeconds',coalesce(sum(active_seconds),0),
 'averageSessionSeconds',round(avg(active_seconds),2),'returningDays',(select coalesce(sum(greatest(visits-1,0)),0) from (select count(*) visits from visits group by user_id) v),
 'lastSeenAt',max(last_seen_at),'averageDaysBetweenVisits',(select round(avg(gap),2) from gaps where gap>0)) from sessions;
$$;
create function orbit_private.application_project_duration(p_user uuid) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('deleted',count(*),'averageSeconds',round(avg(extract(epoch from deleted_at-created_at)) filter(where created_at_source='observed'),2),
 'medianSeconds',percentile_cont(0.5) within group(order by extract(epoch from deleted_at-created_at)) filter(where created_at_source='observed'),
 'samples',count(*) filter(where created_at_source='observed' and created_at is not null),
 'approximateSamples',count(*) filter(where created_at_source='baseline-date'))
 from orbit_private.application_projects where deleted_at is not null and (p_user is null or user_id=p_user);
$$;

create function public.orbit_application_analytics(p_user_id uuid default null,p_days integer default 30) returns jsonb
language plpgsql security definer set search_path='' as $$
declare users jsonb; current_total jsonb; lifetime_total jsonb; landing jsonb;
begin
 if p_days is null or p_days not between 1 and 3650 then raise exception 'Invalid analytics period' using errcode='22023';end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',a.user_id,'email',a.email,'firstName',a.first_name,'lastName',a.last_name,'createdAt',a.created_at,'createdAtSource',a.created_at_source,'deletedAt',a.deleted_at,
  'workspaceRevision',(select revision from public.orbit_workspaces where owner_user_id=a.user_id),
  'current',orbit_private.application_inventory(a.user_id),'lifetime',orbit_private.application_lifetime(a.user_id),
  'poker',orbit_private.application_poker_stats(a.user_id,p_days),'planner',orbit_private.application_engagement(a.user_id,p_days),'projectLifetime',orbit_private.application_project_duration(a.user_id),
  'projects',coalesce((select jsonb_agg(jsonb_build_object('lifecycleId',p.id,'id',p.project_key,'name',p.name,'createdAt',p.created_at,'createdAtSource',p.created_at_source,'firstSeenAt',p.first_seen_at,'deletedAt',p.deleted_at,
   'lifetimeSeconds',case when p.deleted_at is not null and p.created_at is not null then greatest(0,extract(epoch from p.deleted_at-p.created_at)) end) order by p.first_seen_at desc) from orbit_private.application_projects p where p.user_id=a.user_id),'[]'::jsonb)
 ) order by a.created_at desc),'[]'::jsonb) into users from orbit_private.application_accounts a where p_user_id is null or a.user_id=p_user_id;
 select coalesce(jsonb_object_agg(key,total),orbit_private.application_inventory(null)) into current_total from(select v.key,sum(v.value::numeric) total from jsonb_array_elements(users) u cross join lateral jsonb_each_text(u->'current') v group by v.key) s;
 if p_user_id is null then
  current_total:=jsonb_set(current_total,'{platforms}',to_jsonb((select count(distinct e.entity_key) from orbit_private.application_entities e join orbit_private.application_projects p on p.id=e.project_lifetime_id where e.kind='platform' and e.removed_at is null and p.deleted_at is null)));
 end if;
 select coalesce(jsonb_object_agg(key,total),orbit_private.application_lifetime(null)) into lifetime_total from(select v.key,sum(v.value::numeric) total from jsonb_array_elements(users) u cross join lateral jsonb_each_text(u->'lifetime') v group by v.key) s;
 -- Platform labels denote types, so global totals deduplicate across accounts too.
 current_total:=current_total||jsonb_build_object('platforms',(select count(distinct e.entity_key) from orbit_private.application_entities e join orbit_private.application_projects p on p.id=e.project_lifetime_id
  where e.kind='platform' and e.removed_at is null and p.deleted_at is null and (p_user_id is null or p.user_id=p_user_id)));
 lifetime_total:=lifetime_total||jsonb_build_object('platformsCreated',(select count(distinct e.entity_key) from orbit_private.application_entities e join orbit_private.application_projects p on p.id=e.project_lifetime_id
  where e.kind='platform' and (p_user_id is null or p.user_id=p_user_id)));
 select jsonb_build_object('visitors',count(distinct visitor_hash),'sessions',count(*),'activeSeconds',coalesce(sum(active_seconds),0),'averageSessionSeconds',round(avg(active_seconds),2),
  'returningVisitors',(select count(*) from (select visitor_hash from orbit_private.application_activity_sessions where surface='landing' and started_at>=clock_timestamp()-make_interval(days=>p_days) group by visitor_hash having count(*)>1) repeat_visitors)) into landing
 from orbit_private.application_activity_sessions where surface='landing' and started_at>=clock_timestamp()-make_interval(days=>p_days);
 return jsonb_build_object('trackingStartedAt',(select started_at from orbit_private.application_analytics_settings),'generatedAt',clock_timestamp(),'periodDays',p_days,
  'coverage',jsonb_build_object('history','Existing inventory is a baseline. Deleted accounts and projects before tracking began cannot be reconstructed. Lifetime creation counts mean unique records observed since the baseline.',
   'inventory','People and roles are project-owned records: copied team entries count in each project. Platforms are distinct normalized labels, deduplicated across the selected accounts. Stories group role work items in the same epic; adding a role does not create another story.',
   'engagement','Landing and planner engagement include only browsers that enabled optional first-party analytics. Visitors are browser identifiers, not verified people; inactive and hidden time is excluded.',
   'poker','A game is one room, not one voting round. Frequency counts played rooms by room creation date. Participants are distinct joined seats, including facilitator and spectators. Repeat tabs reuse a seat; unused rooms are excluded from participant and duration statistics. Duration excludes manual closed intervals; pre-tracking durations are unavailable.'),
  'totals',jsonb_build_object('accounts',(select count(*) from orbit_private.application_accounts where deleted_at is null and (p_user_id is null or user_id=p_user_id)),
   'deletedAccounts',(select count(*) from orbit_private.application_accounts where deleted_at is not null and (p_user_id is null or user_id=p_user_id)),
   'current',current_total,'lifetime',lifetime_total,'poker',orbit_private.application_poker_stats(p_user_id,p_days),'planner',orbit_private.application_engagement(p_user_id,p_days),'projectLifetime',orbit_private.application_project_duration(p_user_id)),
  'users',users,'landing',landing);
end;$$;

revoke all on function orbit_private.application_inventory(uuid),orbit_private.application_lifetime(uuid),orbit_private.application_poker_stats(uuid,integer),orbit_private.application_engagement(uuid,integer),orbit_private.application_project_duration(uuid) from public,anon,authenticated;
revoke all on function public.orbit_application_activity_allow(text),public.orbit_application_activity(uuid,text,uuid,text,integer,boolean,integer),public.orbit_application_audit(text,text,uuid,jsonb),
 public.orbit_application_delete_project(uuid,text,bigint),public.orbit_application_user_workspace(uuid),public.orbit_application_analytics(uuid,integer) from public,anon,authenticated;
-- The production/local real-auth database has service_role; minimal unit auth stubs need not create it.
do $$begin if exists(select 1 from pg_roles where rolname='service_role') then
 grant execute on function public.orbit_application_activity_allow(text),public.orbit_application_activity(uuid,text,uuid,text,integer,boolean,integer),public.orbit_application_audit(text,text,uuid,jsonb),
 public.orbit_application_delete_project(uuid,text,bigint),public.orbit_application_user_workspace(uuid),public.orbit_application_analytics(uuid,integer) to service_role;
end if;end;$$;
commit;
