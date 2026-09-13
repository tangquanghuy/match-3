#!/usr/bin/env python3
"""Audit labels that claim source PNG is missing against the actual Spine folders."""
from __future__ import annotations

import csv
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE_ROOT = Path(r"D:\迅雷下载\特效500个【spine】\特效500个【spine】")
LABEL_FILES = [
    ROOT / "data" / "spine_effect_labels_0001_0167.csv",
    ROOT / "data" / "spine_effect_labels_0168_0334.csv",
    ROOT / "data" / "spine_effect_labels_0335_0500.csv",
]


def main() -> None:
    violations: list[str] = []
    scanned = 0
    for label_path in LABEL_FILES:
        if not label_path.exists():
            continue
        with label_path.open("r", encoding="utf-8-sig", newline="") as handle:
            for row in csv.DictReader(handle):
                scanned += 1
                identifier = row["编号"]
                source_dir = SOURCE_ROOT / identifier
                actual_pngs = list(source_dir.rglob("*.png")) if source_dir.is_dir() else []
                claimed_missing = "未找到PNG素材" in row["图集文件"]
                if claimed_missing and actual_pngs:
                    violations.append(
                        f"{identifier}: label says no PNG but source has {len(actual_pngs)} PNG file(s), "
                        f"e.g. {actual_pngs[0].name}"
                    )
                if not claimed_missing and not actual_pngs:
                    violations.append(
                        f"{identifier}: label names a PNG source but source directory has no PNG files"
                    )
    print(f"Audited {scanned} label rows.")
    if violations:
        print("PNG source audit failed:", file=sys.stderr)
        print("\n".join(violations), file=sys.stderr)
        raise SystemExit(1)
    print("PNG source audit passed.")


if __name__ == "__main__":
    main()
