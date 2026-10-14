#!/usr/bin/env python3
"""
從 Google Sheet 匯出（Drive JSON 包裝或純 CSV）匯入 SQLite，
並產生 docs/data/timetable.json 與 timetable.js 供 GitHub Pages 靜態站使用。

用法：
  python3 scripts/import_timetable.py [export.json|csv]
  預設讀取環境變數 TIMETABLE_SRC，否則嘗試常見路徑。
"""
from __future__ import annotations

import csv
import io
import json
import os
import re
import sqlite3
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FILE_ID = "14UPpVtyrCCzM_uExw7hsfKxKk-5F_kzZMy00j1RYFoM"
SCHEMA = ROOT / "db" / "schema.sql"
DB_PATH = ROOT / "db" / "school.db"
DATA_DIR = ROOT / "docs" / "data"
HK = timezone(timedelta(hours=8))


def simplify_subject(su: str) -> str:
    if not su:
        return ""
    s = su.strip()
    if "AI" in s.upper() or "課程" in s:
        return s
    if s.upper().startswith("ICT-") or re.match(
        r"^ICT(?:-ICT\d+)?(?:-[A-Z0-9_]+)*$", s, re.I
    ):
        return "ICT"
    if len(s) > 20 and "-" in s:
        parts = s.split("-")
        known = {
            "ICT", "MATH", "CHI", "ENG", "SCI", "PHY", "CHEM", "BIO",
            "HIST", "GEOG", "ECON", "BAFS", "VA", "MUS", "PE", "LS", "CSD", "STEM",
        }
        if parts[0].upper() in known:
            return parts[0]
    return s


def simplify_class(cl: str) -> str:
    if not cl:
        return ""
    parts = [p.strip() for p in cl.split(",") if p.strip()]
    if len(parts) <= 1:
        return cl.strip()
    by_form: dict[str, list[str]] = {}
    for p in parts:
        m = re.match(r"^(\d+)([A-Z]+)$", p, re.I)
        if not m:
            return cl.strip()
        form, letter = m.group(1), m.group(2).upper()
        by_form.setdefault(form, []).append(letter)
    bits = []
    for form in sorted(by_form.keys(), key=lambda x: int(x)):
        letters = sorted(by_form[form])
        expected = [chr(c) for c in range(ord(letters[0]), ord(letters[-1]) + 1)]
        if len(letters) >= 3 and letters == expected:
            bits.append(f"{form}{letters[0]}-{letters[-1]}")
        elif len(letters) == 2:
            bits.append(f"{form}{letters[0]},{form}{letters[1]}")
        else:
            bits.append(",".join(f"{form}{L}" for L in letters))
    return ",".join(bits)


def load_csv_text(path: Path) -> tuple[str, dict]:
    raw = path.read_text(encoding="utf-8")
    meta = {"sourceName": path.name, "sourceFileId": FILE_ID}
    if raw.lstrip().startswith("{"):
        try:
            wrapper = json.loads(raw)
            if isinstance(wrapper, dict) and "content" in wrapper:
                content = wrapper["content"]
                meta["sourceName"] = wrapper.get("name", path.name)
                meta["sourceFileId"] = wrapper.get("id", FILE_ID)
                if content.startswith("##"):
                    content = content.split("\n", 1)[1]
                return content, meta
        except json.JSONDecodeError:
            pass
    content = raw
    if content.startswith("##"):
        content = content.split("\n", 1)[1]
    return content, meta


def parse_teachers(content: str) -> list[dict]:
    reader = csv.DictReader(io.StringIO(content))
    rows = list(reader)
    teachers = []
    for r in rows:
        short = (r.get("ShortName") or "").strip()
        if not short:
            continue
        schedule: dict[str, dict] = {}
        lessons: list[dict] = []
        lesson_count = 0
        for d in range(1, 11):
            maxp = 8 if d in (5, 10) else 7
            day: dict[str, dict] = {}
            for p in range(1, maxp + 1):
                cl = (r.get(f"D{d}P{p}Cl") or "").strip()
                su = (r.get(f"D{d}P{p}Su") or "").strip()
                te = (r.get(f"D{d}P{p}Te") or "").strip()
                rm = (r.get(f"D{d}P{p}Rm") or "").strip()
                if cl or su or rm:
                    cell = {
                        "class": cl,
                        "classShort": simplify_class(cl),
                        "subject": su,
                        "subjectShort": simplify_subject(su),
                        "teacher": te,
                        "room": rm,
                    }
                    day[str(p)] = cell
                    lessons.append(
                        {
                            "day": d,
                            "period": p,
                            "class_name": cl,
                            "class_short": cell["classShort"],
                            "subject": su,
                            "subject_short": cell["subjectShort"],
                            "teachers_field": te,
                            "room": rm,
                        }
                    )
                    lesson_count += 1
            schedule[str(d)] = day
        teachers.append(
            {
                "code": short,
                "eng": (r.get("EngName") or "").strip(),
                "chi": (r.get("ChiName") or "").strip(),
                "lessonCount": lesson_count,
                "schedule": schedule,
                "_lessons": lessons,
            }
        )
    teachers.sort(key=lambda t: t["code"].upper())
    return teachers


