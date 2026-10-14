-- 劉皇發中學 · 學校行政系統 SQLite schema
-- 免費、零註冊；之後可改接 Turso / Supabase 等免費雲端 SQLite/Postgres

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS teachers (
  code TEXT PRIMARY KEY,
  eng_name TEXT NOT NULL DEFAULT '',
  chi_name TEXT NOT NULL DEFAULT '',
  lesson_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS lessons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  teacher_code TEXT NOT NULL REFERENCES teachers(code) ON DELETE CASCADE,
  day INTEGER NOT NULL CHECK (day BETWEEN 1 AND 10),
  period INTEGER NOT NULL CHECK (period BETWEEN 1 AND 8),
  class_name TEXT NOT NULL DEFAULT '',
  class_short TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '',
  subject_short TEXT NOT NULL DEFAULT '',
  teachers_field TEXT NOT NULL DEFAULT '',
  room TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_lessons_teacher ON lessons(teacher_code);
CREATE INDEX IF NOT EXISTS idx_lessons_day_period ON lessons(day, period);

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
