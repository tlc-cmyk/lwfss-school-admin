-- gate_attendance: eClass「完整拍卡紀錄」shared among staff (今日拍卡)
-- Distinct from class_attendance (我的課堂點名).
-- Apply on Supabase project lwfss-school-admin (edausixxdclhonkrdzqg)

CREATE TABLE IF NOT EXISTS public.gate_attendance (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  punch_date date NOT NULL,
  class_name text NOT NULL DEFAULT '',
  student_no text NOT NULL DEFAULT '',
  student_name text NOT NULL DEFAULT '',
  tap_times text[] NOT NULL DEFAULT '{}',
  first_tap text NOT NULL DEFAULT '',
  last_tap text NOT NULL DEFAULT '',
  uploaded_by text NOT NULL DEFAULT '',
  uploaded_by_code text NOT NULL DEFAULT '',
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'upload',
  CONSTRAINT uq_gate_attendance_day_student UNIQUE (punch_date, class_name, student_no)
);

CREATE INDEX IF NOT EXISTS idx_gate_attendance_date
  ON public.gate_attendance (punch_date DESC);

CREATE INDEX IF NOT EXISTS idx_gate_attendance_date_class
  ON public.gate_attendance (punch_date, class_name);

COMMENT ON TABLE public.gate_attendance IS 'eClass gate punch records (今日拍卡); shared among staff; distinct from class_attendance';
COMMENT ON COLUMN public.gate_attendance.punch_date IS 'Calendar date of the punch record';
COMMENT ON COLUMN public.gate_attendance.class_name IS 'Class code e.g. 1A';
COMMENT ON COLUMN public.gate_attendance.student_no IS 'Class number as text from eClass';
COMMENT ON COLUMN public.gate_attendance.student_name IS 'Student display name from eClass';
COMMENT ON COLUMN public.gate_attendance.tap_times IS 'All punch times HH:MM:SS sorted';
COMMENT ON COLUMN public.gate_attendance.first_tap IS 'Earliest punch time';
COMMENT ON COLUMN public.gate_attendance.last_tap IS 'Latest punch time';
COMMENT ON COLUMN public.gate_attendance.uploaded_by IS 'Uploader email';
COMMENT ON COLUMN public.gate_attendance.uploaded_by_code IS 'Uploader staff short_name if known';
COMMENT ON COLUMN public.gate_attendance.source IS 'upload | sample';

ALTER TABLE public.gate_attendance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS school_read_gate_attendance ON public.gate_attendance;
CREATE POLICY school_read_gate_attendance ON public.gate_attendance
  FOR SELECT TO authenticated
  USING (COALESCE((auth.jwt() ->> 'email'::text), ''::text) ~~* '%@g.lwfss.edu.hk'::text);

DROP POLICY IF EXISTS staff_insert_gate_attendance ON public.gate_attendance;
CREATE POLICY staff_insert_gate_attendance ON public.gate_attendance
  FOR INSERT TO authenticated
  WITH CHECK (public.is_staff());

DROP POLICY IF EXISTS staff_update_gate_attendance ON public.gate_attendance;
CREATE POLICY staff_update_gate_attendance ON public.gate_attendance
  FOR UPDATE TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

DROP POLICY IF EXISTS staff_delete_gate_attendance ON public.gate_attendance;
CREATE POLICY staff_delete_gate_attendance ON public.gate_attendance
  FOR DELETE TO authenticated
  USING (public.is_staff());

REVOKE ALL ON TABLE public.gate_attendance FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.gate_attendance TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
