#!/usr/bin/env python3
"""Re-seed official HKDSE ICT MC papers into Supabase (schema must already exist).

Source files are NOT in this public repo. Point ICT_QUIZ_SOURCE at a local
checkout of the private quiz folder (index + js/data.js + images/ + papers/).

Requires the database service role (never commit it):

  export SUPABASE_URL=https://edausixxdclhonkrdzqg.supabase.co
  export SUPABASE_SERVICE_ROLE_KEY=...
  export ICT_QUIZ_SOURCE=/path/to/dse-ict-quiz
  python3 scripts/seed_ict_quiz.py

This script only upserts the official Sample Paper (20 MC) and Practice Paper
2012 (40 MC) already present in js/data.js. It does not invent answers.
"""
from __future__ import annotations

import base64
import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

SRC = Path(os.environ.get("ICT_QUIZ_SOURCE", "")).expanduser()
URL = (os.environ.get("SUPABASE_URL") or "").rstrip("/")
KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_SECRET_KEY") or ""


def die(msg: str, code: int = 1) -> None:
    print(msg, file=sys.stderr)
    sys.exit(code)


def rest(method: str, path: str, payload) -> None:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        URL + path,
        data=body,
        method=method,
        headers={
            "apikey": KEY,
            "Authorization": "Bearer " + KEY,
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates,return=minimal",
        },
    )
    try:
        with urllib.request.urlopen(req) as resp:
            resp.read()
    except urllib.error.HTTPError as e:
        die(f"{method} {path} failed: {e.code} {e.read().decode('utf-8', 'replace')}")


def main() -> None:
    if not URL or not KEY:
        die("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (do not commit the key).")
    if not SRC.is_dir():
        die("Set ICT_QUIZ_SOURCE to the private dse-ict-quiz folder.")
    data_path = SRC / "js" / "data.js"
    text = data_path.read_text(encoding="utf-8")
    match = re.search(r"window\.QUIZ_DATA\s*=\s*(\{.*\})\s*;?\s*$", text, re.S)
    if not match:
        die("Could not parse js/data.js")
    data = json.loads(match.group(1))

    papers = []
    questions = []
    for p in data["papers"]:
        papers.append({
            "id": p["id"],
            "year_label": p["yearLabel"],
            "year_sort": p["yearSort"],
            "title": p["title"],
            "short_title": p["shortTitle"],
            "nav_subject": p["navSubject"],
            "nav_paper": p["navPaper"],
            "paper": p.get("paper"),
            "section": p.get("section"),
            "official": bool(p.get("official")),
            "question_count": p["questionCount"],
            "pdf_path": p.get("pdf"),
            "pdf_label": p.get("pdfLabel"),
            "note": p.get("note"),
            "source": p.get("source"),
            "answer_source": p.get("answerSource"),
        })
        for q in p["questions"]:
            if q.get("answer") not in ("A", "B", "C", "D"):
                die(f"Unexpected answer for {p['id']} Q{q.get('no')}: {q.get('answer')}")
            questions.append({
                "paper_id": p["id"],
                "no": q["no"],
                "answer": q["answer"],
                "stem_html": q["stemHtml"],
                "options": q["options"],
                "layout": q.get("layout"),
                "headers": q.get("headers"),
                "source_note": q.get("sourceNote"),
            })

    rest("POST", "/rest/v1/ict_quiz_papers", papers)
    rest("POST", "/rest/v1/ict_quiz_questions", questions)
    print(f"Upserted {len(papers)} papers and {len(questions)} questions.")

    assets = [
        ("images/sp-p1/q12.png", "image/png"),
        ("images/sp-p1/q16.png", "image/png"),
        ("images/sp-p1/q17.png", "image/png"),
        ("images/pp-p1/q39.png", "image/png"),
        ("papers/HKDSE-ICT-樣本試卷-試卷一.pdf", "application/pdf"),
        ("papers/HKDSE-ICT-練習卷-試卷一.pdf", "application/pdf"),
    ]
    rows = []
    for rel, mime in assets:
        raw = (SRC / rel).read_bytes()
        rows.append({
            "path": rel,
            "mime_type": mime,
            "file_name": Path(rel).name,
            "content_base64": base64.b64encode(raw).decode("ascii"),
            "byte_size": len(raw),
        })
    # Upload one-by-one so large PDFs stay under typical payload limits.
    for row in rows:
        rest("POST", "/rest/v1/ict_quiz_assets", row)
        print(f"Upserted asset {row['path']} ({row['byte_size']} bytes).")


if __name__ == "__main__":
    main()
