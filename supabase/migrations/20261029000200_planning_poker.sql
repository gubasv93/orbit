-- Additive Planning Poker domain. Workspace entities remain in the existing planner.
-- No FK to orbit_projects: the revision-safe workspace RPC replaces those rows.
begin;
create table public.orbit_poker_rooms (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.orbit_workspaces(id) on delete cascade,
 project_id text not null, owner_user_id uuid not null references auth.users(id) on delete cascade,
 invite_token text not null unique check(invite_token ~ '^[a-f0-9]{64}$'),
 token_hash text not null unique, name text not null check(length(btrim(name)) between 1 and 100),
 deck jsonb not null check(jsonb_typeof(deck)='array'), settings jsonb not null,
 closed boolean not null default false, created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp()
);
create index orbit_poker_rooms_owner on public.orbit_poker_rooms(owner_user_id,project_id);
create table public.orbit_poker_participants (
 id uuid primary key default gen_random_uuid(), room_id uuid not null references public.orbit_poker_rooms(id) on delete cascade,
 user_id uuid references auth.users(id) on delete cascade, session_hash text,
 name text not null check(length(btrim(name)) between 1 and 60), spectator boolean not null default false,
 selected_issue text not null default 'free', last_seen timestamptz not null default clock_timestamp(),
 created_at timestamptz not null default clock_timestamp(), unique(room_id,user_id), unique(room_id,session_hash)
);
create table public.orbit_poker_rounds (
 id uuid primary key default gen_random_uuid(), room_id uuid not null references public.orbit_poker_rooms(id) on delete cascade,
 issue text not null, number integer not null, revealed boolean not null default false, accepted text,
 created_at timestamptz not null default clock_timestamp(), revealed_at timestamptz, unique(room_id,issue,number)
);
create index orbit_poker_rounds_latest on public.orbit_poker_rounds(room_id,issue,number desc);
create table public.orbit_poker_issues (
 room_id uuid not null references public.orbit_poker_rooms(id) on delete cascade,
 logical_key text not null, canonical_key text not null, feature_id text not null, story_id text,
 primary key(room_id,logical_key)
);
create table public.orbit_poker_votes (
 round_id uuid not null references public.orbit_poker_rounds(id) on delete cascade,
 participant_id uuid not null references public.orbit_poker_participants(id) on delete cascade,
 value text not null check(length(value) between 1 and 32), updated_at timestamptz not null default clock_timestamp(),
 primary key(round_id,participant_id)
);
create table public.orbit_poker_decks (
 owner_user_id uuid not null references auth.users(id) on delete cascade, name text not null check(length(btrim(name)) between 1 and 60),
 values jsonb not null check(jsonb_typeof(values)='array'), primary key(owner_user_id,name)
);
create table public.orbit_poker_publications (
 room_id uuid not null references public.orbit_poker_rooms(id) on delete cascade, operation_id uuid not null,
 story_key text not null, result jsonb not null, created_at timestamptz not null default clock_timestamp(),
 primary key(room_id,operation_id)
);
create table orbit_private.poker_limits (
 key text primary key, window_start timestamptz not null, attempts integer not null
);
-- All domain rows are accessible only through projected, authorized RPC responses.
alter table public.orbit_poker_rooms enable row level security;
alter table public.orbit_poker_participants enable row level security;
alter table public.orbit_poker_rounds enable row level security;
alter table public.orbit_poker_votes enable row level security;
alter table public.orbit_poker_issues enable row level security;
alter table public.orbit_poker_decks enable row level security;
alter table public.orbit_poker_publications enable row level security;
revoke all on public.orbit_poker_rooms,public.orbit_poker_participants,public.orbit_poker_rounds,public.orbit_poker_votes,public.orbit_poker_decks,public.orbit_poker_publications,public.orbit_poker_issues from public,anon,authenticated;

