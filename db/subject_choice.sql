-- 中三升中四選科系統 — Supabase Postgres
-- Academic year 2026-2027 · 21 subjects (X1/X2/X3) · unique ranks 1–21
-- RLS: school-domain read for catalogue/settings; students write only their
-- own submission while the round is open; staff read all + lock/deadline.

CREATE TABLE IF NOT EXISTS public.subject_choice_subjects (
  code text NOT NULL,
  academic_year text NOT NULL,
  block text NOT NULL,
  display_name text NOT NULL,
  sort_order integer NOT NULL,
  is_apl boolean NOT NULL DEFAULT false,
  medium text NOT NULL DEFAULT '',
  pair_group text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (academic_year, code),
  CONSTRAINT subject_choice_subjects_block_ok
    CHECK (block IN ('x1', 'x2', 'x3')),
  CONSTRAINT subject_choice_subjects_medium_ok
    CHECK (medium IN ('', 'cmi', 'emi')),
  CONSTRAINT subject_choice_subjects_sort_ok
    CHECK (sort_order > 0)
);

CREATE INDEX IF NOT EXISTS idx_subject_choice_subjects_block
  ON public.subject_choice_subjects (academic_year, block, sort_order);

COMMENT ON TABLE public.subject_choice_subjects IS
  'S3→S4 elective catalogue (X1/X2/X3); 21 subjects per academic year';
COMMENT ON COLUMN public.subject_choice_subjects.medium IS
  'cmi / emi / empty; visual annotation only';
COMMENT ON COLUMN public.subject_choice_subjects.pair_group IS
  'CMI/EMI or same-subject-different-block grouping (bafs, bio, econ, phy, geog)';
COMMENT ON COLUMN public.subject_choice_subjects.is_apl IS
  'Applied Learning (ApL) subjects, typically in X3';

CREATE TABLE IF NOT EXISTS public.subject_choice_rounds (
  academic_year text PRIMARY KEY,
  title text NOT NULL,
  locked boolean NOT NULL DEFAULT false,
  deadline timestamptz NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by_email text
);

COMMENT ON TABLE public.subject_choice_rounds IS
  'One selection round per academic year: title, lock flag, and 改選限期 (Hong Kong time)';
COMMENT ON COLUMN public.subject_choice_rounds.deadline IS
  'Cutoff timestamptz; NULL means no deadline. Display to users in Asia/Hong_Kong.';
COMMENT ON COLUMN public.subject_choice_rounds.locked IS
  'Staff lock; when true students cannot submit or update even if deadline is still in the future';

CREATE TABLE IF NOT EXISTS public.subject_choice_submissions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  academic_year text NOT NULL
    REFERENCES public.subject_choice_rounds (academic_year)
    ON UPDATE CASCADE,
  owner_email text NOT NULL,
  student_id bigint NULL
    REFERENCES public.students (id) ON DELETE SET NULL,
  class_code text NOT NULL,
  class_no integer NOT NULL,
  chinese_name text NOT NULL DEFAULT '',
  english_name text NOT NULL DEFAULT '',
  maths_language text NOT NULL,
  ranks jsonb NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subject_choice_submissions_email_domain
    CHECK (owner_email ~~* '%@g.lwfss.edu.hk'),
  CONSTRAINT subject_choice_submissions_class_no_ok
    CHECK (class_no > 0),
  CONSTRAINT subject_choice_submissions_s3_class
    CHECK (class_code IN ('3A', '3B', '3C', '3D')),
  CONSTRAINT subject_choice_submissions_maths_ok
    CHECK (maths_language IN ('中文', '英文')),
  CONSTRAINT subject_choice_submissions_year_email_unique
    UNIQUE (academic_year, owner_email),
  CONSTRAINT subject_choice_submissions_year_class_no_unique
    UNIQUE (academic_year, class_code, class_no)
);

CREATE INDEX IF NOT EXISTS idx_subject_choice_submissions_class
  ON public.subject_choice_submissions (academic_year, class_code, class_no);
CREATE INDEX IF NOT EXISTS idx_subject_choice_submissions_student
  ON public.subject_choice_submissions (student_id);

