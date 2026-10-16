-- Calendar source meta + sample row (kept for history).
-- Full school-calendar remarks seed: db/seed_calendar_events.sql
-- (「關愛月」and other PDF 備註 expanded per date).

INSERT INTO public.meta (key, value) VALUES
  ('academic_year', '2026-2027'),
  ('calendar_source', '校曆表 2026-2027 (Last updated 20 Jul 2023)')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
