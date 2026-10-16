-- Seating charts (座位表) — Supabase Postgres
-- Staff-owned charts for a taught class OR subject group (not arbitrary classes).
-- layout JSONB: [{r,c,student_id,class_no,name_zh,name_en,notes}]
-- RLS: CRUD own charts only when caller teaches that class/group scope.

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
  scope_kind text NOT NULL DEFAULT 'class',
  form text NOT NULL DEFAULT '',
  subject text NOT NULL DEFAULT '',
  group_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT seating_charts_rows_ok CHECK (rows > 0 AND rows <= 20),
  CONSTRAINT seating_charts_cols_ok CHECK (cols > 0 AND cols <= 20),
  CONSTRAINT seating_charts_layout_is_array CHECK (jsonb_typeof(layout) = 'array'),
  CONSTRAINT seating_charts_scope_kind_ok CHECK (scope_kind IN ('class', 'group', 'split'))
);

CREATE INDEX IF NOT EXISTS idx_seating_charts_owner
  ON public.seating_charts (owner_email);
CREATE INDEX IF NOT EXISTS idx_seating_charts_class
  ON public.seating_charts (academic_year, class_code);
CREATE INDEX IF NOT EXISTS idx_seating_charts_teacher
  ON public.seating_charts (teacher_code);
CREATE INDEX IF NOT EXISTS idx_seating_charts_scope
  ON public.seating_charts (owner_email, scope_kind, class_code, form, subject, group_name);

COMMENT ON TABLE public.seating_charts IS 'Teacher-owned classroom seating charts (座位表)';
COMMENT ON COLUMN public.seating_charts.class_code IS 'Whole class e.g. 1A, or lesson token e.g. 2A,2B for group charts';
COMMENT ON COLUMN public.seating_charts.scope_kind IS 'class = whole class roster; group = student_groups roster';
COMMENT ON COLUMN public.seating_charts.form IS 'For group scope: S2…S6';
COMMENT ON COLUMN public.seating_charts.subject IS 'For group scope: subject key from student_groups';
COMMENT ON COLUMN public.seating_charts.group_name IS 'For group scope: group_name from student_groups';
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

-- Whole-class chart: 班主任 OR exact single-class lesson (NOT comma/range tokens).
CREATE OR REPLACE FUNCTION public.staff_teaches_whole_class(p_class text)
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
              OR upper(replace(l.class_name, ' ', '')) = upper(p_class)
            )
        )
      )
  );
$$;

-- Subject-group chart: teacher owns that student_groups (form+subject+group_name).
CREATE OR REPLACE FUNCTION public.staff_teaches_subject_group(
  p_form text,
  p_subject text,
  p_group_name text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.staff s
    JOIN public.student_groups sg
      ON lower(sg.teacher_short_name) = lower(s.short_name)
    WHERE s.email = public.jwt_email()
      AND sg.form = p_form
      AND sg.subject = p_subject
      AND sg.group_name = p_group_name
  );
$$;

-- Back-compat alias used by older SELECT policies.
CREATE OR REPLACE FUNCTION public.staff_teaches_class(p_class text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT public.staff_teaches_whole_class(p_class);
$$;

CREATE OR REPLACE FUNCTION public.staff_teaches_lesson_split(p_token text, p_subject text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.staff s
    JOIN public.lessons l ON upper(l.teacher_code) = upper(s.short_name)
    WHERE s.email = public.jwt_email()
      AND upper(replace(l.class_short, ' ', '')) = upper(replace(p_token, ' ', ''))
      AND (
        p_subject = ''
        OR upper(l.subject_short) = upper(p_subject)
        OR upper(l.subject) = upper(p_subject)
        OR upper(split_part(l.subject_short, '-', 1)) = upper(split_part(p_subject, '-', 1))
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.staff_teaches_seating_scope(
  p_kind text,
  p_class text,
  p_form text,
  p_subject text,
  p_group_name text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_kind = 'group' THEN
      public.staff_teaches_subject_group(p_form, p_subject, p_group_name)
    WHEN p_kind = 'split' THEN
      public.staff_teaches_lesson_split(p_class, p_subject)
    ELSE
      public.staff_teaches_whole_class(p_class)
  END;
$$;

-- Every layout student_id must belong to the chart scope roster.
CREATE OR REPLACE FUNCTION public.seating_layout_students_allowed(
  p_kind text,
  p_class text,
  p_form text,
  p_subject text,
  p_group_name text,
  p_layout jsonb,
  p_year text DEFAULT '2026-2027'
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(p_layout, '[]'::jsonb)) AS elem
    WHERE COALESCE(elem->>'student_id', '') ~ '^[0-9]+$'
      AND NOT EXISTS (
        SELECT 1
        FROM public.students st
        WHERE st.id = (elem->>'student_id')::bigint
          AND st.academic_year = p_year
          AND (
            (
              p_kind = 'class'
              AND upper(st.class_code) = upper(p_class)
            )
            OR (
              p_kind = 'group'
              AND EXISTS (
                SELECT 1 FROM public.student_groups sg
                WHERE sg.student_id = st.id
                  AND sg.form = p_form
                  AND sg.subject = p_subject
                  AND sg.group_name = p_group_name
                  AND sg.academic_year = p_year
              )
            )
            OR (
              p_kind = 'split'
              AND upper(st.class_code) = ANY (
                SELECT upper(trim(x))
                FROM unnest(string_to_array(replace(p_class, '，', ','), ',')) AS x
                WHERE trim(x) <> ''
              )
            )
          )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.seating_charts_enforce_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.scope_kind IS NULL OR NEW.scope_kind = '' THEN
    NEW.scope_kind := 'class';
  END IF;
  IF NEW.owner_email IS DISTINCT FROM public.jwt_email() THEN
    RAISE EXCEPTION 'seating_charts: owner_email must match signed-in staff';
  END IF;
  IF NOT public.staff_teaches_seating_scope(
    NEW.scope_kind, NEW.class_code, NEW.form, NEW.subject, NEW.group_name
  ) THEN
    RAISE EXCEPTION 'seating_charts: you do not teach this class/group';
  END IF;
  IF NOT public.seating_layout_students_allowed(
    NEW.scope_kind, NEW.class_code, NEW.form, NEW.subject, NEW.group_name,
    NEW.layout, NEW.academic_year
  ) THEN
    RAISE EXCEPTION 'seating_charts: layout contains students outside taught class/group';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seating_charts_enforce_scope ON public.seating_charts;
CREATE TRIGGER trg_seating_charts_enforce_scope
  BEFORE INSERT OR UPDATE ON public.seating_charts
  FOR EACH ROW
  EXECUTE FUNCTION public.seating_charts_enforce_scope();

ALTER TABLE public.seating_charts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS seating_charts_select ON public.seating_charts;
CREATE POLICY seating_charts_select ON public.seating_charts
  FOR SELECT
  TO authenticated
  USING (
    public.is_staff_email()
    AND (
      owner_email = public.jwt_email()
      OR public.staff_teaches_seating_scope(
        scope_kind, class_code, form, subject, group_name
      )
    )
  );

DROP POLICY IF EXISTS seating_charts_insert ON public.seating_charts;
CREATE POLICY seating_charts_insert ON public.seating_charts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_staff_email()
    AND owner_email = public.jwt_email()
    AND public.staff_teaches_seating_scope(
      scope_kind, class_code, form, subject, group_name
    )
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
    AND public.staff_teaches_seating_scope(
      scope_kind, class_code, form, subject, group_name
    )
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
