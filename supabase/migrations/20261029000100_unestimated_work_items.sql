-- A zero estimate records an unestimated item; it allocates no development time.
-- Preserve every existing work item while broadening its allowed effort range.
begin;
do $$
declare constraint_name text;
begin
  for constraint_name in
    select conname from pg_constraint
    where conrelid='public.orbit_work_items'::regclass and contype='c'
      and position('effort' in pg_get_constraintdef(oid))>0
  loop
    execute format('alter table public.orbit_work_items drop constraint %I',constraint_name);
  end loop;
end $$;
alter table public.orbit_work_items add constraint orbit_work_items_effort_range
  check ((document->>'effort')::numeric between 0 and 3650);
commit;
