-- duty_roster: teachers on duty by calendar date (Sep 2026 – Jul 2027)
-- Readable by all school-domain accounts (@g.lwfss.edu.hk)

CREATE TABLE IF NOT EXISTS public.duty_roster (
  duty_date date PRIMARY KEY,
  teacher1 text NOT NULL DEFAULT '',
  teacher2 text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT ''
);

COMMENT ON TABLE public.duty_roster IS 'Duty roster teachers by calendar date (值日老師)';
COMMENT ON COLUMN public.duty_roster.duty_date IS 'School day date';
COMMENT ON COLUMN public.duty_roster.teacher1 IS 'Teacher 1 short code';
COMMENT ON COLUMN public.duty_roster.teacher2 IS 'Teacher 2 short code';
COMMENT ON COLUMN public.duty_roster.notes IS 'Optional notes (switches, etc.)';

ALTER TABLE public.duty_roster ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS school_read_duty_roster ON public.duty_roster;
CREATE POLICY school_read_duty_roster ON public.duty_roster
  FOR SELECT TO authenticated
  USING (COALESCE((auth.jwt() ->> 'email'::text), ''::text) ~~* '%@g.lwfss.edu.hk'::text);

REVOKE ALL ON TABLE public.duty_roster FROM anon;
GRANT SELECT ON TABLE public.duty_roster TO authenticated;