COMMENT ON TABLE public.subject_choice_submissions IS
  'One S3 student submission per academic year: maths language + unique ranks 1–21';
COMMENT ON COLUMN public.subject_choice_submissions.ranks IS
  'JSON object keyed by subject code, values integers 1–21, each used once';
COMMENT ON COLUMN public.subject_choice_submissions.maths_language IS
  '希望中四修讀數學科的語言：中文 or 英文';
COMMENT ON COLUMN public.subject_choice_submissions.owner_email IS
  'Lowercased Google Workspace email of the student who submitted';

CREATE OR REPLACE FUNCTION public.subject_choice_round_is_open(p_year text)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.subject_choice_rounds r
    WHERE r.academic_year = p_year
      AND r.locked = false
      AND (r.deadline IS NULL OR now() < r.deadline)
  );
$$;

COMMENT ON FUNCTION public.subject_choice_round_is_open(text) IS
  'True when the round exists, is not staff-locked, and deadline is null or still in the future';

CREATE OR REPLACE FUNCTION public.subject_choice_rounds_before_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by_email := public.jwt_email();
  IF NEW.academic_year IS NULL OR btrim(NEW.academic_year) = '' THEN
    RAISE EXCEPTION 'academic_year is required'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.title IS NULL OR btrim(NEW.title) = '' THEN
    RAISE EXCEPTION 'title is required'
      USING ERRCODE = 'check_violation';
  END IF;
  NEW.title := btrim(NEW.title);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_subject_choice_rounds_before_write
  ON public.subject_choice_rounds;
CREATE TRIGGER trg_subject_choice_rounds_before_write
  BEFORE INSERT OR UPDATE ON public.subject_choice_rounds
  FOR EACH ROW
  EXECUTE FUNCTION public.subject_choice_rounds_before_write();

CREATE OR REPLACE FUNCTION public.subject_choice_submissions_before_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  roster record;
  subj_codes text[];
  rank_codes text[];
  rec record;
  seen int[] := ARRAY[]::int[];
  r numeric;
  v text;
BEGIN
  NEW.owner_email := lower(btrim(NEW.owner_email));
  NEW.class_code := upper(btrim(NEW.class_code));
  NEW.updated_at := now();

  IF TG_OP = 'INSERT' THEN
    NEW.submitted_at := now();
  ELSE
    NEW.submitted_at := OLD.submitted_at;
    IF NEW.owner_email IS DISTINCT FROM OLD.owner_email THEN
      RAISE EXCEPTION '不能更改提交帳戶'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.academic_year IS DISTINCT FROM OLD.academic_year THEN
      RAISE EXCEPTION '不能更改學年'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NOT public.is_staff() THEN
      IF NEW.class_code IS DISTINCT FROM OLD.class_code
         OR NEW.class_no IS DISTINCT FROM OLD.class_no THEN
        RAISE EXCEPTION '不能更改已提交的班別或學號'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;

  IF NOT public.is_staff() THEN
    IF NOT public.subject_choice_round_is_open(NEW.academic_year) THEN
      RAISE EXCEPTION '改選限期已過或表格已關閉'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW.maths_language NOT IN ('中文', '英文') THEN
    RAISE EXCEPTION '請選擇來年數學科修讀的語言（中文或英文）'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT s.id, s.chinese_name, s.english_name, s.class_code, s.class_no
    INTO roster
  FROM public.students s
  WHERE s.academic_year = NEW.academic_year
    AND s.class_code = NEW.class_code
    AND s.class_no = NEW.class_no;

  IF NOT FOUND THEN
    RAISE EXCEPTION '找不到對應的中三學生名單記錄'
      USING ERRCODE = 'check_violation';
  END IF;

  NEW.student_id := roster.id;
  NEW.chinese_name := COALESCE(roster.chinese_name, '');
  NEW.english_name := COALESCE(roster.english_name, '');

  IF jsonb_typeof(NEW.ranks) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION '必須為全部 21 個科目各填一個優次'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT COALESCE(array_agg(s.code ORDER BY s.code), ARRAY[]::text[])
    INTO subj_codes
  FROM public.subject_choice_subjects s
  WHERE s.academic_year = NEW.academic_year;

  SELECT COALESCE(array_agg(k ORDER BY k), ARRAY[]::text[])
    INTO rank_codes
  FROM jsonb_object_keys(NEW.ranks) AS k;

  IF rank_codes IS DISTINCT FROM subj_codes THEN
    RAISE EXCEPTION '必須為全部 21 個科目各填一個優次'
      USING ERRCODE = 'check_violation';
  END IF;

  FOR rec IN
    SELECT key, value FROM jsonb_each(NEW.ranks)
  LOOP
    v := rec.value #>> '{}';
    IF jsonb_typeof(rec.value) = 'number' THEN
      r := v::numeric;
    ELSIF jsonb_typeof(rec.value) = 'string' AND v ~ '^[0-9]+$' THEN
      r := v::numeric;
    ELSE
      RAISE EXCEPTION '優次必須是 1 至 21 的整數'
        USING ERRCODE = 'check_violation';
    END IF;
    IF r <> trunc(r) OR r < 1 OR r > 21 THEN
      RAISE EXCEPTION '優次必須是 1 至 21 的整數'
        USING ERRCODE = 'check_violation';
    END IF;
    IF r::int = ANY (seen) THEN
      RAISE EXCEPTION '優次數字不可重複'
        USING ERRCODE = 'check_violation';
    END IF;
    seen := seen || r::int;
  END LOOP;

  IF cardinality(seen) <> 21 THEN
    RAISE EXCEPTION '必須填滿 1 至 21，數字不可重複'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_subject_choice_submissions_before_write
  ON public.subject_choice_submissions;