create function orbit_private.poker_limit(p_key text,p_max integer,p_seconds integer) returns void language plpgsql set search_path='' as $$
declare v_count integer;
begin
 insert into orbit_private.poker_limits(key,window_start,attempts) values(p_key,clock_timestamp(),1)
 on conflict(key) do update set attempts=case when orbit_private.poker_limits.window_start<clock_timestamp()-make_interval(secs=>p_seconds) then 1 else orbit_private.poker_limits.attempts+1 end,
 window_start=case when orbit_private.poker_limits.window_start<clock_timestamp()-make_interval(secs=>p_seconds) then clock_timestamp() else orbit_private.poker_limits.window_start end returning attempts into v_count;
 if v_count>p_max then raise exception 'Too many poker requests. Please try again shortly.' using errcode='PT429'; end if;
end;
$$;
create function orbit_private.poker_deck_valid(p_deck jsonb) returns boolean language sql immutable set search_path='' as $$
 select case when jsonb_typeof(p_deck) is distinct from 'array' then false else
 jsonb_array_length(p_deck) between 2 and 30 and not exists(select 1 from jsonb_array_elements(p_deck) v where jsonb_typeof(v)<>'string' or length(btrim(v#>>'{}')) not between 1 and 12)
 and (select count(*)=count(distinct value) from jsonb_array_elements_text(p_deck)) end;
$$;
create function orbit_private.poker_round_json(p_round uuid,p_self uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',r.id,'issue',r.issue,'number',r.number,'revealed',r.revealed,'accepted',r.accepted,'createdAt',r.created_at,'revealedAt',r.revealed_at,
 'votes',coalesce((select jsonb_agg(jsonb_build_object('participantId',v.participant_id)||case when r.revealed or v.participant_id=p_self then jsonb_build_object('value',v.value) else '{}'::jsonb end order by v.updated_at) from public.orbit_poker_votes v where v.round_id=r.id),'[]'::jsonb))
 || coalesce((select jsonb_build_object('taskId',t.id,'title',t.document->>'title') from public.orbit_poker_issues q join public.orbit_poker_rooms room on room.id=q.room_id join public.orbit_work_items t on t.workspace_id=room.workspace_id and t.project_id=room.project_id and t.feature_id=q.feature_id and (q.story_id is not null and t.document->>'storyId'=q.story_id or q.story_id is null and q.logical_key='task|'||t.id) where q.room_id=r.room_id and q.canonical_key=r.issue order by (q.story_id is not null) desc,t.position limit 1),'{}'::jsonb)
 from public.orbit_poker_rounds r where r.id=p_round;
$$;
revoke all on function orbit_private.poker_limit(text,integer,integer),orbit_private.poker_deck_valid(jsonb),orbit_private.poker_round_json(uuid,uuid) from public,anon,authenticated;

create function public.orbit_poker(p_action text,p_token text default '',p_session text default '',p_input jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); r public.orbit_poker_rooms%rowtype; me public.orbit_poker_participants%rowtype; rd public.orbit_poker_rounds%rowtype;
 v_workspace uuid; v_owner boolean; v_issue text:=coalesce(nullif(p_input->>'issue',''),'free'); v_task public.orbit_work_items%rowtype;
 v_logical text; v_name text; v_deck jsonb; v_settings jsonb; v_value text; v_count integer; v_participants jsonb; v_epics jsonb; v_history jsonb;
 v_session_hash text:=encode(sha256(convert_to(p_session,'UTF8')),'hex'); v_result jsonb;
begin
 if jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>16384 then raise exception 'Invalid poker request' using errcode='22023'; end if;
 if p_action in ('create','list','save-deck') then
  if v_user is null then raise exception 'Please log in.' using errcode='PT401'; end if;
  select w.id into v_workspace from public.orbit_workspaces w where w.owner_user_id=v_user;
  if v_workspace is null or not exists(select 1 from public.orbit_projects p where p.workspace_id=v_workspace and p.id=p_input->>'projectId') then raise exception 'Project not found' using errcode='PT404'; end if;
  if p_action='list' then
   return jsonb_build_object('rooms',coalesce((select jsonb_agg(jsonb_build_object('token',q.invite_token,'name',q.name,'closed',q.closed,'updatedAt',q.updated_at) order by q.updated_at desc) from (select * from public.orbit_poker_rooms where owner_user_id=v_user and project_id=p_input->>'projectId' order by updated_at desc limit 30) q),'[]'::jsonb),
    'decks',coalesce((select jsonb_agg(jsonb_build_object('name',d.name,'values',d.values) order by d.name) from public.orbit_poker_decks d where d.owner_user_id=v_user),'[]'::jsonb));
  end if;
  v_name:=btrim(p_input->>'name');v_deck:=case when p_action='save-deck' then p_input->'values' else p_input->'deck' end;
  if v_name is null or length(v_name) not between 1 and (case when p_action='save-deck' then 60 else 100 end) or not coalesce(orbit_private.poker_deck_valid(v_deck),false) then raise exception 'Enter a name and a deck with 2–30 unique values' using errcode='22023'; end if;
  perform orbit_private.poker_limit('create:'||v_user::text,30,3600);
  if p_action='save-deck' then
   if (select count(*) from public.orbit_poker_decks where owner_user_id=v_user)>=30 and not exists(select 1 from public.orbit_poker_decks where owner_user_id=v_user and name=v_name) then raise exception 'A maximum of 30 custom decks is supported' using errcode='22023'; end if;
   insert into public.orbit_poker_decks values(v_user,v_name,v_deck) on conflict(owner_user_id,name) do update set values=excluded.values;
   return jsonb_build_object('saved',true);
  end if;
  if p_token!~'^[a-f0-9]{64}$' then raise exception 'Invalid invitation' using errcode='22023'; end if;
  v_settings:=jsonb_build_object('autoReveal',coalesce((p_input#>>'{settings,autoReveal}')::boolean,false),'showAverage',coalesce((p_input#>>'{settings,showAverage}')::boolean,true),'countdown',coalesce((p_input#>>'{settings,countdown}')::boolean,true));
  insert into public.orbit_poker_rooms(workspace_id,project_id,owner_user_id,invite_token,token_hash,name,deck,settings)
   values(v_workspace,p_input->>'projectId',v_user,p_token,encode(sha256(convert_to(p_token,'UTF8')),'hex'),v_name,v_deck,v_settings) returning * into r;
  return jsonb_build_object('token',p_token);
 end if;
 if p_token!~'^[a-f0-9]{64}$' then raise exception 'Room not found' using errcode='PT404'; end if;
 select * into r from public.orbit_poker_rooms where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') for update;
 if not found or not exists(select 1 from public.orbit_projects p where p.workspace_id=r.workspace_id and p.id=r.project_id) then raise exception 'Room not found' using errcode='PT404'; end if;
 v_owner:=coalesce(v_user=r.owner_user_id,false);
 if p_action='publication' then
  if not v_owner then raise exception 'Only the facilitator can publish' using errcode='42501'; end if;
  select result into v_result from public.orbit_poker_publications where room_id=r.id and operation_id=(p_input->>'operationId')::uuid;
  return v_result;
 end if;
 if v_owner then
  v_name:=left(coalesce(nullif(btrim(p_input->>'ownerName'),''),'Facilitator'),60);
  insert into public.orbit_poker_participants(room_id,user_id,name) values(r.id,v_user,v_name) on conflict(room_id,user_id) do update set last_seen=clock_timestamp() returning * into me;
 elsif p_session ~ '^[a-f0-9]{64}$' then
  select * into me from public.orbit_poker_participants where room_id=r.id and session_hash=v_session_hash;
 end if;
 if p_action='join' and not v_owner then
  if r.closed then raise exception 'This room is closed' using errcode='PT409'; end if;
  v_name:=btrim(p_input->>'name');
  if p_session!~'^[a-f0-9]{64}$' or v_name is null or length(v_name) not between 1 and 60 then raise exception 'Enter a display name' using errcode='22023'; end if;
  perform orbit_private.poker_limit('join:'||r.id::text,60,60);
  if me.id is null and (select count(*) from public.orbit_poker_participants where room_id=r.id)>=200 then raise exception 'This room has reached its participant limit' using errcode='PT429'; end if;
  insert into public.orbit_poker_participants(room_id,session_hash,name,spectator) values(r.id,v_session_hash,v_name,coalesce((p_input->>'spectator')::boolean,false))
   on conflict(room_id,session_hash) do update set name=excluded.name,spectator=excluded.spectator,last_seen=clock_timestamp() returning * into me;
 end if;
 if me.id is null then
  if p_action<>'state' then raise exception 'Join this room first' using errcode='PT401'; end if;
  return jsonb_build_object('room',jsonb_build_object('name',r.name,'projectId',r.project_id,'deck',r.deck,'settings',r.settings,'closed',r.closed),'self',null,'participants','[]'::jsonb,'round',null,'history','[]'::jsonb,'epics','[]'::jsonb);
 end if;
 perform orbit_private.poker_limit('participant:'||me.id::text,180,60);
 if v_issue<>'free' then
  select * into v_task from public.orbit_work_items where workspace_id=r.workspace_id and project_id=r.project_id and id=v_issue;
  if not found then raise exception 'Story not found' using errcode='PT404'; end if;
  v_logical:=case when nullif(v_task.document->>'storyId','') is not null then 'story|'||v_task.feature_id||'|'||(v_task.document->>'storyId') else 'task|'||v_task.id end;
  insert into public.orbit_poker_issues(room_id,logical_key,canonical_key,feature_id,story_id)
   -- A role moved to another epic starts a distinct logical story. Its former
   -- group's canonical key and history remain unchanged even when that key is
   -- this moved work item's ID.
   values(r.id,v_logical,case when exists(select 1 from public.orbit_poker_issues prior where prior.room_id=r.id and prior.canonical_key=v_task.id and prior.logical_key<>v_logical) then gen_random_uuid()::text else v_task.id end,v_task.feature_id,nullif(v_task.document->>'storyId',''))
   on conflict(room_id,logical_key) do update set feature_id=excluded.feature_id;
  select canonical_key into v_issue from public.orbit_poker_issues where room_id=r.id and logical_key=v_logical;
 end if;
 update public.orbit_poker_participants set last_seen=case when p_action='leave' then clock_timestamp()-interval '46 seconds' else clock_timestamp() end,selected_issue=v_issue where id=me.id;
 if p_action in ('reveal','restart','accept','close','configure') and not v_owner then raise exception 'Only the facilitator can manage this room' using errcode='42501'; end if;
 if r.closed and p_action not in ('state','leave','close') then raise exception 'This room is closed' using errcode='PT409'; end if;
 if p_action='close' then
  update public.orbit_poker_rooms set closed=coalesce((p_input->>'closed')::boolean,true),updated_at=clock_timestamp() where id=r.id returning * into r;
 elsif p_action='configure' then
  update public.orbit_poker_rooms set settings=jsonb_build_object('autoReveal',coalesce((p_input#>>'{settings,autoReveal}')::boolean,(settings->>'autoReveal')::boolean),'showAverage',coalesce((p_input#>>'{settings,showAverage}')::boolean,(settings->>'showAverage')::boolean),'countdown',coalesce((p_input#>>'{settings,countdown}')::boolean,(settings->>'countdown')::boolean)),updated_at=clock_timestamp() where id=r.id returning * into r;
 elsif p_action not in ('state','join','vote','reveal','restart','accept','leave') then raise exception 'Unknown poker action' using errcode='22023'; end if;
 select * into rd from public.orbit_poker_rounds where room_id=r.id and issue=v_issue order by number desc limit 1;
 if rd.id is null then insert into public.orbit_poker_rounds(room_id,issue,number) values(r.id,v_issue,1) returning * into rd; end if;
 if p_action='accept' then
  select * into rd from public.orbit_poker_rounds where room_id=r.id and issue=v_issue and id=(p_input->>'roundId')::uuid and revealed;
  if not found then raise exception 'Choose a revealed round for this story' using errcode='PT409'; end if;
 end if;
 if p_action in ('vote','reveal','restart') and (p_input->>'roundId') is distinct from rd.id::text then raise exception 'This round has changed. Refresh the table and try again.' using errcode='PT409'; end if;
 if p_action='restart' then
  if (select count(*) from public.orbit_poker_rounds where room_id=r.id)>=5000 then raise exception 'Room history limit reached' using errcode='22023'; end if;
  insert into public.orbit_poker_rounds(room_id,issue,number) values(r.id,v_issue,rd.number+1) returning * into rd;
 elsif p_action='vote' then
  if me.spectator then raise exception 'Spectators cannot vote' using errcode='42501'; end if;
  if rd.revealed then raise exception 'This round is revealed. Ask the facilitator to start another round.' using errcode='PT409'; end if;
  v_value:=p_input->>'value';if v_value is null or not r.deck ? v_value then raise exception 'Choose a card from this deck' using errcode='22023'; end if;
  insert into public.orbit_poker_votes(round_id,participant_id,value) values(rd.id,me.id,v_value) on conflict(round_id,participant_id) do update set value=excluded.value,updated_at=clock_timestamp();
 elsif p_action='reveal' then
  update public.orbit_poker_rounds set revealed=true,revealed_at=coalesce(revealed_at,clock_timestamp()) where id=rd.id returning * into rd;
 elsif p_action='accept' then
  v_value:=btrim(p_input->>'value');if not rd.revealed or v_value is null or length(v_value) not between 1 and 32 then raise exception 'Reveal the round and enter an accepted value' using errcode='22023'; end if;
  update public.orbit_poker_rounds set accepted=v_value where id=rd.id returning * into rd;
 end if;
 if not rd.revealed and not r.closed and (r.settings->>'autoReveal')::boolean then
  select count(*) into v_count from public.orbit_poker_participants p where p.room_id=r.id and not p.spectator and p.last_seen>clock_timestamp()-interval '45 seconds' and p.selected_issue=v_issue;
  if v_count>0 and not exists(select 1 from public.orbit_poker_participants p where p.room_id=r.id and not p.spectator and p.last_seen>clock_timestamp()-interval '45 seconds' and p.selected_issue=v_issue and not exists(select 1 from public.orbit_poker_votes v where v.round_id=rd.id and v.participant_id=p.id)) then
   update public.orbit_poker_rounds set revealed=true,revealed_at=clock_timestamp() where id=rd.id returning * into rd;
  end if;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'spectator',p.spectator,'selectedIssue',p.selected_issue,'active',p.last_seen>clock_timestamp()-interval '45 seconds','voted',v.participant_id is not null)||case when v.participant_id is not null and (rd.revealed or p.id=me.id) then jsonb_build_object('value',v.value) else '{}'::jsonb end order by p.created_at),'[]'::jsonb) into v_participants
 from public.orbit_poker_participants p left join public.orbit_poker_votes v on v.participant_id=p.id and v.round_id=rd.id where p.room_id=r.id;
 select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'title',f.document->>'title','stories',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'canonicalId',coalesce((select q.canonical_key from public.orbit_poker_issues q where q.room_id=r.id and q.logical_key=case when nullif(s.document->>'storyId','') is not null then 'story|'||s.feature_id||'|'||(s.document->>'storyId') else 'task|'||s.id end),s.id),'title',s.document->>'title','searchText',(select string_agg(titles.document->>'title',' ') from public.orbit_work_items titles where titles.workspace_id=s.workspace_id and titles.project_id=s.project_id and titles.feature_id=s.feature_id and (titles.id=s.id or nullif(s.document->>'storyId','') is not null and titles.document->>'storyId'=s.document->>'storyId'))) order by s.position) from public.orbit_work_items s where s.workspace_id=r.workspace_id and s.project_id=r.project_id and s.feature_id=f.id and (nullif(s.document->>'storyId','') is null or not exists(select 1 from public.orbit_work_items prev where prev.workspace_id=s.workspace_id and prev.project_id=s.project_id and prev.feature_id=s.feature_id and prev.document->>'storyId'=s.document->>'storyId' and prev.position<s.position))),'[]'::jsonb)) order by f.position),'[]'::jsonb) into v_epics from public.orbit_features f where f.workspace_id=r.workspace_id and f.project_id=r.project_id;
 select coalesce(jsonb_agg(orbit_private.poker_round_json(h.id,me.id) order by h.created_at desc),'[]'::jsonb) into v_history from (select id,created_at from public.orbit_poker_rounds where room_id=r.id and revealed order by created_at desc limit 100) h;
 return jsonb_build_object('room',jsonb_build_object('name',r.name,'projectId',r.project_id,'deck',r.deck,'settings',r.settings,'closed',r.closed),'self',jsonb_build_object('id',me.id,'name',me.name,'spectator',me.spectator,'owner',v_owner),'participants',v_participants,'round',orbit_private.poker_round_json(rd.id,me.id),'history',v_history,'epics',v_epics);
