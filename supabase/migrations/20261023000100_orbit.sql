-- Orbit is additive: creates only orbit_* objects, without modifying existing application tables.
-- All app mutations are atomic, authenticated RPCs. Direct table writes are revoked.
begin;
create schema if not exists orbit_private;
revoke all on schema orbit_private from public, anon, authenticated;

create table public.orbit_workspaces (
 id uuid primary key default gen_random_uuid(),
 owner_user_id uuid not null unique references auth.users(id) on delete cascade,
 revision bigint not null default 0 check (revision >= 0), created_at timestamptz not null default now()
);
create table public.orbit_workspace_memberships (
 workspace_id uuid not null references public.orbit_workspaces(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 role text not null check (role in ('owner','member')), primary key (workspace_id,user_id)
);
create index orbit_memberships_user_idx on public.orbit_workspace_memberships(user_id);
create table public.orbit_user_settings (
 user_id uuid primary key references auth.users(id) on delete cascade,
 workspace_id uuid not null references public.orbit_workspaces(id) on delete cascade,
 active_project_id text, preferences jsonb not null default '{}'::jsonb check(jsonb_typeof(preferences)='object')
);
create table public.orbit_projects (
 workspace_id uuid not null references public.orbit_workspaces(id) on delete cascade,
 id text not null check(id ~ '^[A-Za-z0-9_-]{1,100}$'),
 name text not null check(length(btrim(name)) between 1 and 100),
 onboarding_step integer not null default 0 check(onboarding_step between 0 and 2),
 position integer not null, data_meta jsonb not null check(jsonb_typeof(data_meta)='object'),
 primary key(workspace_id,id)
);
create table public.orbit_project_settings (
 workspace_id uuid not null, project_id text not null,
 settings jsonb not null check(jsonb_typeof(settings)='object'),
 primary key(workspace_id,project_id),
 foreign key(workspace_id,project_id) references public.orbit_projects(workspace_id,id) on delete cascade
);
create table public.orbit_roles (
 workspace_id uuid not null, project_id text not null, id text not null check(id ~ '^[A-Za-z0-9_-]{1,100}$'),
 document jsonb not null check(jsonb_typeof(document)='object'), position integer not null,
 primary key(workspace_id,project_id,id),
 foreign key(workspace_id,project_id) references public.orbit_projects(workspace_id,id) on delete cascade
);
create table public.orbit_features (
 workspace_id uuid not null, project_id text not null, id text not null check(id ~ '^[A-Za-z0-9_-]{1,100}$'),
 document jsonb not null check(jsonb_typeof(document)='object'), position integer not null,
 primary key(workspace_id,project_id,id),
 foreign key(workspace_id,project_id) references public.orbit_projects(workspace_id,id) on delete cascade
);
create table public.orbit_people (
 workspace_id uuid not null, project_id text not null, id text not null check(id ~ '^[A-Za-z0-9_-]{1,100}$'),
 document jsonb not null check(jsonb_typeof(document)='object'), position integer not null,
 primary key(workspace_id,project_id,id),
 foreign key(workspace_id,project_id) references public.orbit_projects(workspace_id,id) on delete cascade,
 role_id text generated always as (document->>'roleId') stored not null,
 foreign key(workspace_id,project_id,role_id) references public.orbit_roles(workspace_id,project_id,id) deferrable initially deferred
);
create table public.orbit_iterations (
 workspace_id uuid not null, project_id text not null, id text not null check(id ~ '^[A-Za-z0-9_-]{1,100}$'),
 document jsonb not null check(jsonb_typeof(document)='object'), position integer not null,
 primary key(workspace_id,project_id,id),
 foreign key(workspace_id,project_id) references public.orbit_projects(workspace_id,id) on delete cascade
);
create table public.orbit_recurring_meetings (
 workspace_id uuid not null, project_id text not null, id text not null check(id ~ '^[A-Za-z0-9_-]{1,100}$'),
 document jsonb not null check(jsonb_typeof(document)='object'), position integer not null,
 primary key(workspace_id,project_id,id),
 foreign key(workspace_id,project_id) references public.orbit_projects(workspace_id,id) on delete cascade,
 check(document->>'recurrence' in ('workdays','weekly','interval','monthly')),
 check((document->>'duration')::integer between 5 and 480)
);
create table public.orbit_work_items (
 workspace_id uuid not null, project_id text not null, id text not null check(id ~ '^[A-Za-z0-9_-]{1,100}$'),
 document jsonb not null check(jsonb_typeof(document)='object'), position integer not null,
 primary key(workspace_id,project_id,id),
 foreign key(workspace_id,project_id) references public.orbit_projects(workspace_id,id) on delete cascade,
 feature_id text generated always as (document->>'featureId') stored not null,
 assignee_id text generated always as (nullif(document->>'assignee','')) stored,
 foreign key(workspace_id,project_id,feature_id) references public.orbit_features(workspace_id,project_id,id) deferrable initially deferred,
 foreign key(workspace_id,project_id,assignee_id) references public.orbit_people(workspace_id,project_id,id) deferrable initially deferred,
 check(document->>'status' in ('planned','progress','hold','done')),
 check((document->>'effort')::numeric between 0.1 and 3650)
);
create table public.orbit_time_off (
 workspace_id uuid not null, project_id text not null, id text not null check(id ~ '^[A-Za-z0-9_-]{1,100}$'),
 document jsonb not null check(jsonb_typeof(document)='object'), position integer not null,
 primary key(workspace_id,project_id,id),
 foreign key(workspace_id,project_id) references public.orbit_projects(workspace_id,id) on delete cascade,
 person_id text generated always as (document->>'person') stored not null,
 foreign key(workspace_id,project_id,person_id) references public.orbit_people(workspace_id,project_id,id) deferrable initially deferred,
 check((document->>'to')::date >= (document->>'from')::date)
);
create table public.orbit_milestones (
 workspace_id uuid not null, project_id text not null, id text not null check(id ~ '^[A-Za-z0-9_-]{1,100}$'),
 document jsonb not null check(jsonb_typeof(document)='object'), position integer not null,
 primary key(workspace_id,project_id,id),
 foreign key(workspace_id,project_id) references public.orbit_projects(workspace_id,id) on delete cascade
);
create table public.orbit_holidays (
 workspace_id uuid not null, project_id text not null, id text not null check(id ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
 document jsonb not null check(jsonb_typeof(document)='object'), position integer not null,
 primary key(workspace_id,project_id,id),
 foreign key(workspace_id,project_id) references public.orbit_projects(workspace_id,id) on delete cascade
);
create table public.orbit_capacity_settings (
 workspace_id uuid not null, project_id text not null, person_id text not null,
 iteration_key text not null default '',
 iteration_id text generated always as (nullif(iteration_key,'')) stored,
 allocation jsonb not null check(jsonb_typeof(allocation)='object'),
 primary key(workspace_id,project_id,person_id,iteration_key),
 foreign key(workspace_id,project_id) references public.orbit_projects(workspace_id,id) on delete cascade,
 foreign key(workspace_id,project_id,person_id) references public.orbit_people(workspace_id,project_id,id) deferrable initially deferred,
 foreign key(workspace_id,project_id,iteration_id) references public.orbit_iterations(workspace_id,project_id,id) deferrable initially deferred,
 check((allocation->>'feature')::numeric between 0 and 100 and (allocation->>'bugs')::numeric between 0 and 100
   and (allocation->>'ongoing')::numeric between 0 and 100 and (allocation->>'ops')::numeric between 0 and 100),
 check(abs((allocation->>'feature')::numeric+(allocation->>'bugs')::numeric+(allocation->>'ongoing')::numeric+(allocation->>'ops')::numeric-100)<0.001)
);
create table public.orbit_dependencies (
 workspace_id uuid not null, project_id text not null, task_id text not null, depends_on text not null, position integer not null,
 primary key(workspace_id,project_id,task_id,depends_on),
 foreign key(workspace_id,project_id) references public.orbit_projects(workspace_id,id) on delete cascade,
 foreign key(workspace_id,project_id,task_id) references public.orbit_work_items(workspace_id,project_id,id) deferrable initially deferred,
 foreign key(workspace_id,project_id,depends_on) references public.orbit_work_items(workspace_id,project_id,id) deferrable initially deferred
);
create index orbit_dependencies_reverse_idx on public.orbit_dependencies(workspace_id,project_id,depends_on);
create table public.orbit_meeting_attendees (
 workspace_id uuid not null, project_id text not null, meeting_id text not null, person_id text not null, position integer not null,
 primary key(workspace_id,project_id,meeting_id,person_id),
 foreign key(workspace_id,project_id) references public.orbit_projects(workspace_id,id) on delete cascade,
 foreign key(workspace_id,project_id,meeting_id) references public.orbit_recurring_meetings(workspace_id,project_id,id) deferrable initially deferred,
 foreign key(workspace_id,project_id,person_id) references public.orbit_people(workspace_id,project_id,id) deferrable initially deferred
);
create index orbit_meeting_attendees_reverse_idx on public.orbit_meeting_attendees(workspace_id,project_id,person_id);
create table public.orbit_milestone_features (
 workspace_id uuid not null, project_id text not null, milestone_id text not null, feature_id text not null, position integer not null,
 primary key(workspace_id,project_id,milestone_id,feature_id),
 foreign key(workspace_id,project_id) references public.orbit_projects(workspace_id,id) on delete cascade,
 foreign key(workspace_id,project_id,milestone_id) references public.orbit_milestones(workspace_id,project_id,id) deferrable initially deferred,
 foreign key(workspace_id,project_id,feature_id) references public.orbit_features(workspace_id,project_id,id) deferrable initially deferred
);
create index orbit_milestone_features_reverse_idx on public.orbit_milestone_features(workspace_id,project_id,feature_id);

create function public.orbit_can_access(p_workspace uuid) returns boolean
language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.orbit_workspace_memberships m where m.workspace_id=p_workspace and m.user_id=auth.uid());
$$;
revoke all on function public.orbit_can_access(uuid) from public, anon;
grant execute on function public.orbit_can_access(uuid) to authenticated;
alter table public.orbit_workspaces enable row level security;
revoke all on public.orbit_workspaces from public, anon, authenticated;
grant select on public.orbit_workspaces to authenticated;
create policy orbit_read on public.orbit_workspaces for select to authenticated using (owner_user_id=auth.uid());
alter table public.orbit_workspace_memberships enable row level security;
revoke all on public.orbit_workspace_memberships from public, anon, authenticated;
grant select on public.orbit_workspace_memberships to authenticated;
create policy orbit_read on public.orbit_workspace_memberships for select to authenticated using (public.orbit_can_access(workspace_id));
alter table public.orbit_user_settings enable row level security;
revoke all on public.orbit_user_settings from public, anon, authenticated;
grant select on public.orbit_user_settings to authenticated;
create policy orbit_read on public.orbit_user_settings for select to authenticated using (user_id=auth.uid());
alter table public.orbit_projects enable row level security;
revoke all on public.orbit_projects from public, anon, authenticated;
grant select on public.orbit_projects to authenticated;
create policy orbit_read on public.orbit_projects for select to authenticated using (public.orbit_can_access(workspace_id));
alter table public.orbit_project_settings enable row level security;
revoke all on public.orbit_project_settings from public, anon, authenticated;
grant select on public.orbit_project_settings to authenticated;
create policy orbit_read on public.orbit_project_settings for select to authenticated using (public.orbit_can_access(workspace_id));
alter table public.orbit_roles enable row level security;
revoke all on public.orbit_roles from public, anon, authenticated;
grant select on public.orbit_roles to authenticated;
create policy orbit_read on public.orbit_roles for select to authenticated using (public.orbit_can_access(workspace_id));
alter table public.orbit_features enable row level security;
revoke all on public.orbit_features from public, anon, authenticated;
grant select on public.orbit_features to authenticated;
create policy orbit_read on public.orbit_features for select to authenticated using (public.orbit_can_access(workspace_id));
alter table public.orbit_people enable row level security;
revoke all on public.orbit_people from public, anon, authenticated;
grant select on public.orbit_people to authenticated;
create policy orbit_read on public.orbit_people for select to authenticated using (public.orbit_can_access(workspace_id));
alter table public.orbit_iterations enable row level security;
revoke all on public.orbit_iterations from public, anon, authenticated;
grant select on public.orbit_iterations to authenticated;
create policy orbit_read on public.orbit_iterations for select to authenticated using (public.orbit_can_access(workspace_id));
alter table public.orbit_recurring_meetings enable row level security;
revoke all on public.orbit_recurring_meetings from public, anon, authenticated;
grant select on public.orbit_recurring_meetings to authenticated;
create policy orbit_read on public.orbit_recurring_meetings for select to authenticated using (public.orbit_can_access(workspace_id));
alter table public.orbit_work_items enable row level security;
revoke all on public.orbit_work_items from public, anon, authenticated;
grant select on public.orbit_work_items to authenticated;
create policy orbit_read on public.orbit_work_items for select to authenticated using (public.orbit_can_access(workspace_id));
alter table public.orbit_time_off enable row level security;
revoke all on public.orbit_time_off from public, anon, authenticated;
grant select on public.orbit_time_off to authenticated;
create policy orbit_read on public.orbit_time_off for select to authenticated using (public.orbit_can_access(workspace_id));
alter table public.orbit_milestones enable row level security;
revoke all on public.orbit_milestones from public, anon, authenticated;
grant select on public.orbit_milestones to authenticated;
create policy orbit_read on public.orbit_milestones for select to authenticated using (public.orbit_can_access(workspace_id));
alter table public.orbit_holidays enable row level security;
revoke all on public.orbit_holidays from public, anon, authenticated;
grant select on public.orbit_holidays to authenticated;
create policy orbit_read on public.orbit_holidays for select to authenticated using (public.orbit_can_access(workspace_id));
alter table public.orbit_capacity_settings enable row level security;
revoke all on public.orbit_capacity_settings from public, anon, authenticated;
grant select on public.orbit_capacity_settings to authenticated;
create policy orbit_read on public.orbit_capacity_settings for select to authenticated using (public.orbit_can_access(workspace_id));
alter table public.orbit_dependencies enable row level security;
revoke all on public.orbit_dependencies from public, anon, authenticated;
grant select on public.orbit_dependencies to authenticated;
create policy orbit_read on public.orbit_dependencies for select to authenticated using (public.orbit_can_access(workspace_id));
alter table public.orbit_meeting_attendees enable row level security;
revoke all on public.orbit_meeting_attendees from public, anon, authenticated;
grant select on public.orbit_meeting_attendees to authenticated;
create policy orbit_read on public.orbit_meeting_attendees for select to authenticated using (public.orbit_can_access(workspace_id));
alter table public.orbit_milestone_features enable row level security;
revoke all on public.orbit_milestone_features from public, anon, authenticated;
grant select on public.orbit_milestone_features to authenticated;
create policy orbit_read on public.orbit_milestone_features for select to authenticated using (public.orbit_can_access(workspace_id));

create function public.orbit_get_workspace() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_user uuid:=auth.uid(); w public.orbit_workspaces%rowtype; s public.orbit_user_settings%rowtype;
 p record; item record; mapping record; arr jsonb; obj jsonb; detail jsonb; projects jsonb:='[]';
begin
 if v_user is null then raise exception 'Authentication required' using errcode='42501'; end if;
 insert into public.orbit_workspaces(owner_user_id) values(v_user) on conflict(owner_user_id) do nothing;
 select * into strict w from public.orbit_workspaces where owner_user_id=v_user for share;
 insert into public.orbit_workspace_memberships(workspace_id,user_id,role) values(w.id,v_user,'owner') on conflict do nothing;
 insert into public.orbit_user_settings(user_id,workspace_id) values(v_user,w.id) on conflict do nothing;
 select * into strict s from public.orbit_user_settings where user_id=v_user;
 for p in select * from public.orbit_projects where workspace_id=w.id order by position loop
  obj:=p.data_meta;
  select coalesce(jsonb_agg(x.document order by x.position),'[]'::jsonb) into arr from public.orbit_roles x where x.workspace_id=w.id and x.project_id=p.id;
  obj:=obj||jsonb_build_object('roles',arr);
  select coalesce(jsonb_agg(x.document order by x.position),'[]'::jsonb) into arr from public.orbit_features x where x.workspace_id=w.id and x.project_id=p.id;
  obj:=obj||jsonb_build_object('features',arr);
  select coalesce(jsonb_agg(x.document || jsonb_build_object('capacity',(select c.allocation from public.orbit_capacity_settings c where c.workspace_id=w.id and c.project_id=p.id and c.person_id=x.id and c.iteration_key='')) order by x.position),'[]'::jsonb) into arr from public.orbit_people x where x.workspace_id=w.id and x.project_id=p.id;
  obj:=obj||jsonb_build_object('people',arr);
  select coalesce(jsonb_agg(x.document || jsonb_build_object('overrides',coalesce((select jsonb_object_agg(c.person_id,c.allocation) from public.orbit_capacity_settings c where c.workspace_id=w.id and c.project_id=p.id and c.iteration_key=x.id),'{}'::jsonb)) order by x.position),'[]'::jsonb) into arr from public.orbit_iterations x where x.workspace_id=w.id and x.project_id=p.id;
  obj:=obj||jsonb_build_object('iterations',arr);
  select coalesce(jsonb_agg(x.document || jsonb_build_object('attendees',coalesce((select jsonb_agg(a.person_id order by a.position) from public.orbit_meeting_attendees a where a.workspace_id=w.id and a.project_id=p.id and a.meeting_id=x.id),'[]'::jsonb)) order by x.position),'[]'::jsonb) into arr from public.orbit_recurring_meetings x where x.workspace_id=w.id and x.project_id=p.id;
  obj:=obj||jsonb_build_object('meetings',arr);
  select coalesce(jsonb_agg(x.document || jsonb_build_object('dependsOn',coalesce((select jsonb_agg(d.depends_on order by d.position) from public.orbit_dependencies d where d.workspace_id=w.id and d.project_id=p.id and d.task_id=x.id),'[]'::jsonb)) order by x.position),'[]'::jsonb) into arr from public.orbit_work_items x where x.workspace_id=w.id and x.project_id=p.id;
  obj:=obj||jsonb_build_object('tasks',arr);
  select coalesce(jsonb_agg(x.document order by x.position),'[]'::jsonb) into arr from public.orbit_time_off x where x.workspace_id=w.id and x.project_id=p.id;
  obj:=obj||jsonb_build_object('leave',arr);
  select coalesce(jsonb_agg(x.document || jsonb_build_object('featureIds',coalesce((select jsonb_agg(f.feature_id order by f.position) from public.orbit_milestone_features f where f.workspace_id=w.id and f.project_id=p.id and f.milestone_id=x.id),'[]'::jsonb)) order by x.position),'[]'::jsonb) into arr from public.orbit_milestones x where x.workspace_id=w.id and x.project_id=p.id;
  obj:=obj||jsonb_build_object('milestones',arr);
  select coalesce(jsonb_agg(x.document order by x.position),'[]'::jsonb) into arr from public.orbit_holidays x where x.workspace_id=w.id and x.project_id=p.id;
  obj:=obj||jsonb_build_object('holidays',arr);
  select settings into detail from public.orbit_project_settings where workspace_id=w.id and project_id=p.id;
  obj:=obj||jsonb_build_object('settings',detail);
  projects:=projects||jsonb_build_array(jsonb_build_object('id',p.id,'name',p.name,'onboardingStep',p.onboarding_step,'data',obj));
 end loop;
 return jsonb_build_object('revision',w.revision,'workspace',jsonb_build_object('version',1,'activeId',s.active_project_id,'preferences',s.preferences,'projects',projects));
end;
$$;

create function public.orbit_save_workspace(p_snapshot jsonb,p_expected_revision bigint) returns bigint
language plpgsql security definer set search_path = '' as $$
declare v_user uuid:=auth.uid(); w public.orbit_workspaces%rowtype; p jsonb; d jsonb; entry jsonb;
 pos integer:=0; item record; override_record record; pending text[]; ready text[];
begin
 if v_user is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select * into w from public.orbit_workspaces where owner_user_id=v_user for update;
 if not found then raise exception 'Load the workspace first' using errcode='42501'; end if;
 if w.revision<>p_expected_revision then raise exception 'Workspace revision conflict' using errcode='40001'; end if;
 if coalesce((p_snapshot->>'version')::integer,0)<>1 or jsonb_typeof(p_snapshot->'projects') is distinct from 'array'
   or octet_length(p_snapshot::text)>5000000 or jsonb_array_length(p_snapshot->'projects')>100 then
  raise exception 'Invalid workspace' using errcode='22023';
 end if;
 if (jsonb_array_length(p_snapshot->'projects')=0 and p_snapshot->>'activeId' is not null)
   or (jsonb_array_length(p_snapshot->'projects')>0 and not exists(select 1 from jsonb_array_elements(p_snapshot->'projects') x where x->>'id'=p_snapshot->>'activeId')) then
  raise exception 'Invalid active project' using errcode='22023';
 end if;
 -- Replacing this owner's normalized rows is atomic and guarded by a workspace revision lock.
 -- No other workspace is addressed, even if identifiers are identical in imported backups.
 delete from public.orbit_projects where workspace_id=w.id;
 for p in select value from jsonb_array_elements(p_snapshot->'projects') loop
  d:=p->'data'; pos:=pos+1;
  if jsonb_typeof(d) is distinct from 'object' or coalesce((d->>'version')::integer,0) not between 3 and 4 then raise exception 'Invalid project data'; end if;
  insert into public.orbit_projects(workspace_id,id,name,onboarding_step,position,data_meta)
   values(w.id,p->>'id',p->>'name',coalesce((p->>'onboardingStep')::integer,0),pos,jsonb_build_object('version',d->'version','createdAt',d->'createdAt'));
  insert into public.orbit_project_settings values(w.id,p->>'id',d->'settings');
  if jsonb_typeof(d->'roles') is distinct from 'array' or jsonb_array_length(d->'roles')>3000 then raise exception 'Invalid roles'; end if;
  insert into public.orbit_roles(workspace_id,project_id,id,document,position)
   select w.id,p->>'id',value->>'id',value,ordinality::integer from jsonb_array_elements(d->'roles') with ordinality;
  if jsonb_typeof(d->'features') is distinct from 'array' or jsonb_array_length(d->'features')>3000 then raise exception 'Invalid features'; end if;
  insert into public.orbit_features(workspace_id,project_id,id,document,position)
   select w.id,p->>'id',value->>'id',value,ordinality::integer from jsonb_array_elements(d->'features') with ordinality;
  if jsonb_typeof(d->'people') is distinct from 'array' or jsonb_array_length(d->'people')>3000 then raise exception 'Invalid people'; end if;
  insert into public.orbit_people(workspace_id,project_id,id,document,position)
   select w.id,p->>'id',value->>'id',value-'capacity',ordinality::integer from jsonb_array_elements(d->'people') with ordinality;
  if jsonb_typeof(d->'iterations') is distinct from 'array' or jsonb_array_length(d->'iterations')>3000 then raise exception 'Invalid iterations'; end if;
  insert into public.orbit_iterations(workspace_id,project_id,id,document,position)
   select w.id,p->>'id',value->>'id',value-'overrides',ordinality::integer from jsonb_array_elements(d->'iterations') with ordinality;
  if jsonb_typeof(d->'meetings') is distinct from 'array' or jsonb_array_length(d->'meetings')>3000 then raise exception 'Invalid meetings'; end if;
  insert into public.orbit_recurring_meetings(workspace_id,project_id,id,document,position)
   select w.id,p->>'id',value->>'id',value-'attendees',ordinality::integer from jsonb_array_elements(d->'meetings') with ordinality;
  if jsonb_typeof(d->'tasks') is distinct from 'array' or jsonb_array_length(d->'tasks')>3000 then raise exception 'Invalid tasks'; end if;
  insert into public.orbit_work_items(workspace_id,project_id,id,document,position)
   select w.id,p->>'id',value->>'id',value-'dependsOn',ordinality::integer from jsonb_array_elements(d->'tasks') with ordinality;
  if jsonb_typeof(d->'leave') is distinct from 'array' or jsonb_array_length(d->'leave')>3000 then raise exception 'Invalid leave'; end if;
  insert into public.orbit_time_off(workspace_id,project_id,id,document,position)
   select w.id,p->>'id',value->>'id',value,ordinality::integer from jsonb_array_elements(d->'leave') with ordinality;
  if jsonb_typeof(d->'milestones') is distinct from 'array' or jsonb_array_length(d->'milestones')>3000 then raise exception 'Invalid milestones'; end if;
  insert into public.orbit_milestones(workspace_id,project_id,id,document,position)
   select w.id,p->>'id',value->>'id',value-'featureIds',ordinality::integer from jsonb_array_elements(d->'milestones') with ordinality;
  if jsonb_typeof(d->'holidays') is distinct from 'array' or jsonb_array_length(d->'holidays')>3000 then raise exception 'Invalid holidays'; end if;
  insert into public.orbit_holidays(workspace_id,project_id,id,document,position)
   select w.id,p->>'id',value->>'date',value,ordinality::integer from jsonb_array_elements(d->'holidays') with ordinality;
  insert into public.orbit_capacity_settings(workspace_id,project_id,person_id,iteration_key,allocation)
   select w.id,p->>'id',value->>'id','',value->'capacity' from jsonb_array_elements(d->'people');
  for entry in select value from jsonb_array_elements(d->'iterations') loop
   for override_record in select key,value from jsonb_each(entry->'overrides') loop
    insert into public.orbit_capacity_settings(workspace_id,project_id,person_id,iteration_key,allocation)
     values(w.id,p->>'id',override_record.key,entry->>'id',override_record.value);
   end loop;
  end loop;
  for entry in select value from jsonb_array_elements(d->'tasks') loop
   insert into public.orbit_dependencies(workspace_id,project_id,task_id,depends_on,position)
    select w.id,p->>'id',entry->>'id',value,ordinality::integer from jsonb_array_elements_text(entry->'dependsOn') with ordinality;
  end loop;
  for entry in select value from jsonb_array_elements(d->'meetings') loop
   insert into public.orbit_meeting_attendees(workspace_id,project_id,meeting_id,person_id,position)
    select w.id,p->>'id',entry->>'id',value,ordinality::integer from jsonb_array_elements_text(entry->'attendees') with ordinality;
  end loop;
  for entry in select value from jsonb_array_elements(d->'milestones') loop
   insert into public.orbit_milestone_features(workspace_id,project_id,milestone_id,feature_id,position)
    select w.id,p->>'id',entry->>'id',value,ordinality::integer from jsonb_array_elements_text(entry->'featureIds') with ordinality;
  end loop;
  -- Topological validation also covers callers using the RPC without the Next.js API.
  select array_agg(id) into pending from public.orbit_work_items where workspace_id=w.id and project_id=p->>'id';
  while coalesce(cardinality(pending),0)>0 loop
   select array_agg(t) into ready from unnest(pending) t where not exists(
    select 1 from public.orbit_dependencies dep where dep.workspace_id=w.id and dep.project_id=p->>'id' and dep.task_id=t and dep.depends_on=any(pending));
   if coalesce(cardinality(ready),0)=0 then raise exception 'Circular dependency' using errcode='22023'; end if;
   select array_agg(t) into pending from unnest(pending) t where not (t=any(ready));
  end loop;
 end loop;
 update public.orbit_user_settings set active_project_id=p_snapshot->>'activeId',preferences=coalesce(p_snapshot->'preferences','{}'::jsonb) where user_id=v_user;
 update public.orbit_workspaces set revision=revision+1 where id=w.id returning revision into w.revision;
 return w.revision;
end;
$$;
revoke all on function public.orbit_get_workspace() from public,anon;
revoke all on function public.orbit_save_workspace(jsonb,bigint) from public,anon;
grant execute on function public.orbit_get_workspace() to authenticated;
grant execute on function public.orbit_save_workspace(jsonb,bigint) to authenticated;

-- Short-lived hashed IP buckets. Contents are never readable through the public API.
create table orbit_private.auth_attempts (
 key text not null, kind text not null, window_start timestamptz not null,
 attempts integer not null, primary key(key,kind,window_start)
);
create function public.orbit_auth_allow(p_key text,p_kind text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_count integer; v_window timestamptz:=date_trunc('minute',clock_timestamp());
begin
 if p_key !~ '^[a-f0-9]{64}$' or p_kind not in ('login','signup') then return false; end if;
 delete from orbit_private.auth_attempts where window_start<v_window-interval '10 minutes';
 insert into orbit_private.auth_attempts values(p_key,p_kind,v_window,1)
 on conflict(key,kind,window_start) do update set attempts=orbit_private.auth_attempts.attempts+1 returning attempts into v_count;
 return v_count <= case when p_kind='signup' then 5 else 15 end;
end;
$$;
revoke all on function public.orbit_auth_allow(text,text) from public;
grant execute on function public.orbit_auth_allow(text,text) to anon,authenticated;
commit;
