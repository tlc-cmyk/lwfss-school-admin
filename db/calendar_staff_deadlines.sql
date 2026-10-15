
-- calendar_events: general school calendar remarks (readable by all school accounts)
CREATE TABLE IF NOT EXISTS public.calendar_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_date date NULL,
  event_date_raw text NOT NULL DEFAULT '',
  title text NOT NULL DEFAULT '',
  event_type text NOT NULL DEFAULT 'remark',
  academic_year text NOT NULL DEFAULT '2026-2027',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_calendar_events_date ON public.calendar_events (event_date);
CREATE INDEX IF NOT EXISTS idx_calendar_events_year ON public.calendar_events (academic_year);

ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS school_read_calendar_events ON public.calendar_events;
CREATE POLICY school_read_calendar_events ON public.calendar_events
  FOR SELECT TO authenticated
  USING (COALESCE((auth.jwt() ->> 'email'::text), ''::text) ~~* '%@g.lwfss.edu.hk'::text);

REVOKE ALL ON TABLE public.calendar_events FROM anon;
GRANT SELECT ON TABLE public.calendar_events TO authenticated;

-- cycle_days: date → Day 1–10 mapping for timetable
CREATE TABLE IF NOT EXISTS public.cycle_days (
  day_date date PRIMARY KEY,
  cycle_day integer NOT NULL CHECK (cycle_day >= 1 AND cycle_day <= 10),
  note text NOT NULL DEFAULT '',
  academic_year text NOT NULL DEFAULT '2026-2027',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cycle_days_cycle ON public.cycle_days (cycle_day);

ALTER TABLE public.cycle_days ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS school_read_cycle_days ON public.cycle_days;
CREATE POLICY school_read_cycle_days ON public.cycle_days
  FOR SELECT TO authenticated
  USING (COALESCE((auth.jwt() ->> 'email'::text), ''::text) ~~* '%@g.lwfss.edu.hk'::text);

REVOKE ALL ON TABLE public.cycle_days FROM anon;
GRANT SELECT ON TABLE public.cycle_days TO authenticated;

-- staff_deadlines: 文件遞交清單及校務會議 (STAFF ONLY)
CREATE TABLE IF NOT EXISTS public.staff_deadlines (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  due_date date NULL,
  due_date_raw text NOT NULL DEFAULT '',
  title text NOT NULL DEFAULT '',
  academic_year text NOT NULL DEFAULT '2026-2027',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_deadlines_due ON public.staff_deadlines (due_date);
CREATE INDEX IF NOT EXISTS idx_staff_deadlines_year_sort ON public.staff_deadlines (academic_year, sort_order);

ALTER TABLE public.staff_deadlines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staff_read_staff_deadlines ON public.staff_deadlines;
CREATE POLICY staff_read_staff_deadlines ON public.staff_deadlines
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.email = lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text))
    )
  );

REVOKE ALL ON TABLE public.staff_deadlines FROM anon;
GRANT SELECT ON TABLE public.staff_deadlines TO authenticated;
