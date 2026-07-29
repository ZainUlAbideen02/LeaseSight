#!/usr/bin/env python3
"""
CUAD 100-PDF Benchmark Preparation & Cache Purge Script (prepare_cuad_benchmark.py)
Randomly samples 100 PDF files from data/raw_pdfs with fixed seed=42 into data/cuad_benchmark_100,
and purges all pre-computed JSON spatial maps and legacy caches.
"""

import os
import shutil
import random
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = PROJECT_ROOT / "data" / "raw_pdfs"
DEST_DIR = PROJECT_ROOT / "data" / "cuad_benchmark_100"
JSON_MAPS_DIR = PROJECT_ROOT / "data" / "json_maps"
CACHE_DIR = PROJECT_ROOT / "data" / "cache"

def prepare_cuad_benchmark(sample_size: int = 100, seed: int = 42):
    print("=" * 65)
    print(" STEP 1: CUAD 100-PDF BENCHMARK DATASET PREPARATION & CACHE PURGE")
    print("=" * 65)

    if not SOURCE_DIR.exists():
        raise FileNotFoundError(f"Source PDF directory not found at {SOURCE_DIR}")

    # 1. Purge legacy caches and JSON maps
    print("\n[PURGE] Clearing cached data and legacy indexes...")
    for dir_to_purge in [JSON_MAPS_DIR, CACHE_DIR]:
        if dir_to_purge.exists():
            shutil.rmtree(dir_to_purge)
            print(f"  [OK] Removed {dir_to_purge.relative_to(PROJECT_ROOT)}")
        dir_to_purge.mkdir(parents=True, exist_ok=True)

    # 2. Gather all source PDFs
    all_pdfs = sorted([f for f in SOURCE_DIR.glob("*.pdf") if f.is_file()])
    pdf_count = len(all_pdfs)
    print(f"\n[DATASET] Discovered {pdf_count} PDF contracts in {SOURCE_DIR.relative_to(PROJECT_ROOT)}")

    if pdf_count < sample_size:
        print(f"  [!] Warning: Found {pdf_count} PDFs, less than requested {sample_size}. Using all {pdf_count} PDFs.")
        selected_pdfs = all_pdfs
    else:
        random.seed(seed)
        selected_pdfs = random.sample(all_pdfs, sample_size)

    # 3. Create destination directory and copy files
    if DEST_DIR.exists():
        shutil.rmtree(DEST_DIR)
    DEST_DIR.mkdir(parents=True, exist_ok=True)

    print(f"\n[SAMPLING] Copying {len(selected_pdfs)} randomly selected PDFs to {DEST_DIR.relative_to(PROJECT_ROOT)} (seed={seed})...")
    copied = 0
    for pdf_path in selected_pdfs:
        dest_file = DEST_DIR / pdf_path.name
        shutil.copy2(pdf_path, dest_file)
        copied += 1

    print(f"  [OK] Successfully isolated {copied} benchmark PDF contracts in {DEST_DIR.relative_to(PROJECT_ROOT)}")
    print("\nCache purge & dataset isolation complete. Ready for un-cached evaluation run.\n")

if __name__ == "__main__":
    prepare_cuad_benchmark()
