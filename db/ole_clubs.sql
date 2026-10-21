-- Friday OLE / 課後活動 (calendar Friday, not cycle day)
-- Readable by all school-domain accounts (@g.lwfss.edu.hk)

CREATE TABLE IF NOT EXISTS public.ole_clubs (
  id text PRIMARY KEY,
  name text NOT NULL,
  room text NOT NULL DEFAULT '',
  sort_order int NOT NULL DEFAULT 0,
  notes text NOT NULL DEFAULT ''
);

COMMENT ON TABLE public.ole_clubs IS 'Friday OLE / after-school clubs (課後活動)';
COMMENT ON COLUMN public.ole_clubs.id IS 'Stable club id (slug)';
COMMENT ON COLUMN public.ole_clubs.name IS 'Club / course display name';
COMMENT ON COLUMN public.ole_clubs.room IS 'Usual room / venue';
COMMENT ON COLUMN public.ole_clubs.sort_order IS 'Display order matching source PDF columns';
COMMENT ON COLUMN public.ole_clubs.notes IS 'Optional notes';

CREATE TABLE IF NOT EXISTS public.ole_club_teachers (
  club_id text NOT NULL REFERENCES public.ole_clubs(id) ON DELETE CASCADE,
  teacher_code text NOT NULL,
  PRIMARY KEY (club_id, teacher_code)
);

COMMENT ON TABLE public.ole_club_teachers IS 'Teachers leading each OLE club (uppercase short codes)';
COMMENT ON COLUMN public.ole_club_teachers.teacher_code IS 'Uppercase staff short_name / teachers.code';

CREATE INDEX IF NOT EXISTS ole_club_teachers_code_idx
  ON public.ole_club_teachers (teacher_code);

CREATE TABLE IF NOT EXISTS public.ole_fridays (
  ole_date date PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('clubs', 'special', 'off')),
  title text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT ''
);

COMMENT ON TABLE public.ole_fridays IS 'Friday OLE calendar: clubs run, special school event, or off';
COMMENT ON COLUMN public.ole_fridays.ole_date IS 'Calendar Friday date';
COMMENT ON COLUMN public.ole_fridays.kind IS 'clubs | special | off';
COMMENT ON COLUMN public.ole_fridays.title IS 'Title for special/off days (or blank for clubs)';
COMMENT ON COLUMN public.ole_fridays.notes IS 'Optional notes';

ALTER TABLE public.ole_clubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ole_club_teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ole_fridays ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS school_read_ole_clubs ON public.ole_clubs;
CREATE POLICY school_read_ole_clubs ON public.ole_clubs
  FOR SELECT TO authenticated
  USING (COALESCE((auth.jwt() ->> 'email'::text), ''::text) ~~* '%@g.lwfss.edu.hk'::text);

DROP POLICY IF EXISTS school_read_ole_club_teachers ON public.ole_club_teachers;
CREATE POLICY school_read_ole_club_teachers ON public.ole_club_teachers
  FOR SELECT TO authenticated
  USING (COALESCE((auth.jwt() ->> 'email'::text), ''::text) ~~* '%@g.lwfss.edu.hk'::text);

DROP POLICY IF EXISTS school_read_ole_fridays ON public.ole_fridays;
CREATE POLICY school_read_ole_fridays ON public.ole_fridays
  FOR SELECT TO authenticated
  USING (COALESCE((auth.jwt() ->> 'email'::text), ''::text) ~~* '%@g.lwfss.edu.hk'::text);

REVOKE ALL ON TABLE public.ole_clubs FROM anon;
REVOKE ALL ON TABLE public.ole_club_teachers FROM anon;
REVOKE ALL ON TABLE public.ole_fridays FROM anon;
GRANT SELECT ON TABLE public.ole_clubs TO authenticated;
GRANT SELECT ON TABLE public.ole_club_teachers TO authenticated;
GRANT SELECT ON TABLE public.ole_fridays TO authenticated;
