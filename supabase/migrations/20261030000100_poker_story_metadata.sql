-- Share only the story details explicitly displayed in the invitation-scoped room.
-- Existing voting, publication, workspace permissions and stored plans are unchanged.
begin;
create function public.orbit_poker_room_state(p_token text,p_session text default '',p_input jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 v_state jsonb; r public.orbit_poker_rooms%rowtype; v_epics jsonb; v_project_name text;
begin
 -- Keep the existing authoritative room/session checks and hidden-vote projection.
 -- An invitation alone never discloses project names or work-item assignments.
 v_state:=public.orbit_poker('state',p_token,p_session,p_input);
 if v_state->'self' is null or v_state->'self'='null'::jsonb then return v_state; end if;
 select * into r from public.orbit_poker_rooms
 where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex');
 if not found then raise exception 'Room not found' using errcode='PT404'; end if;
 select project.name into v_project_name from public.orbit_projects project
 where project.workspace_id=r.workspace_id and project.id=r.project_id;
 if not found then raise exception 'Room not found' using errcode='PT404'; end if;

 select coalesce(jsonb_agg(
  epic.value || jsonb_build_object('stories',coalesce((
   select jsonb_agg(story.value || jsonb_build_object('workItems',coalesce((
    select jsonb_agg(jsonb_build_object(
     'id',item.id,
     'role',role.document->>'name',
     'assignee',person.document->>'name',
     'estimate',case when (item.document->>'effort')::numeric>0 then (item.document->>'effort')::numeric else null end
    ) order by item.position)
    from public.orbit_work_items source
    join public.orbit_work_items item on item.workspace_id=source.workspace_id and item.project_id=source.project_id
     and item.feature_id=source.feature_id
     and (item.id=source.id or nullif(source.document->>'storyId','') is not null and item.document->>'storyId'=source.document->>'storyId')
    left join public.orbit_people person on person.workspace_id=item.workspace_id and person.project_id=item.project_id and person.id=item.assignee_id
    left join public.orbit_roles role on role.workspace_id=item.workspace_id and role.project_id=item.project_id
     and role.id=coalesce(nullif(item.document->>'roleId',''),person.role_id,(
      select min(candidate.id) from public.orbit_roles candidate
      where candidate.workspace_id=item.workspace_id and candidate.project_id=item.project_id
       and candidate.document->>'platform'=item.document->>'platform'
      having count(*)=1
     ))
    where source.workspace_id=r.workspace_id and source.project_id=r.project_id
     and source.feature_id=epic.value->>'id' and source.id=story.value->>'id'
   ),'[]'::jsonb)) order by story.position)
   from jsonb_array_elements(epic.value->'stories') with ordinality as story(value,position)
  ),'[]'::jsonb)) order by epic.position
 ),'[]'::jsonb) into v_epics
 from jsonb_array_elements(v_state->'epics') with ordinality as epic(value,position);

 return jsonb_set(jsonb_set(v_state,'{epics}',v_epics),'{room,projectName}',to_jsonb(v_project_name));
end;
$$;
revoke all on function public.orbit_poker_room_state(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.orbit_poker_room_state(text,text,jsonb) to anon,authenticated;
commit;
