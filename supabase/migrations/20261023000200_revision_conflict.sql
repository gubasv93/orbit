-- Business revision conflicts are HTTP 409, not retryable serialization failures.
-- Preserve the existing atomic save implementation and grants.
begin;
create or replace function public.orbit_save_workspace(p_snapshot jsonb,p_expected_revision bigint) returns bigint
language plpgsql security definer set search_path = '' as $$
declare v_user uuid:=auth.uid(); w public.orbit_workspaces%rowtype; p jsonb; d jsonb; entry jsonb;
 pos integer:=0; item record; override_record record; pending text[]; ready text[];
begin
 if v_user is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select * into w from public.orbit_workspaces where owner_user_id=v_user for update;
 if not found then raise exception 'Load the workspace first' using errcode='42501'; end if;
 if w.revision<>p_expected_revision then raise exception 'Workspace revision conflict' using errcode='PT409'; end if;
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
commit;
