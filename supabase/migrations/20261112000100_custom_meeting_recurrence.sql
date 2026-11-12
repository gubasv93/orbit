-- Extend meeting recurrence without rewriting existing meeting documents or workspace RPCs.
begin;

-- This validator is internal to the existing owner-scoped save RPC, not a new API.
create function orbit_private.valid_custom_meeting_recurrence(document jsonb) returns boolean
language plpgsql immutable set search_path='' as $validator$
declare
 recurrence jsonb:=document->'customRecurrence';
 frequency text;
 ending text;
 day jsonb;
 weekdays integer[]:='{}';
 value numeric;
begin
 if jsonb_typeof(recurrence) is distinct from 'object' then return false;end if;
 frequency:=recurrence->>'frequency';ending:=recurrence->>'endType';
 if frequency is null or frequency not in ('day','week','month','year')
  or ending is null or ending not in ('never','on','after') then return false;end if;
 if jsonb_typeof(recurrence->'interval') is distinct from 'number' then return false;end if;
 value:=(recurrence->>'interval')::numeric;
 if value not between 1 and 99 or value<>trunc(value) then return false;end if;

 if recurrence ? 'weekdays' then
  if jsonb_typeof(recurrence->'weekdays') is distinct from 'array' then return false;end if;
  if jsonb_array_length(recurrence->'weekdays')>7
   or (frequency='week' and jsonb_array_length(recurrence->'weekdays')=0) then return false;end if;
  for day in select jsonb_array_elements(recurrence->'weekdays') loop
   if jsonb_typeof(day) is distinct from 'number' then return false;end if;
   value:=day::text::numeric;
   if value not between 0 and 6 or value<>trunc(value) or value::integer=any(weekdays) then return false;end if;
   weekdays:=array_append(weekdays,value::integer);
  end loop;
 elsif frequency='week' then return false;
 end if;
 if recurrence ? 'monthlyMode' and (jsonb_typeof(recurrence->'monthlyMode') is distinct from 'string'
  or recurrence->>'monthlyMode' not in ('day','weekday')) then return false;end if;
 if recurrence ? 'monthlyOrdinal' then
  if jsonb_typeof(recurrence->'monthlyOrdinal') is distinct from 'number' then return false;end if;
  value:=(recurrence->>'monthlyOrdinal')::numeric;
  if value<>trunc(value) or value not in (-1,1,2,3,4,5) then return false;end if;
 end if;

 -- Validate optional hidden editor values too; only the chosen ending is required.
 if recurrence ? 'count' then
  if jsonb_typeof(recurrence->'count') is distinct from 'number' then return false;end if;
  value:=(recurrence->>'count')::numeric;
  if value not between 1 and 1000 or value<>trunc(value) then return false;end if;
 elsif ending='after' then return false;
 end if;
 if recurrence ? 'endDate' then
  if jsonb_typeof(recurrence->'endDate') is distinct from 'string'
   or recurrence->>'endDate' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return false;end if;
  if (recurrence->>'endDate')::date not between date '2000-01-01' and date '2200-12-31' then return false;end if;
 elsif ending='on' then return false;
 end if;
 if ending='on' then
  if jsonb_typeof(document->'startDate') is distinct from 'string'
   or document->>'startDate' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return false;end if;
  if (recurrence->>'endDate')::date < (document->>'startDate')::date then return false;end if;
 end if;
 return true;
exception when invalid_text_representation or numeric_value_out_of_range or invalid_datetime_format or datetime_field_overflow then
 return false;
end;$validator$;
revoke all on function orbit_private.valid_custom_meeting_recurrence(jsonb) from public,anon,authenticated,service_role;

lock table public.orbit_recurring_meetings in access exclusive mode;
do $migration$
declare
 legacy_name text;
 matching_checks integer;
 rows_before bigint;
 fingerprint_before text;
 rows_after bigint;
 fingerprint_after text;
begin
 select count(*),min(c.conname::text) into matching_checks,legacy_name
 from pg_constraint c where c.conrelid='public.orbit_recurring_meetings'::regclass and c.contype='c' and c.convalidated
  and regexp_replace(pg_get_expr(c.conbin,c.conrelid),'[[:space:]]','','g')=
   regexp_replace($legacy$((document ->> 'recurrence'::text) = ANY (ARRAY['workdays'::text, 'weekly'::text, 'interval'::text, 'monthly'::text]))$legacy$,'[[:space:]]','','g');
 if matching_checks<>1 then raise exception 'Expected exactly one reviewed legacy meeting recurrence check';end if;
 if exists(select 1 from pg_constraint where conrelid='public.orbit_recurring_meetings'::regclass and conname='orbit_recurring_meetings_recurrence_check') then
  raise exception 'Meeting recurrence check already exists outside migration history';
 end if;
 select count(*),md5(coalesce(string_agg(md5(to_jsonb(m)::text),'' order by workspace_id,project_id,id),''))
  into rows_before,fingerprint_before from public.orbit_recurring_meetings m;

 execute format('alter table public.orbit_recurring_meetings drop constraint %I',legacy_name);
 alter table public.orbit_recurring_meetings add constraint orbit_recurring_meetings_recurrence_check check(
  case when document->>'recurrence'='custom' then orbit_private.valid_custom_meeting_recurrence(document)
   else document->>'recurrence' in ('workdays','weekly','interval','monthly') end);

 select count(*),md5(coalesce(string_agg(md5(to_jsonb(m)::text),'' order by workspace_id,project_id,id),''))
  into rows_after,fingerprint_after from public.orbit_recurring_meetings m;
 if rows_before<>rows_after or fingerprint_before<>fingerprint_after then
  raise exception 'Meeting records changed during the recurrence constraint update';
 end if;
end;$migration$;

commit;
