-- Permit the optional Time off step without changing any saved project state.
begin;

lock table public.orbit_projects in access exclusive mode;
do $$
declare rows_before bigint;
begin
 select count(*) into rows_before from public.orbit_projects;
 alter table public.orbit_projects drop constraint orbit_projects_onboarding_step_check;
 alter table public.orbit_projects add constraint orbit_projects_onboarding_step_check
  check(onboarding_step between 0 and 3);
 if (select count(*) from public.orbit_projects) <> rows_before then
  raise exception 'Project rows changed during the onboarding constraint update';
 end if;
end;$$;

commit;