CREATE TRIGGER trg_subject_choice_submissions_before_write
  BEFORE INSERT OR UPDATE ON public.subject_choice_submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.subject_choice_submissions_before_write();

ALTER TABLE public.subject_choice_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subject_choice_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subject_choice_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS subject_choice_subjects_select ON public.subject_choice_subjects;
CREATE POLICY subject_choice_subjects_select ON public.subject_choice_subjects
  FOR SELECT
  TO authenticated
  USING ((SELECT public.is_school_email()));

DROP POLICY IF EXISTS subject_choice_rounds_select ON public.subject_choice_rounds;
CREATE POLICY subject_choice_rounds_select ON public.subject_choice_rounds
  FOR SELECT
  TO authenticated
  USING ((SELECT public.is_school_email()));

DROP POLICY IF EXISTS subject_choice_rounds_insert ON public.subject_choice_rounds;
CREATE POLICY subject_choice_rounds_insert ON public.subject_choice_rounds
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT public.is_staff()));

DROP POLICY IF EXISTS subject_choice_rounds_update ON public.subject_choice_rounds;
CREATE POLICY subject_choice_rounds_update ON public.subject_choice_rounds
  FOR UPDATE
  TO authenticated
  USING ((SELECT public.is_staff()))
  WITH CHECK ((SELECT public.is_staff()));

DROP POLICY IF EXISTS subject_choice_submissions_select ON public.subject_choice_submissions;
CREATE POLICY subject_choice_submissions_select ON public.subject_choice_submissions
  FOR SELECT
  TO authenticated
  USING (
    (SELECT public.is_school_email())
    AND (
      owner_email = (SELECT public.jwt_email())
      OR (SELECT public.is_staff())
    )
  );

DROP POLICY IF EXISTS subject_choice_submissions_insert ON public.subject_choice_submissions;
CREATE POLICY subject_choice_submissions_insert ON public.subject_choice_submissions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT public.is_school_email())
    AND owner_email = (SELECT public.jwt_email())
    AND public.subject_choice_round_is_open(academic_year)
  );

DROP POLICY IF EXISTS subject_choice_submissions_update ON public.subject_choice_submissions;
CREATE POLICY subject_choice_submissions_update ON public.subject_choice_submissions
  FOR UPDATE
  TO authenticated
  USING (
    (SELECT public.is_school_email())
    AND (
      (
        owner_email = (SELECT public.jwt_email())
        AND public.subject_choice_round_is_open(academic_year)
      )
      OR (SELECT public.is_staff())
    )
  )
  WITH CHECK (
    (SELECT public.is_school_email())
    AND (
      (
        owner_email = (SELECT public.jwt_email())
        AND public.subject_choice_round_is_open(academic_year)
      )
      OR (SELECT public.is_staff())
    )
  );

