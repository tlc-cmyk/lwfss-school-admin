-- Seed 2026–2027 中六級補課時間表
-- Period: 2026-09-04 … 2027-02-02
-- Cycle: Day1–4=X1, Day5=ENG, Day6/7/9=X2, Day8=MATH, Day10=CHI

INSERT INTO public.s6_buk_meta (id, start_date, end_date, notes) VALUES
  (1, '2026-09-04', '2027-02-02', '2026-2027 中六級補課；一般 15:45–16:45；五 CHI/ENG 15:15–16:45')
ON CONFLICT (id) DO UPDATE SET
  start_date = EXCLUDED.start_date,
  end_date = EXCLUDED.end_date,
  notes = EXCLUDED.notes;

DELETE FROM public.s6_buk_assignments;

INSERT INTO public.s6_buk_assignments (teacher_code, subject, room, group_label, slot_kind) VALUES
  -- CHI (Day 10)
  ('LNA',  'CHI', '505', 'G1',    'chi'),
  ('CYK',  'CHI', '306', 'G2',    'chi'),
  ('LPL',  'CHI', '506', 'G3/6B', 'chi'),
  ('LKH',  'CHI', '605', 'G4/6C', 'chi'),
  ('LYF',  'CHI', '606', 'G5/6D', 'chi'),
  -- ENG (Day 5)
  ('HTY',  'ENG', '505', 'G1',    'eng'),
  ('WWKF', 'ENG', '306', 'G2',    'eng'),
  ('WSF',  'ENG', '506', 'G3/6B', 'eng'),
  ('CMWE', 'ENG', '605', 'G4/6C', 'eng'),
  ('YSHC', 'ENG', '606', 'G5/6D', 'eng'),
  -- MATH (Day 8)
  ('LTC',  'MATH', '601', 'G1',    'math'),
  ('KWY',  'MATH', '602', 'G2',    'math'),
  ('TLC',  'MATH', '603', 'G3/6B', 'math'),
  ('LTT',  'MATH', '604', 'G4/6C', 'math'),
  ('WKYT', 'MATH', '605', 'G5/6D', 'math'),
  -- X1 electives (Days 1–4)
  ('LTY',  'BAFS',    '602', '',       'x1'),
  ('LWY',  'CHEM',    '612', '',       'x1'),
  ('LCHJ', 'CH HIST', '603', '',       'x1'),
  ('CCC',  'GEOG',    '605', 'GEOG G1','x1'),
  ('SCL',  'GEOG',    '604', 'GEOG G2','x1'),
  ('FWK',  'ICT',     '421', '',       'x1'),
  -- X2 electives (Days 6, 7, 9)
  ('KMW',  'BIO(C)',  '601', '',       'x2'),
  ('TLP',  'BIO(E)',  '513', '',       'x2'),
  ('CKH',  'ECON',    '602', '',       'x2'),
  ('TCF',  'HIST',    '603', '',       'x2'),
  ('PKF',  'PHY',     '512', '',       'x2'),
  ('KNS',  'THS',     '604', '',       'x2'),
  ('TSC',  'VA',      '412', '',       'x2');
