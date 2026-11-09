-- morning_assemblies: dated morning-assembly bookings (早會內容預約／場地更改)
-- Distinct from assembly_by_day (fixed cycle-day themes) and weekly_assemblies (周會).
-- Apply on Supabase project lwfss-school-admin (edausixxdclhonkrdzqg)

CREATE TABLE IF NOT EXISTS public.morning_assemblies (
  assembly_date date PRIMARY KEY,
  content text NOT NULL DEFAULT '',
  venue text NOT NULL DEFAULT '',
  booked_by text NOT NULL DEFAULT '',
  booked_by_code text NOT NULL DEFAULT '',
  booked_at timestamptz,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.morning_assemblies IS 'Dated morning assembly content bookings and venue overrides (早會)';
COMMENT ON COLUMN public.morning_assemblies.assembly_date IS 'Calendar date of the morning assembly';
COMMENT ON COLUMN public.morning_assemblies.content IS 'Booked morning-assembly content; empty = use assembly_by_day theme';
COMMENT ON COLUMN public.morning_assemblies.venue IS 'Venue override; empty = default (禮堂 implied, no override shown)';
COMMENT ON COLUMN public.morning_assemblies.booked_by IS 'Booker email';
COMMENT ON COLUMN public.morning_assemblies.booked_by_code IS 'Booker staff short_name if known';
COMMENT ON COLUMN public.morning_assemblies.booked_at IS 'Last booking / update time';
COMMENT ON COLUMN public.morning_assemblies.notes IS 'Optional staff notes';

CREATE INDEX IF NOT EXISTS idx_morning_assemblies_booked_at
  ON public.morning_assemblies (booked_at DESC NULLS LAST);

ALTER TABLE public.morning_assemblies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS school_read_morning_assemblies ON public.morning_assemblies;
CREATE POLICY school_read_morning_assemblies ON public.morning_assemblies
  FOR SELECT TO authenticated
  USING (COALESCE((auth.jwt() ->> 'email'::text), ''::text) ~~* '%@g.lwfss.edu.hk'::text);

DROP POLICY IF EXISTS staff_insert_morning_assemblies ON public.morning_assemblies;
CREATE POLICY staff_insert_morning_assemblies ON public.morning_assemblies
  FOR INSERT TO authenticated
  WITH CHECK (public.is_staff());

DROP POLICY IF EXISTS staff_update_morning_assemblies ON public.morning_assemblies;
CREATE POLICY staff_update_morning_assemblies ON public.morning_assemblies
  FOR UPDATE TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

DROP POLICY IF EXISTS staff_delete_morning_assemblies ON public.morning_assemblies;
CREATE POLICY staff_delete_morning_assemblies ON public.morning_assemblies
  FOR DELETE TO authenticated
  USING (public.is_staff());

REVOKE ALL ON TABLE public.morning_assemblies FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.morning_assemblies TO authenticated;