DROP POLICY IF EXISTS subject_choice_submissions_delete ON public.subject_choice_submissions;
CREATE POLICY subject_choice_submissions_delete ON public.subject_choice_submissions
  FOR DELETE
  TO authenticated
  USING ((SELECT public.is_staff()));

REVOKE ALL ON TABLE public.subject_choice_subjects FROM anon, public, authenticated;
REVOKE ALL ON TABLE public.subject_choice_rounds FROM anon, public, authenticated;
REVOKE ALL ON TABLE public.subject_choice_submissions FROM anon, public, authenticated;

GRANT SELECT ON TABLE public.subject_choice_subjects TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.subject_choice_rounds TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.subject_choice_submissions TO authenticated;

DO $$
DECLARE
  seq_name text;
BEGIN
  seq_name := pg_get_serial_sequence('public.subject_choice_submissions', 'id');
  IF seq_name IS NOT NULL THEN
    EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM anon, public', seq_name);
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO authenticated', seq_name);
  END IF;
END
$$;

REVOKE ALL ON FUNCTION public.subject_choice_round_is_open(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.subject_choice_round_is_open(text) TO authenticated;

INSERT INTO public.subject_choice_rounds (academic_year, title, locked, deadline)
VALUES ('2026-2027', '2026-2027學年中三選科系統', false, NULL)
ON CONFLICT (academic_year) DO NOTHING;

INSERT INTO public.subject_choice_subjects
  (code, academic_year, block, display_name, sort_order, is_apl, medium, pair_group)
VALUES
  ('x1_bafs_cmi',  '2026-2027', 'x1', '企會財',                         1, false, 'cmi', 'bafs'),
  ('x1_bafs',      '2026-2027', 'x1', 'BAFS',                           2, false, 'emi', 'bafs'),
  ('x1_chem',      '2026-2027', 'x1', 'Chemistry',                      3, false, 'emi', ''),
  ('x1_chist',     '2026-2027', 'x1', '中國歷史',                       4, false, 'cmi', ''),
  ('x1_geog',      '2026-2027', 'x1', '地理1',                          5, false, '',    'geog'),
  ('x1_ict',       '2026-2027', 'x1', '資訊及通訊科技',                 6, false, '',    ''),
  ('x1_hmsc',      '2026-2027', 'x1', '健康管理與社會關懷',             7, false, 'cmi', ''),
  ('x2_bio',       '2026-2027', 'x2', '生物',                           1, false, 'cmi', 'bio'),
  ('x2_econ',      '2026-2027', 'x2', '經濟',                           2, false, 'cmi', 'econ'),
  ('x2_econ_emi',  '2026-2027', 'x2', 'Economics',                      3, false, 'emi', 'econ'),
  ('x2_hist',      '2026-2027', 'x2', '歷史',                           4, false, 'cmi', ''),
  ('x2_phy',       '2026-2027', 'x2', 'Physics',                        5, false, 'emi', 'phy'),
  ('x2_th',        '2026-2027', 'x2', '旅遊與款待',                     6, false, 'cmi', ''),
  ('x2_va',        '2026-2027', 'x2', '視覺藝術',                       7, false, '',    ''),
  ('x3_bio',       '2026-2027', 'x3', 'Biology',                        1, false, 'emi', 'bio'),
  ('x3_phy',       '2026-2027', 'x3', '物理',                           2, false, 'cmi', 'phy'),
  ('x3_geog',      '2026-2027', 'x3', '地理3',                          3, false, '',    'geog'),
  ('x3_m2',        '2026-2027', 'x3', '數學延伸單元2 (M2)',             4, false, '',    ''),
  ('x3_apl_eng',   '2026-2027', 'x3', '服務業專業英語(ApL)',            5, true,  '',    ''),
  ('x3_apl_cmed',  '2026-2027', 'x3', '中醫藥學基礎(ApL)',              6, true,  '',    ''),
  ('x3_apl_mkt_ai','2026-2027', 'x3', '意見領袖市場學與生成式人工智能(APL)', 7, true, '', '')
ON CONFLICT (academic_year, code) DO NOTHING;
