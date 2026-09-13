#!/usr/bin/env python3
"""Hard quality gate for reworked Spine-effect label CSV batches."""
from __future__ import annotations

import argparse
import csv
import sys
from collections import Counter
from pathlib import Path

EXPECTED_COLUMNS = 15
# CSV column indexes: id, png evidence, location, movement, concrete form,
# silhouette, element, material, stages, scale, main color, accent color,
# visible components, Chinese detail description, skill keywords.
ID = 0
PNG_EVIDENCE = 1
CONCRETE_FORM = 4
SILHOUETTE = 5
COMPONENTS = 12
DETAIL = 13
SOURCE_ROOT = Path(r"D:\迅雷下载\特效500个【spine】\特效500个【spine】")
NO_PNG = "\u672a\u627e\u5230PNG\u7d20\u6750"


def fail(messages: list[str]) -> None:
    print("REWORK QUALITY GATE FAILED:", file=sys.stderr)
    for message in messages:
        print(f"- {message}", file=sys.stderr)
    raise SystemExit(1)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("csv_path", type=Path)
    parser.add_argument("--start", type=int, required=True)
    parser.add_argument("--end", type=int, required=True)
    args = parser.parse_args()

    with args.csv_path.open("r", encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.reader(handle))
    if not rows:
        fail(["file is empty"])

    errors: list[str] = []
    header, data = rows[0], rows[1:]
    if len(header) != EXPECTED_COLUMNS:
        errors.append(f"header has {len(header)} columns, expected {EXPECTED_COLUMNS}")

    expected_ids = [f"{i:04d}" for i in range(args.start, args.end + 1)]
    actual_ids = [row[ID] if row else "" for row in data]
    if actual_ids != expected_ids:
        errors.append(
            f"IDs are not continuous {expected_ids[0]}-{expected_ids[-1]} "
            f"({len(expected_ids)} rows); got {len(actual_ids)} rows"
        )

    descriptions: list[str] = []
    visual_signatures: list[tuple[str, str, str]] = []
    for number, row in enumerate(data, start=2):
        identifier = row[ID] if row else f"line-{number}"
        if len(row) != EXPECTED_COLUMNS:
            errors.append(f"{identifier}: {len(row)} columns, expected {EXPECTED_COLUMNS}")
            continue
        if any(not value.strip() for value in row):
            errors.append(f"{identifier}: blank field")
        if "?" in "|".join(row):
            errors.append(f"{identifier}: contains question-mark corruption")
        if len(row[DETAIL].strip()) < 30:
            errors.append(f"{identifier}: detail description shorter than 30 characters")
        descriptions.append(row[DETAIL].strip())
        visual_signatures.append((row[CONCRETE_FORM].strip(), row[SILHOUETTE].strip(), row[COMPONENTS].strip()))

        source_dir = SOURCE_ROOT / identifier
        pngs = list(source_dir.rglob("*.png")) if source_dir.is_dir() else []
        evidence = row[PNG_EVIDENCE].strip()
        if evidence == NO_PNG:
            if pngs:
                errors.append(f"{identifier}: says no PNG but source has {len(pngs)} PNG files")
        else:
            known_names = {png.name.lower() for png in pngs}
            evidence_names = [Path(name.strip()).name.lower() for name in evidence.split("+")]
            if not pngs:
                errors.append(f"{identifier}: names PNG evidence but source directory has no PNG")
            for name in evidence_names:
                if name not in known_names:
                    errors.append(f"{identifier}: evidence PNG does not exist: {name}")

    duplicate_descriptions = [desc for desc, count in Counter(descriptions).items() if count > 1]
    if duplicate_descriptions:
        errors.append(f"duplicate detail descriptions: {len(duplicate_descriptions)}")
    duplicate_signatures = [sig for sig, count in Counter(visual_signatures).items() if count > 1]
    if duplicate_signatures:
        errors.append(f"duplicate concrete-form/silhouette/components signatures: {len(duplicate_signatures)}")

    if errors:
        fail(errors)
    print(
        f"REWORK QUALITY GATE PASSED: {args.csv_path.name}, "
        f"{len(data)} rows, IDs {expected_ids[0]}-{expected_ids[-1]}"
    )


if __name__ == "__main__":
    main()
