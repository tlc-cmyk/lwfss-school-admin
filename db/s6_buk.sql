-- 中六級補課 (after-school P8) — 2026-09-04 … 2027-02-02
-- Keyed by slot_kind (chi|eng|math|x1|x2); cycle day → kind is client-side.
-- Readable by all school-domain accounts (@g.lwfss.edu.hk)

CREATE TABLE IF NOT EXISTS public.s6_buk_meta (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  start_date date NOT NULL,
  end_date date NOT NULL,
  notes text NOT NULL DEFAULT ''
);

COMMENT ON TABLE public.s6_buk_meta IS 'S6 補課 date range (single-row meta)';
COMMENT ON COLUMN public.s6_buk_meta.start_date IS 'Inclusive start (2026-09-04)';
COMMENT ON COLUMN public.s6_buk_meta.end_date IS 'Inclusive end (2027-02-02)';

CREATE TABLE IF NOT EXISTS public.s6_buk_assignments (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  teacher_code text NOT NULL,
  subject text NOT NULL,
  room text NOT NULL DEFAULT '',
  group_label text NOT NULL DEFAULT '',
  slot_kind text NOT NULL CHECK (slot_kind IN ('chi', 'eng', 'math', 'x1', 'x2'))
);

COMMENT ON TABLE public.s6_buk_assignments IS 'S6 after-school 補課 teacher assignments by slot kind';
COMMENT ON COLUMN public.s6_buk_assignments.teacher_code IS 'Uppercase staff short_name / teachers.code';
COMMENT ON COLUMN public.s6_buk_assignments.subject IS 'Display subject: CHI/ENG/MATH or elective name';
COMMENT ON COLUMN public.s6_buk_assignments.room IS 'Classroom / venue';
COMMENT ON COLUMN public.s6_buk_assignments.group_label IS 'Core group (G1…) or elective subgroup';
COMMENT ON COLUMN public.s6_buk_assignments.slot_kind IS 'chi|eng|math|x1|x2 — mapped from cycle day';

CREATE INDEX IF NOT EXISTS s6_buk_assignments_teacher_idx
  ON public.s6_buk_assignments (teacher_code);
CREATE INDEX IF NOT EXISTS s6_buk_assignments_slot_idx
  ON public.s6_buk_assignments (slot_kind);

ALTER TABLE public.s6_buk_meta ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.s6_buk_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS school_read_s6_buk_meta ON public.s6_buk_meta;
CREATE POLICY school_read_s6_buk_meta ON public.s6_buk_meta
  FOR SELECT TO authenticated
  USING (COALESCE((auth.jwt() ->> 'email'::text), ''::text) ~~* '%@g.lwfss.edu.hk'::text);

DROP POLICY IF EXISTS school_read_s6_buk_assignments ON public.s6_buk_assignments;
CREATE POLICY school_read_s6_buk_assignments ON public.s6_buk_assignments
  FOR SELECT TO authenticated
  USING (COALESCE((auth.jwt() ->> 'email'::text), ''::text) ~~* '%@g.lwfss.edu.hk'::text);

REVOKE ALL ON TABLE public.s6_buk_meta FROM anon;
REVOKE ALL ON TABLE public.s6_buk_assignments FROM anon;
GRANT SELECT ON TABLE public.s6_buk_meta TO authenticated;
GRANT SELECT ON TABLE public.s6_buk_assignments TO authenticated;
