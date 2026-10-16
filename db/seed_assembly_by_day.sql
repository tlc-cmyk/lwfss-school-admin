-- Seed morning assembly schedule (10-day cycle)
INSERT INTO public.assembly_by_day (day, theme, is_flag, is_3x) VALUES
  (1, '校長分享', false, false),
  (2, '國旗下的講話 / 輔導組', true, false),
  (3, '頒獎', false, true),
  (4, '學風組', false, false),
  (5, '英語分享環節', false, false),
  (6, '教師分享', false, false),
  (7, '國旗下的講話 / 訓導組', true, false),
  (8, '頒獎', false, true),
  (9, '升輔組 / 閱讀分享', false, false),
  (10, '英語分享環節', false, false)
ON CONFLICT (day) DO UPDATE SET
  theme = EXCLUDED.theme,
  is_flag = EXCLUDED.is_flag,
  is_3x = EXCLUDED.is_3x;
