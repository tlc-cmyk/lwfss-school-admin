-- Students / subject groups / class teachers (Supabase Postgres)
-- Academic year 2026-2027 · RLS: school-domain SELECT (@g.lwfss.edu.hk)

CREATE TABLE IF NOT EXISTS public.students (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  class_code text NOT NULL,
  class_no integer NOT NULL,
  english_name text NOT NULL DEFAULT '',
  chinese_name text NOT NULL DEFAULT '',
  sex text NOT NULL DEFAULT '',
  email text NULL,
  academic_year text NOT NULL DEFAULT '2026-2027',
  alias text NOT NULL DEFAULT '',
  house text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT students_class_no_positive CHECK (class_no > 0),
  CONSTRAINT students_year_class_no_unique UNIQUE (academic_year, class_code, class_no)
);

CREATE INDEX IF NOT EXISTS idx_students_class ON public.students (academic_year, class_code);
CREATE INDEX IF NOT EXISTS idx_students_english_name ON public.students (english_name);
CREATE INDEX IF NOT EXISTS idx_students_chinese_name ON public.students (chinese_name);

COMMENT ON TABLE public.students IS 'Student roster by class (class_code + class_no)';
COMMENT ON COLUMN public.students.class_code IS 'e.g. 1A … 6D';
COMMENT ON COLUMN public.students.email IS 'Nullable; fill when Google Workspace student email known';

CREATE TABLE IF NOT EXISTS public.student_groups (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  student_id bigint NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  form text NOT NULL,
  subject text NOT NULL DEFAULT '',
  group_name text NOT NULL DEFAULT '',
  teacher_short_name text NOT NULL DEFAULT '',
  academic_year text NOT NULL DEFAULT '2026-2027',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_student_groups_student ON public.student_groups (student_id);
CREATE INDEX IF NOT EXISTS idx_student_groups_form_subject ON public.student_groups (academic_year, form, subject);
CREATE INDEX IF NOT EXISTS idx_student_groups_teacher ON public.student_groups (teacher_short_name);

COMMENT ON TABLE public.student_groups IS 'Subject / streaming group membership (S2–S6)';
COMMENT ON COLUMN public.student_groups.form IS 'S2 | S3 | S4 | S5 | S6';
COMMENT ON COLUMN public.student_groups.teacher_short_name IS 'Teacher shortcode from grouping sheet (lowercase)';

CREATE TABLE IF NOT EXISTS public.class_teachers (
  class_code text NOT NULL,
  teacher_short_name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  academic_year text NOT NULL DEFAULT '2026-2027',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (academic_year, class_code, teacher_short_name)
);

CREATE INDEX IF NOT EXISTS idx_class_teachers_short ON public.class_teachers (teacher_short_name);

COMMENT ON TABLE public.class_teachers IS 'Class teachers (班主任) shortcodes per class';

ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_teachers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS school_read_students ON public.students;
CREATE POLICY school_read_students ON public.students
  FOR SELECT
  TO authenticated
  USING (COALESCE((auth.jwt() ->> 'email'::text), ''::text) ~~* '%@g.lwfss.edu.hk'::text);

DROP POLICY IF EXISTS school_read_student_groups ON public.student_groups;
CREATE POLICY school_read_student_groups ON public.student_groups
  FOR SELECT
  TO authenticated
  USING (COALESCE((auth.jwt() ->> 'email'::text), ''::text) ~~* '%@g.lwfss.edu.hk'::text);

DROP POLICY IF EXISTS school_read_class_teachers ON public.class_teachers;
CREATE POLICY school_read_class_teachers ON public.class_teachers
  FOR SELECT
  TO authenticated
  USING (COALESCE((auth.jwt() ->> 'email'::text), ''::text) ~~* '%@g.lwfss.edu.hk'::text);

REVOKE ALL ON TABLE public.students FROM anon;
REVOKE ALL ON TABLE public.student_groups FROM anon;
REVOKE ALL ON TABLE public.class_teachers FROM anon;
GRANT SELECT ON TABLE public.students TO authenticated;
GRANT SELECT ON TABLE public.student_groups TO authenticated;
GRANT SELECT ON TABLE public.class_teachers TO authenticated;
