#!/usr/bin/env python3
"""
scripts/prepare_sec_edgar_benchmark.py
--------------------------------------
Dataset separation & cache purging script for SEC EDGAR 100-PDF benchmark evaluation.

1. Locates SEC EDGAR contract PDFs in data/raw_pdfs/
2. Uses random.seed(100) to select 100 distinct SEC EDGAR contracts
3. Copies selected PDFs into data/sec_edgar_test_100/
4. Deletes all pre-computed caches in data/json_maps/, data/cache/, data/temp/
"""

import os
import sys
import glob
import shutil
import random
from pathlib import Path

# Force UTF-8 output on Windows standard output
if sys.stdout.encoding and sys.stdout.encoding.lower() not in ("utf-8", "utf8"):
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

PROJECT_ROOT = Path(__file__).resolve().parents[1]
RAW_PDFS_DIR = PROJECT_ROOT / "data" / "raw_pdfs"
BENCHMARK_DIR = PROJECT_ROOT / "data" / "sec_edgar_test_100"

CACHE_DIRS = [
    PROJECT_ROOT / "data" / "json_maps",
    PROJECT_ROOT / "data" / "cache",
    PROJECT_ROOT / "data" / "temp",
]

EXCLUDE_PATTERNS = [
    "audit_",
    "cuda dataset research paper",
    "copy of 200+",
    "internship_agreement",
]

def purge_caches():
    print("--- 1. Purging Caches & Legacy Indexes ---")
    for cdir in CACHE_DIRS:
        if cdir.exists():
            for item in cdir.iterdir():
                try:
                    if item.is_file() or item.is_symlink():
                        item.unlink()
                    elif item.is_dir():
                        shutil.rmtree(item)
                    print(f"  [PURGE] Removed: {item.relative_to(PROJECT_ROOT)}")
                except Exception as e:
                    print(f"  [WARNING] Failed to remove {item}: {e}")
        else:
            cdir.mkdir(parents=True, exist_ok=True)
            print(f"  [CREATE] Created clean directory: {cdir.relative_to(PROJECT_ROOT)}")
    print("[OK] Cache purge complete. 0 pre-computed data remaining.\n")

def prepare_dataset():
    print("--- 2. Dataset Separation (100 SEC EDGAR PDFs, seed=100) ---")
    if not RAW_PDFS_DIR.exists():
        raise FileNotFoundError(f"Source PDF directory not found: {RAW_PDFS_DIR}")

    all_pdfs = sorted(
        glob.glob(str(RAW_PDFS_DIR / "*.pdf")) + glob.glob(str(RAW_PDFS_DIR / "*.PDF"))
    )
    all_pdfs = list(dict.fromkeys(all_pdfs))  # deduplicate preserving order

    # Filter out non-contract files
    valid_pdfs = []
    for p in all_pdfs:
        fname = Path(p).name.lower()
        if any(exc in fname for exc in EXCLUDE_PATTERNS):
            continue
        valid_pdfs.append(p)

    print(f"Total SEC EDGAR contract PDFs discovered: {len(valid_pdfs)}")
    if len(valid_pdfs) < 100:
        raise ValueError(f"Need at least 100 valid PDFs, found {len(valid_pdfs)}")

    # Fixed random seed = 100 for secondary dataset isolation
    random.seed(100)
    selected_pdfs = random.sample(valid_pdfs, 100)
    selected_pdfs.sort()

    if BENCHMARK_DIR.exists():
        shutil.rmtree(BENCHMARK_DIR)
    BENCHMARK_DIR.mkdir(parents=True, exist_ok=True)

    print(f"Copying 100 SEC EDGAR benchmark PDFs into: {BENCHMARK_DIR.relative_to(PROJECT_ROOT)}")
    for src in selected_pdfs:
        dest = BENCHMARK_DIR / Path(src).name
        shutil.copy2(src, dest)

    print(f"[OK] Successfully isolated 100 SEC EDGAR contract PDFs in {BENCHMARK_DIR.name}\n")
    return selected_pdfs

if __name__ == "__main__":
    purge_caches()
    selected = prepare_dataset()
    print("=== SEC EDGAR Benchmark Preparation Complete ===")
