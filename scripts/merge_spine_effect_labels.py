#!/usr/bin/env python3
"""Validate and merge the three Spine-effect labeling batches into one UTF-8 CSV."""
from __future__ import annotations

import csv
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
OUTPUT = DATA / "spine_effect_labels.csv"
FIELDS = [
    "编号", "图集文件", "发生位置", "运动大类", "具体形态", "主体轮廓", "元素主类",
    "质感细分", "阶段结构", "规模", "主色调", "辅色调", "视觉组件", "细节描述", "适用技能关键词",
]
BATCHES = [
    (1, 167, DATA / "spine_effect_labels_0001_0167.csv"),
    (168, 334, DATA / "spine_effect_labels_0168_0334.csv"),
    (335, 500, DATA / "spine_effect_labels_0335_0500.csv"),
]


def fail(message: str) -> None:
    print(f"ERROR: {message}", file=sys.stderr)
    raise SystemExit(1)


def read_batch(start: int, end: int, path: Path) -> list[dict[str, str]]:
    if not path.is_file():
        fail(f"missing batch: {path}")
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames != FIELDS:
            fail(f"{path.name}: header does not match template")
        rows = list(reader)

    expected_ids = [f"{value:04d}" for value in range(start, end + 1)]
    actual_ids = [row.get("编号", "") for row in rows]
    if actual_ids != expected_ids:
        fail(
            f"{path.name}: expected continuous IDs {expected_ids[0]}–{expected_ids[-1]} "
            f"({len(expected_ids)} rows), got {len(actual_ids)} rows"
        )

    for index, row in enumerate(rows, start=2):
        unexpected = set(row) - set(FIELDS)
        if unexpected:
            fail(f"{path.name}:{index}: unexpected columns: {unexpected}")
        missing = [field for field in FIELDS if row.get(field) is None]
        if missing:
            fail(f"{path.name}:{index}: missing fields: {missing}")
        blank = [field for field in FIELDS if not row[field].strip()]
        if blank:
            fail(f"{path.name}:{index}: blank fields: {', '.join(blank)}")
    return rows


def main() -> None:
    all_rows: list[dict[str, str]] = []
    for start, end, path in BATCHES:
        rows = read_batch(start, end, path)
        all_rows.extend(rows)
        print(f"OK {path.name}: {len(rows)} rows ({start:04d}–{end:04d})")

    with OUTPUT.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(all_rows)
    print(f"WROTE {OUTPUT.relative_to(ROOT)}: {len(all_rows)} rows")


if __name__ == "__main__":
    main()
