-- staff_deadlines write policies for authenticated school staff
-- Apply on Supabase project lwfss-school-admin (edausixxdclhonkrdzqg)
-- Read (SELECT) already restricted to rows when JWT email is in public.staff.
-- This migration enables INSERT / UPDATE / DELETE for the same staff allowlist.

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.staff s
    WHERE s.email = public.jwt_email()
  );
$$;

COMMENT ON FUNCTION public.is_staff() IS 'True when JWT email is in public.staff allowlist';

DROP POLICY IF EXISTS staff_insert_staff_deadlines ON public.staff_deadlines;
CREATE POLICY staff_insert_staff_deadlines ON public.staff_deadlines
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff());

DROP POLICY IF EXISTS staff_update_staff_deadlines ON public.staff_deadlines;
CREATE POLICY staff_update_staff_deadlines ON public.staff_deadlines
  FOR UPDATE
  TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

DROP POLICY IF EXISTS staff_delete_staff_deadlines ON public.staff_deadlines;
CREATE POLICY staff_delete_staff_deadlines ON public.staff_deadlines
  FOR DELETE
  TO authenticated
  USING (public.is_staff());

REVOKE ALL ON TABLE public.staff_deadlines FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.staff_deadlines TO authenticated;