end;
$$;
revoke all on function public.orbit_poker(text,text,text,jsonb) from public;
grant execute on function public.orbit_poker(text,text,text,jsonb) to anon,authenticated;

-- A poker publication and its exact replay receipt commit with the workspace revision.
create function public.orbit_poker_publish(p_token text,p_expected_revision bigint,p_snapshot jsonb,p_operation_id uuid,p_story_key text,p_result jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.orbit_poker_rooms%rowtype; v_previous jsonb; v_before jsonb; v_current jsonb; v_next jsonb; v_revision bigint; v_response jsonb; v_round public.orbit_poker_rounds%rowtype;
begin
 if auth.uid() is null then raise exception 'Please log in.' using errcode='PT401'; end if;
 select * into r from public.orbit_poker_rooms where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') for update;
 if not found or r.owner_user_id<>auth.uid() then raise exception 'Only the facilitator can publish' using errcode='42501'; end if;
 select result into v_previous from public.orbit_poker_publications where room_id=r.id and operation_id=p_operation_id;
 if found then return v_previous; end if;
 if p_snapshot is null then raise exception 'Publication not found' using errcode='PT404'; end if;
 if r.closed then raise exception 'This room is closed' using errcode='PT409'; end if;
 select revision into v_revision from public.orbit_workspaces where id=r.workspace_id and owner_user_id=auth.uid() for update;
 if v_revision is distinct from p_expected_revision then raise exception 'Workspace revision conflict' using errcode='PT409'; end if;
 v_before:=public.orbit_get_workspace()->'workspace';
 select value into v_current from jsonb_array_elements(v_before->'projects') where value->>'id'=r.project_id;
 select value into v_next from jsonb_array_elements(p_snapshot->'projects') where value->>'id'=r.project_id;
 if v_current is null or v_next is null or p_result->>'projectId' is distinct from r.project_id or jsonb_typeof(p_result->'taskIds') is distinct from 'array' then raise exception 'Invalid publication project' using errcode='22023'; end if;
 if p_snapshot-'projects' is distinct from v_before-'projects'
 or (select coalesce(jsonb_agg(value),'[]'::jsonb) from jsonb_array_elements(p_snapshot->'projects') where value->>'id'<>r.project_id) is distinct from (select coalesce(jsonb_agg(value),'[]'::jsonb) from jsonb_array_elements(v_before->'projects') where value->>'id'<>r.project_id)
 or v_next-'data' is distinct from v_current-'data'
 or (v_next->'data')-'features'-'tasks' is distinct from (v_current->'data')-'features'-'tasks' then raise exception 'Publication may only modify the selected project story' using errcode='22023'; end if;
 if not exists(select 1 from jsonb_array_elements(v_next#>'{data,features}') f where f->>'id'=p_result->>'featureId')
 or exists(select 1 from jsonb_array_elements_text(p_result->'taskIds') tid where not exists(select 1 from jsonb_array_elements(v_next#>'{data,tasks}') t where t->>'id'=tid and t->>'featureId'=p_result->>'featureId')) then raise exception 'Invalid publication links' using errcode='22023'; end if;
 if (select coalesce(jsonb_agg(value),'[]'::jsonb) from jsonb_array_elements(v_next#>'{data,features}') where value->>'id'<>p_result->>'featureId') is distinct from (select coalesce(jsonb_agg(value),'[]'::jsonb) from jsonb_array_elements(v_current#>'{data,features}') where value->>'id'<>p_result->>'featureId')
 or (select coalesce(jsonb_agg(value),'[]'::jsonb) from jsonb_array_elements(v_next#>'{data,tasks}') where not p_result->'taskIds' ? (value->>'id')) is distinct from (select coalesce(jsonb_agg(value),'[]'::jsonb) from jsonb_array_elements(v_current#>'{data,tasks}') where not p_result->'taskIds' ? (value->>'id')) then raise exception 'Publication may not overwrite unrelated work' using errcode='22023'; end if;
 if p_result ? 'acceptedVote' and p_result->>'acceptedVote' is not null then
  select * into v_round from public.orbit_poker_rounds where id=(p_result->>'roundId')::uuid and room_id=r.id and revealed;
  if not found or length(btrim(p_result->>'acceptedVote')) not between 1 and 32 then raise exception 'Reveal the selected round before accepting its vote' using errcode='22023'; end if;
  if v_round.issue<>'free' and not exists(select 1 from public.orbit_poker_issues q join public.orbit_work_items t on t.workspace_id=r.workspace_id and t.project_id=r.project_id and t.id=p_story_key and t.feature_id=q.feature_id and (q.story_id is not null and t.document->>'storyId'=q.story_id or q.story_id is null and q.logical_key='task|'||t.id) where q.room_id=r.id and q.canonical_key=v_round.issue) then raise exception 'The selected voting round belongs to another story' using errcode='22023'; end if;
 end if;
 v_revision:=public.orbit_save_workspace(p_snapshot,p_expected_revision);
 -- A formerly standalone task that gains roles adopts its existing poker identity.
 insert into public.orbit_poker_issues(room_id,logical_key,canonical_key,feature_id,story_id)
 select r.id,'story|'||t.feature_id||'|'||(t.document->>'storyId'),q.canonical_key,t.feature_id,t.document->>'storyId'
 from public.orbit_work_items t join public.orbit_poker_issues q on q.room_id=r.id and q.logical_key='task|'||t.id
 where t.workspace_id=r.workspace_id and t.project_id=r.project_id and t.id=p_story_key and nullif(t.document->>'storyId','') is not null
 on conflict(room_id,logical_key) do nothing;
 if v_round.id is not null then update public.orbit_poker_rounds set accepted=btrim(p_result->>'acceptedVote') where id=v_round.id; end if;
 v_response:=p_result||jsonb_build_object('revision',v_revision);
 insert into public.orbit_poker_publications(room_id,operation_id,story_key,result) values(r.id,p_operation_id,p_story_key,v_response);
 update public.orbit_poker_rooms set updated_at=clock_timestamp() where id=r.id;
 return v_response;
end;
$$;
revoke all on function public.orbit_poker_publish(text,bigint,jsonb,uuid,text,jsonb) from public,anon;
grant execute on function public.orbit_poker_publish(text,bigint,jsonb,uuid,text,jsonb) to authenticated;
commit;