def write_sqlite(teachers: list[dict], src_meta: dict) -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    if DB_PATH.exists():
        DB_PATH.unlink()
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.executescript(SCHEMA.read_text(encoding="utf-8"))
        now = datetime.now(HK).strftime("%Y-%m-%d %H:%M:%S HKT")
        meta_rows = [
            ("school", "世界龍岡學校劉皇發中學"),
            ("school_short", "劉皇發中學"),
            ("source_file_id", src_meta.get("sourceFileId", FILE_ID)),
            ("source_name", src_meta.get("sourceName", "timetablegrok")),
            ("source_tab", "MailMergeDB"),
            ("generated_at", now),
            ("teacher_count", str(len(teachers))),
            ("days", "10"),
            ("periods_normal", "7"),
            ("periods_extra_days", "5,10"),
        ]
        conn.executemany(
            "INSERT INTO meta(key, value) VALUES (?, ?)", meta_rows
        )
        for t in teachers:
            conn.execute(
                "INSERT INTO teachers(code, eng_name, chi_name, lesson_count) "
                "VALUES (?, ?, ?, ?)",
                (t["code"], t["eng"], t["chi"], t["lessonCount"]),
            )
            for les in t["_lessons"]:
                conn.execute(
                    "INSERT INTO lessons("
                    "teacher_code, day, period, class_name, class_short, "
                    "subject, subject_short, teachers_field, room"
                    ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (
                        t["code"],
                        les["day"],
                        les["period"],
                        les["class_name"],
                        les["class_short"],
                        les["subject"],
                        les["subject_short"],
                        les["teachers_field"],
                        les["room"],
                    ),
                )
        conn.commit()
    finally:
        conn.close()


def write_json(teachers: list[dict], src_meta: dict) -> dict:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    now = datetime.now(HK).strftime("%Y-%m-%d %H:%M:%S HKT")
    payload = {
        "meta": {
            "school": "世界龍岡學校劉皇發中學",
            "schoolShort": "劉皇發中學",
            "sourceFileId": src_meta.get("sourceFileId", FILE_ID),
            "sourceName": src_meta.get("sourceName", "timetablegrok"),
            "sourceTab": "MailMergeDB",
            "teacherCount": len(teachers),
            "days": 10,
            "periodsNormal": 7,
            "periodsExtraDays": [5, 10],
            "generatedAt": now,
            "generatedFrom": "MailMergeDB CSV export",
        },
        "teachers": [
            {
                "code": t["code"],
                "eng": t["eng"],
                "chi": t["chi"],
                "lessonCount": t["lessonCount"],
                "schedule": t["schedule"],
            }
            for t in teachers
        ],
    }
    json_path = DATA_DIR / "timetable.json"
    js_path = DATA_DIR / "timetable.js"
    json_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    js_path.write_text(
        "// Auto-generated — do not edit by hand.\n"
        "// Regenerate: python3 scripts/import_timetable.py <export>\n"
        "window.TIMETABLE_DATA = "
        + json.dumps(payload, ensure_ascii=False)
        + ";\n",
        encoding="utf-8",
    )
    return payload


def default_src() -> Path | None:
    env = os.environ.get("TIMETABLE_SRC")
    if env and Path(env).exists():
        return Path(env)
    candidates = [
        Path("/workspace/agent-tools/7bddd18d-1bf6-4e80-847d-0c76c5848fa3.txt"),
        ROOT / "data" / "timetablegrok.json",
        ROOT / "exports" / "timetablegrok.json",
    ]
    for c in candidates:
        if c.exists():
            return c
    return None


def main() -> int:
    src_arg = sys.argv[1] if len(sys.argv) > 1 else None
    path = Path(src_arg) if src_arg else default_src()
    if not path:
        print(
            "用法: python3 scripts/import_timetable.py <export.json|csv>\n"
            "或設定 TIMETABLE_SRC。\n"
            f"Sheet fileId: {FILE_ID}",
            file=sys.stderr,
        )
        return 1
    if not path.exists():
        print(f"找不到檔案: {path}", file=sys.stderr)
        return 1

    content, src_meta = load_csv_text(path)
    teachers = parse_teachers(content)
    write_sqlite(teachers, src_meta)
    payload = write_json(teachers, src_meta)

    tlc = next((t for t in teachers if t["code"].upper() == "TLC"), None)
    print(
        f"OK: {payload['meta']['teacherCount']} teachers → "
        f"{DB_PATH.relative_to(ROOT)} + docs/data/timetable.{{json,js}}"
    )
    if tlc:
        print(f"TLC: {tlc['chi']} / {tlc['eng']} — {tlc['lessonCount']} lessons")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
