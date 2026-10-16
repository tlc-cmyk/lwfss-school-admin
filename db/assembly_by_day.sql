-- assembly_by_day: morning assembly theme by cycle day (Day 1–10)
-- Readable by all school-domain accounts (@g.lwfss.edu.hk)

CREATE TABLE IF NOT EXISTS public.assembly_by_day (
  day integer PRIMARY KEY CHECK (day >= 1 AND day <= 10),
  theme text NOT NULL DEFAULT '',
  is_flag boolean NOT NULL DEFAULT false,
  is_3x boolean NOT NULL DEFAULT false
);

COMMENT ON TABLE public.assembly_by_day IS 'Morning assembly theme by cycle day (Day 1–10)';
COMMENT ON COLUMN public.assembly_by_day.day IS 'Cycle day 1–10';
COMMENT ON COLUMN public.assembly_by_day.theme IS 'Assembly theme / responsible group';
COMMENT ON COLUMN public.assembly_by_day.is_flag IS 'National flag raising ceremony (Tue DAY2/7)';
COMMENT ON COLUMN public.assembly_by_day.is_3x IS '3X / Wednesday: awards + announcements only';

ALTER TABLE public.assembly_by_day ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS school_read_assembly_by_day ON public.assembly_by_day;
CREATE POLICY school_read_assembly_by_day ON public.assembly_by_day
  FOR SELECT TO authenticated
  USING (COALESCE((auth.jwt() ->> 'email'::text), ''::text) ~~* '%@g.lwfss.edu.hk'::text);

REVOKE ALL ON TABLE public.assembly_by_day FROM anon;
GRANT SELECT ON TABLE public.assembly_by_day TO authenticated;
