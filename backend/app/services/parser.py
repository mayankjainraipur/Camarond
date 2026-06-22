"""Parse uploaded XLSX/CSV question banks into normalized question dicts.

Expected columns (case-insensitive, order-independent):
    type             mcq | text | number | true_false  (aliases accepted)
    content          the question text                 (required)
    correct_answer   the correct answer                (required)
    options          for mcq only, pipe-separated: "Tokyo|Seoul|Beijing|Osaka"
    category         topic/domain        (optional, defaults to General Knowledge)
    difficulty       integer 1-10        (optional, defaults to 1)
"""
from __future__ import annotations

import io

import pandas as pd

REQUIRED_COLUMNS = {"type", "content", "correct_answer"}

_TYPE_ALIASES = {
    "mcq": "mcq",
    "multiple_choice": "mcq",
    "multiple choice": "mcq",
    "mc": "mcq",
    "text": "text",
    "short_answer": "text",
    "number": "number",
    "numeric": "number",
    "true_false": "true_false",
    "true/false": "true_false",
    "truefalse": "true_false",
    "tf": "true_false",
    "boolean": "true_false",
}


def _read_dataframe(filename: str, raw: bytes) -> pd.DataFrame:
    name = filename.lower()
    if name.endswith(".csv"):
        return pd.read_csv(io.BytesIO(raw), dtype=str, keep_default_na=False)
    if name.endswith((".xlsx", ".xls")):
        return pd.read_excel(io.BytesIO(raw), dtype=str, engine="openpyxl").fillna("")
    raise ValueError("Unsupported file type. Upload a .csv or .xlsx file.")


def parse_questions(filename: str, raw: bytes) -> tuple[list[dict], list[str]]:
    """Returns (questions, errors). Bad rows are skipped and reported, so a
    single malformed row never blocks an otherwise-valid upload."""
    df = _read_dataframe(filename, raw)
    df.columns = [str(c).strip().lower() for c in df.columns]

    missing = REQUIRED_COLUMNS - set(df.columns)
    if missing:
        raise ValueError(
            f"Missing required column(s): {', '.join(sorted(missing))}. "
            f"Found: {', '.join(df.columns)}"
        )

    questions: list[dict] = []
    errors: list[str] = []

    for row_num, (_, row) in enumerate(df.iterrows(), start=2):
        line = row_num  # 1-based spreadsheet row (header = 1, first data row = 2)
        raw_type = str(row.get("type", "")).strip().lower()
        qtype = _TYPE_ALIASES.get(raw_type)
        if not qtype:
            errors.append(f"Row {line}: unknown type '{raw_type}', skipped.")
            continue

        content = str(row.get("content", "")).strip()
        correct = str(row.get("correct_answer", "")).strip()
        if not content or not correct:
            errors.append(f"Row {line}: missing content or correct_answer, skipped.")
            continue

        options = None
        if qtype == "mcq":
            raw_opts = str(row.get("options", "")).strip()
            options = [o.strip() for o in raw_opts.split("|") if o.strip()]
            if len(options) < 2:
                errors.append(f"Row {line}: mcq needs >=2 pipe-separated options, skipped.")
                continue
            if correct not in options:
                errors.append(
                    f"Row {line}: correct_answer '{correct}' is not one of the options, skipped."
                )
                continue

        category = str(row.get("category", "")).strip() or "General Knowledge"

        difficulty = 1
        raw_diff = str(row.get("difficulty", "")).strip()
        if raw_diff:
            try:
                difficulty = max(1, min(10, int(float(raw_diff))))
            except ValueError:
                errors.append(f"Row {line}: invalid difficulty '{raw_diff}', defaulted to 1.")

        questions.append(
            {
                "type": qtype,
                "content": content,
                "correct_answer": correct,
                "options": options,
                "category": category,
                "difficulty": difficulty,
            }
        )

    return questions, errors
