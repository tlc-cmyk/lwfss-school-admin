-- Personal memos (個人備忘錄) — Supabase Postgres
-- One row per authenticated @g.lwfss.edu.hk user per calendar date.
-- RLS: SELECT/INSERT/UPDATE/DELETE only where owner_email = jwt email.

CREATE TABLE IF NOT EXISTS public.personal_memos (
  owner_email text NOT NULL,
  memo_date date NOT NULL,
  body text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_email, memo_date),
  CONSTRAINT personal_memos_owner_email_domain
    CHECK (owner_email ~~* '%@g.lwfss.edu.hk')
);

CREATE INDEX IF NOT EXISTS idx_personal_memos_owner_date
  ON public.personal_memos (owner_email, memo_date DESC);

COMMENT ON TABLE public.personal_memos IS 'Per-user per-date personal memo (個人備忘錄); own rows only';
COMMENT ON COLUMN public.personal_memos.owner_email IS 'Lowercased Google Workspace email';
COMMENT ON COLUMN public.personal_memos.memo_date IS 'Calendar date this memo applies to (HK date)';
COMMENT ON COLUMN public.personal_memos.body IS 'Memo text; sticky top shows browse/today date only';

CREATE OR REPLACE FUNCTION public.personal_memos_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_personal_memos_updated_at ON public.personal_memos;
CREATE TRIGGER trg_personal_memos_updated_at
  BEFORE UPDATE ON public.personal_memos
  FOR EACH ROW
  EXECUTE FUNCTION public.personal_memos_set_updated_at();

CREATE OR REPLACE FUNCTION public.jwt_email()
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT lower(COALESCE(auth.jwt() ->> 'email', ''));
$$;

CREATE OR REPLACE FUNCTION public.is_school_email()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT public.jwt_email() ~~* '%@g.lwfss.edu.hk';
$$;

ALTER TABLE public.personal_memos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS personal_memos_select ON public.personal_memos;
CREATE POLICY personal_memos_select ON public.personal_memos
  FOR SELECT
  TO authenticated
  USING (
    public.is_school_email()
    AND owner_email = public.jwt_email()
  );

DROP POLICY IF EXISTS personal_memos_insert ON public.personal_memos;
CREATE POLICY personal_memos_insert ON public.personal_memos
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_school_email()
    AND owner_email = public.jwt_email()
  );

DROP POLICY IF EXISTS personal_memos_update ON public.personal_memos;
CREATE POLICY personal_memos_update ON public.personal_memos
  FOR UPDATE
  TO authenticated
  USING (
    public.is_school_email()
    AND owner_email = public.jwt_email()
  )
  WITH CHECK (
    public.is_school_email()
    AND owner_email = public.jwt_email()
  );

DROP POLICY IF EXISTS personal_memos_delete ON public.personal_memos;
CREATE POLICY personal_memos_delete ON public.personal_memos
  FOR DELETE
  TO authenticated
  USING (
    public.is_school_email()
    AND owner_email = public.jwt_email()
  );

REVOKE ALL ON TABLE public.personal_memos FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.personal_memos TO authenticated;
