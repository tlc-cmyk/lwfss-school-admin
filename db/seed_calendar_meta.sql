
INSERT INTO public.meta (key, value) VALUES
  ('academic_year', '2026-2027'),
  ('calendar_source', '校曆表 2026-2027 (Last updated 20 Jul 2023)')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- Sample remark for visual match (Care Month / 2026-10-15)
insert into calendar_events (event_date, event_date_raw, title, event_type, academic_year, sort_order)
select '2026-10-15'::date, '15/10/2026', '「關愛月」', 'remark', '2026-2027', 1
where not exists (
  select 1 from calendar_events where event_date = '2026-10-15'::date and title = '「關愛月」'
);
