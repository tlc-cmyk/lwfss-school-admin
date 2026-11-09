-- weekly_assemblies: dated school weekly assemblies (周會), Wednesdays; Day 8 · P6–P7 timeslot
-- Distinct from assembly_by_day (morning 早會 by cycle day).
-- Readable by all school-domain accounts (@g.lwfss.edu.hk)

CREATE TABLE IF NOT EXISTS public.weekly_assemblies (
  assembly_date date PRIMARY KEY,
  theme_week text NOT NULL DEFAULT '',
  s1 text NOT NULL DEFAULT '',
  s2 text NOT NULL DEFAULT '',
  s3 text NOT NULL DEFAULT '',
  s4 text NOT NULL DEFAULT '',
  s5 text NOT NULL DEFAULT '',
  s6 text NOT NULL DEFAULT '',
  venue text NOT NULL DEFAULT '',
  academic_year text NOT NULL DEFAULT '2026-2027',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.weekly_assemblies IS 'Dated weekly assemblies (周會); typically Day 8 periods P6–P7';
COMMENT ON COLUMN public.weekly_assemblies.assembly_date IS 'Calendar date of the weekly assembly';
COMMENT ON COLUMN public.weekly_assemblies.theme_week IS 'Theme week / activity name';
COMMENT ON COLUMN public.weekly_assemblies.s1 IS 'S1 (中一級) programme';
COMMENT ON COLUMN public.weekly_assemblies.s2 IS 'S2 (中二級) programme';
COMMENT ON COLUMN public.weekly_assemblies.s3 IS 'S3 (中三級) programme';
COMMENT ON COLUMN public.weekly_assemblies.s4 IS 'S4 (中四級) programme';
COMMENT ON COLUMN public.weekly_assemblies.s5 IS 'S5 (中五級) programme';
COMMENT ON COLUMN public.weekly_assemblies.s6 IS 'S6 (中六級) programme';
COMMENT ON COLUMN public.weekly_assemblies.venue IS 'Venue / arrangement notes';

CREATE INDEX IF NOT EXISTS idx_weekly_assemblies_year ON public.weekly_assemblies (academic_year);
CREATE INDEX IF NOT EXISTS idx_weekly_assemblies_year_sort ON public.weekly_assemblies (academic_year, sort_order);

ALTER TABLE public.weekly_assemblies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS school_read_weekly_assemblies ON public.weekly_assemblies;
CREATE POLICY school_read_weekly_assemblies ON public.weekly_assemblies
  FOR SELECT TO authenticated
  USING (COALESCE((auth.jwt() ->> 'email'::text), ''::text) ~~* '%@g.lwfss.edu.hk'::text);

REVOKE ALL ON TABLE public.weekly_assemblies FROM anon;
GRANT SELECT ON TABLE public.weekly_assemblies TO authenticated;
