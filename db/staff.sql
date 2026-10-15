-- Staff allowlist (Supabase Postgres)
-- Applied via MCP migration: create_staff_allowlist
-- Role rule: email in staff → teacher/staff UI; else → student

CREATE TABLE IF NOT EXISTS public.staff (
  email text PRIMARY KEY,
  short_name text NOT NULL DEFAULT '',
  name text NOT NULL DEFAULT '',
  role_title text NOT NULL DEFAULT '',
  class_teacher text NULL,
  is_teaching_staff boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_short_name ON public.staff (short_name);

ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS school_read_staff ON public.staff;
CREATE POLICY school_read_staff ON public.staff
  FOR SELECT
  TO authenticated
  USING (COALESCE((auth.jwt() ->> 'email'::text), ''::text) ~~* '%@g.lwfss.edu.hk'::text);

REVOKE ALL ON TABLE public.staff FROM anon;
GRANT SELECT ON TABLE public.staff TO authenticated;
