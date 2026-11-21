-- ICT 題庫（HKDSE ICT 樣本試卷／練習卷甲部選擇題）— Supabase Postgres
-- 題幹、選項、答案與官方 PDF／圖表只存放在此專案資料庫，不要寫進公開倉庫的 docs/。
-- RLS: 只有已登入、電郵以 @g.lwfss.edu.hk 結尾的帳戶可以 SELECT。無公開讀取、無前端寫入。

CREATE TABLE IF NOT EXISTS public.ict_quiz_papers (
  id text PRIMARY KEY,
  year_label text NOT NULL,
  year_sort integer NOT NULL,
  title text NOT NULL,
  short_title text NOT NULL,
  nav_subject text NOT NULL,
  nav_paper text NOT NULL,
  paper text,
  section text,
  official boolean NOT NULL DEFAULT true,
  question_count integer NOT NULL,
  pdf_path text,
  pdf_label text,
  note text,
  source text,
  answer_source text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ict_quiz_questions (
  paper_id text NOT NULL REFERENCES public.ict_quiz_papers(id) ON DELETE CASCADE,
  no integer NOT NULL,
  answer text NOT NULL,
  stem_html text NOT NULL,
  options jsonb NOT NULL,
  layout text,
  headers jsonb,
  source_note text,
  PRIMARY KEY (paper_id, no),
  CONSTRAINT ict_quiz_questions_answer_ok CHECK (answer IN ('A', 'B', 'C', 'D')),
  CONSTRAINT ict_quiz_questions_no_ok CHECK (no > 0)
);

CREATE INDEX IF NOT EXISTS idx_ict_quiz_questions_paper_no
  ON public.ict_quiz_questions (paper_id, no);

CREATE TABLE IF NOT EXISTS public.ict_quiz_assets (
  path text PRIMARY KEY,
  mime_type text NOT NULL,
  file_name text NOT NULL,
  content_base64 text NOT NULL,
  byte_size integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ict_quiz_assets_path_ok CHECK (path ~ '^(images|papers)/'),
  CONSTRAINT ict_quiz_assets_size_ok CHECK (byte_size > 0)
);

COMMENT ON TABLE public.ict_quiz_papers IS
  'HKDSE ICT official sample/practice MC papers (metadata only in public repo; stems live in DB)';
COMMENT ON TABLE public.ict_quiz_questions IS
  'Official HKEAA MC stems, options and answers; SELECT for school-domain accounts only';
COMMENT ON TABLE public.ict_quiz_assets IS
  'Official Paper 1 PDFs and question figures; SELECT for school-domain accounts only';
COMMENT ON COLUMN public.ict_quiz_assets.path IS
  'Stable path used in stem HTML (images/...) or paper.pdf_path (papers/...)';
COMMENT ON COLUMN public.ict_quiz_questions.answer IS
  'Official mark-scheme key (A–D); do not invent';

ALTER TABLE public.ict_quiz_papers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ict_quiz_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ict_quiz_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ict_quiz_papers_select ON public.ict_quiz_papers;
CREATE POLICY ict_quiz_papers_select ON public.ict_quiz_papers
  FOR SELECT
  TO authenticated
  USING (public.is_school_email());

DROP POLICY IF EXISTS ict_quiz_questions_select ON public.ict_quiz_questions;
CREATE POLICY ict_quiz_questions_select ON public.ict_quiz_questions
  FOR SELECT
  TO authenticated
  USING (public.is_school_email());

DROP POLICY IF EXISTS ict_quiz_assets_select ON public.ict_quiz_assets;
CREATE POLICY ict_quiz_assets_select ON public.ict_quiz_assets
  FOR SELECT
  TO authenticated
  USING (public.is_school_email());

REVOKE ALL ON TABLE public.ict_quiz_papers FROM anon, public, authenticated;
REVOKE ALL ON TABLE public.ict_quiz_questions FROM anon, public, authenticated;
REVOKE ALL ON TABLE public.ict_quiz_assets FROM anon, public, authenticated;

GRANT SELECT ON TABLE public.ict_quiz_papers TO authenticated;
GRANT SELECT ON TABLE public.ict_quiz_questions TO authenticated;
GRANT SELECT ON TABLE public.ict_quiz_assets TO authenticated;
