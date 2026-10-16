-- Seating charts (座位表) — Supabase Postgres
-- Staff-owned charts per class; seat layout stored as JSONB.
-- RLS: staff CRUD own charts; other staff who teach that class may SELECT.

CREATE TABLE IF NOT EXISTS public.seating_charts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  class_code text NOT NULL,
  teacher_code text NOT NULL DEFAULT '',
  owner_email text NOT NULL,
  title text NOT NULL DEFAULT '',
  rows integer NOT NULL DEFAULT 6,
  cols integer NOT NULL DEFAULT 6,
  layout jsonb NOT NULL DEFAULT '[]'::jsonb,
  academic_year text NOT NULL DEFAULT '2026-2027',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT seating_charts_rows_ok CHECK (rows > 0 AND rows <= 20),
  CONSTRAINT seating_charts_cols_ok CHECK (cols > 0 AND cols <= 20),
  CONSTRAINT seating_charts_layout_is_array CHECK (jsonb_typeof(layout) = 'array')
);

CREATE INDEX IF NOT EXISTS idx_seating_charts_owner
  ON public.seating_charts (owner_email);
CREATE INDEX IF NOT EXISTS idx_seating_charts_class
  ON public.seating_charts (academic_year, class_code);
CREATE INDEX IF NOT EXISTS idx_seating_charts_teacher
  ON public.seating_charts (teacher_code);

COMMENT ON TABLE public.seating_charts IS 'Teacher-owned classroom seating charts (座位表)';
COMMENT ON COLUMN public.seating_charts.class_code IS 'e.g. 1A … 6D';
COMMENT ON COLUMN public.seating_charts.teacher_code IS 'Owner short_name (uppercase preferred)';
COMMENT ON COLUMN public.seating_charts.owner_email IS 'Lowercased Google Workspace email of owner';
COMMENT ON COLUMN public.seating_charts.layout IS 'JSON array of {r,c,student_id,class_no,name_zh,name_en,notes}';

CREATE OR REPLACE FUNCTION public.seating_charts_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seating_charts_updated_at ON public.seating_charts;
CREATE TRIGGER trg_seating_charts_updated_at
  BEFORE UPDATE ON public.seating_charts
  FOR EACH ROW
  EXECUTE FUNCTION public.seating_charts_set_updated_at();

CREATE OR REPLACE FUNCTION public.jwt_email()
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT lower(COALESCE(auth.jwt() ->> 'email', ''));
$$;

CREATE OR REPLACE FUNCTION public.is_staff_email()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.staff s
    WHERE s.email = public.jwt_email()
  );
$$;

-- Caller teaches this class (班主任 / timetable lessons / subject groups)
CREATE OR REPLACE FUNCTION public.staff_teaches_class(p_class text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.staff s
    WHERE s.email = public.jwt_email()
      AND (
        (s.class_teacher IS NOT NULL AND upper(s.class_teacher) = upper(p_class))
        OR EXISTS (
          SELECT 1 FROM public.class_teachers ct
          WHERE ct.class_code = p_class
            AND lower(ct.teacher_short_name) = lower(s.short_name)
        )
        OR EXISTS (
          SELECT 1 FROM public.lessons l
          WHERE upper(l.teacher_code) = upper(s.short_name)
            AND (
              upper(replace(l.class_short, ' ', '')) = upper(p_class)
              OR upper(replace(l.class_short, ' ', '')) LIKE upper(p_class) || ',%'
              OR upper(replace(l.class_short, ' ', '')) LIKE '%,' || upper(p_class) || ',%'
              OR upper(replace(l.class_short, ' ', '')) LIKE '%,' || upper(p_class)
              OR upper(replace(l.class_name, ' ', '')) = upper(p_class)
            )
        )
        OR EXISTS (
          SELECT 1
          FROM public.student_groups sg
          JOIN public.students st ON st.id = sg.student_id
          WHERE st.class_code = p_class
            AND lower(sg.teacher_short_name) = lower(s.short_name)
        )
      )
  );
$$;

ALTER TABLE public.seating_charts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS seating_charts_select ON public.seating_charts;
CREATE POLICY seating_charts_select ON public.seating_charts
  FOR SELECT
  TO authenticated
  USING (
    public.is_staff_email()
    AND (
      owner_email = public.jwt_email()
      OR public.staff_teaches_class(class_code)
    )
  );

-- Any staff may create a chart they own (frontend prefers taught classes)
DROP POLICY IF EXISTS seating_charts_insert ON public.seating_charts;
CREATE POLICY seating_charts_insert ON public.seating_charts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_staff_email()
    AND owner_email = public.jwt_email()
  );

DROP POLICY IF EXISTS seating_charts_update ON public.seating_charts;
CREATE POLICY seating_charts_update ON public.seating_charts
  FOR UPDATE
  TO authenticated
  USING (
    public.is_staff_email()
    AND owner_email = public.jwt_email()
  )
  WITH CHECK (
    public.is_staff_email()
    AND owner_email = public.jwt_email()
  );

DROP POLICY IF EXISTS seating_charts_delete ON public.seating_charts;
CREATE POLICY seating_charts_delete ON public.seating_charts
  FOR DELETE
  TO authenticated
  USING (
    public.is_staff_email()
    AND owner_email = public.jwt_email()
  );

REVOKE ALL ON TABLE public.seating_charts FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.seating_charts TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
