-- Class attendance (我的課堂點名) — Supabase Postgres
-- One row per teacher-owned scope + date + student.
-- RLS: staff (@g.lwfss.edu.hk in staff table) CRUD own rows only.

CREATE TABLE IF NOT EXISTS public.class_attendance (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  owner_email text NOT NULL,
  teacher_code text NOT NULL DEFAULT '',
  attendance_date date NOT NULL,
  scope_kind text NOT NULL DEFAULT 'class',
  class_code text NOT NULL DEFAULT '',
  form text NOT NULL DEFAULT '',
  subject text NOT NULL DEFAULT '',
  group_name text NOT NULL DEFAULT '',
  student_id bigint NOT NULL,
  status text NOT NULL DEFAULT 'present',
  academic_year text NOT NULL DEFAULT '2026-2027',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT class_attendance_status_ok
    CHECK (status IN ('present', 'absent', 'late')),
  CONSTRAINT class_attendance_scope_kind_ok
    CHECK (scope_kind IN ('class', 'group', 'split')),
  CONSTRAINT class_attendance_owner_email_domain
    CHECK (owner_email ~~* '%@g.lwfss.edu.hk')
);

ALTER TABLE public.class_attendance
  DROP CONSTRAINT IF EXISTS uq_class_attendance_scope_student;
ALTER TABLE public.class_attendance
  ADD CONSTRAINT uq_class_attendance_scope_student UNIQUE (
    owner_email,
    attendance_date,
    scope_kind,
    class_code,
    form,
    subject,
    group_name,
    student_id
  );

CREATE INDEX IF NOT EXISTS idx_class_attendance_owner_date
  ON public.class_attendance (owner_email, attendance_date DESC);

CREATE INDEX IF NOT EXISTS idx_class_attendance_scope_date
  ON public.class_attendance (
    owner_email, attendance_date, scope_kind, class_code, form, subject, group_name
  );

CREATE INDEX IF NOT EXISTS idx_class_attendance_student
  ON public.class_attendance (student_id, attendance_date);

COMMENT ON TABLE public.class_attendance IS 'Teacher-owned per-date class/group attendance (我的課堂點名)';
COMMENT ON COLUMN public.class_attendance.owner_email IS 'Lowercased Google Workspace email of marking teacher';
COMMENT ON COLUMN public.class_attendance.attendance_date IS 'Calendar date (Asia/Hong_Kong browse date)';
COMMENT ON COLUMN public.class_attendance.scope_kind IS 'class | group | split — same as seating_charts';
COMMENT ON COLUMN public.class_attendance.status IS 'present=出席, absent=缺席, late=遲到';

CREATE OR REPLACE FUNCTION public.class_attendance_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_class_attendance_updated_at ON public.class_attendance;
CREATE TRIGGER trg_class_attendance_updated_at
  BEFORE UPDATE ON public.class_attendance
  FOR EACH ROW
  EXECUTE FUNCTION public.class_attendance_set_updated_at();

-- Owner must match JWT; optional soft check that student_id is numeric positive.
CREATE OR REPLACE FUNCTION public.class_attendance_enforce_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.owner_email IS DISTINCT FROM public.jwt_email() THEN
    RAISE EXCEPTION 'class_attendance: owner_email must match signed-in staff';
  END IF;
  IF NEW.scope_kind IS NULL OR NEW.scope_kind = '' THEN
    NEW.scope_kind := 'class';
  END IF;
  NEW.owner_email := lower(NEW.owner_email);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_class_attendance_enforce_owner ON public.class_attendance;
CREATE TRIGGER trg_class_attendance_enforce_owner
  BEFORE INSERT OR UPDATE ON public.class_attendance
  FOR EACH ROW
  EXECUTE FUNCTION public.class_attendance_enforce_owner();

ALTER TABLE public.class_attendance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS class_attendance_select ON public.class_attendance;
CREATE POLICY class_attendance_select ON public.class_attendance
  FOR SELECT
  TO authenticated
  USING (
    public.is_staff_email()
    AND owner_email = public.jwt_email()
  );

DROP POLICY IF EXISTS class_attendance_insert ON public.class_attendance;
CREATE POLICY class_attendance_insert ON public.class_attendance
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_staff_email()
    AND owner_email = public.jwt_email()
  );

DROP POLICY IF EXISTS class_attendance_update ON public.class_attendance;
CREATE POLICY class_attendance_update ON public.class_attendance
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

DROP POLICY IF EXISTS class_attendance_delete ON public.class_attendance;
CREATE POLICY class_attendance_delete ON public.class_attendance
  FOR DELETE
  TO authenticated
  USING (
    public.is_staff_email()
    AND owner_email = public.jwt_email()
  );

REVOKE ALL ON TABLE public.class_attendance FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.class_attendance TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
