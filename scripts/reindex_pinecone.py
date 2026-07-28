# scripts/reindex_pinecone.py
# Re-index all JSON spatial maps into Pinecone using LOCAL sentence-transformer embeddings.
# Model: all-mpnet-base-v2 (768-dim, offline, zero API calls, no rate limits).
#
# The script is idempotent: running it twice is safe because vector IDs are
# deterministic (f"{file_name}_p{page_number}").
#
# Usage
# -----
#   python -m scripts.reindex_pinecone
#   python -m scripts.reindex_pinecone --dry-run
#
# Environment variables required:
#   PINECONE_API_KEY

import os
import json
import sys
from pathlib import Path
from typing import List, Dict, Any

from dotenv import load_dotenv

_ROOT = Path(__file__).resolve().parents[1]
load_dotenv(_ROOT / "api" / ".env", override=True)
load_dotenv(_ROOT / ".env", override=True)

from pinecone import Pinecone
from scripts.processor import get_local_embedding, _truncate_metadata

# ---------------------------------------------------------------------------
# CONFIG
# ---------------------------------------------------------------------------

INDEX_NAME   = "leasesight-index"   # Must be at dim=768
UPSERT_BATCH = 50                   # Vectors per Pinecone upsert call
JSON_MAP_DIR = _ROOT / "data" / "json_maps"
DEFAULT_NAMESPACE = os.getenv("REINDEX_NAMESPACE", "academic_baseline")

# ---------------------------------------------------------------------------
# HELPERS
# ---------------------------------------------------------------------------

CHILD_CHUNK_SIZE = 250

def _build_text_lookup() -> Dict[str, str]:
    """vector_id -> child_chunk_text for every 250-char child chunk in every JSON map."""
    lookup: Dict[str, str] = {}
    for json_file in sorted(JSON_MAP_DIR.glob("*.json")):
        try:
            with open(json_file, "r", encoding="utf-8") as f:
                data = json.load(f)
            file_name = data.get("file_name", json_file.stem)
            for page in data.get("pages", []):
                page_num  = page.get("page_number", "?")
                page_text = " ".join(
                    line.get("content", "") for line in page.get("lines", [])
                )
                if not page_text.strip():
                    continue

                if len(page_text) <= CHILD_CHUNK_SIZE:
                    lookup[f"{file_name}_p{page_num}_c0"] = page_text
                else:
                    for c_idx, start_pos in enumerate(range(0, len(page_text), CHILD_CHUNK_SIZE)):
                        c_text = page_text[start_pos : start_pos + CHILD_CHUNK_SIZE]
                        if c_text.strip():
                            lookup[f"{file_name}_p{page_num}_c{c_idx}"] = c_text
        except Exception as e:
            print(f"  [WARN] Could not build lookup for {json_file.name}: {e}")
    return lookup


def _build_metadata_lookup() -> Dict[str, Dict[str, Any]]:
    """vector_id -> Pinecone metadata dict with parent_id and parent_text pointers."""
    lookup: Dict[str, Dict[str, Any]] = {}
    for json_file in sorted(JSON_MAP_DIR.glob("*.json")):
        try:
            with open(json_file, "r", encoding="utf-8") as f:
                data = json.load(f)
            file_name = data.get("file_name", json_file.stem)
            for page in data.get("pages", []):
                page_num  = page.get("page_number", "?")
                page_text = " ".join(
                    line.get("content", "") for line in page.get("lines", [])
                )
                if not page_text.strip():
                    continue

                parent_id = f"{file_name}_p{page_num}"
                coordinates = [
                    {
                        "text": line.get("content", "")[:240],
                        "bounding_box": line.get("bounding_box", []),
                    }
                    for line in page.get("lines", [])
                ]

                child_chunks = []
                if len(page_text) <= CHILD_CHUNK_SIZE:
                    child_chunks.append((0, page_text))
                else:
                    for c_idx, start_pos in enumerate(range(0, len(page_text), CHILD_CHUNK_SIZE)):
                        c_text = page_text[start_pos : start_pos + CHILD_CHUNK_SIZE]
                        if c_text.strip():
                            child_chunks.append((c_idx, c_text))

                for c_idx, child_text in child_chunks:
                    vid = f"{file_name}_p{page_num}_c{c_idx}"
                    lookup[vid] = _truncate_metadata({
                        "filename": file_name,
                        "file_name": file_name,
                        "page_number": int(page_num) if str(page_num).isdigit() else page_num,
                        "chunk_index": c_idx,
                        "parent_id": parent_id,
                        "text": child_text,
                        "parent_text": page_text,
                        "coordinates_json": json.dumps(coordinates, ensure_ascii=True, separators=(",", ":")),
                    })
        except Exception as e:
            print(f"  [WARN] Could not build metadata for {json_file.name}: {e}")
    return lookup


def _chunks(lst: list, n: int):
    for i in range(0, len(lst), n):
        yield lst[i: i + n]


# ---------------------------------------------------------------------------
# MAIN
# ---------------------------------------------------------------------------

def reindex(dry_run: bool = False, namespace: str = DEFAULT_NAMESPACE):
    """
    Embed every page from local JSON maps using all-mpnet-base-v2 and
    upsert into the 768-dim Pinecone index.
    """
    print("=" * 60)
    print("  LeaseSight -- Pinecone Re-indexing (Local Embeddings)")
    print("  Model: sentence-transformers/all-mpnet-base-v2 (768-dim)")
    print(f"  Namespace: {namespace}")
    print("=" * 60)

    # --- Pinecone ---
    pc    = Pinecone(api_key=os.getenv("PINECONE_API_KEY"))
    index = pc.Index(INDEX_NAME)

    # --- Verify dimension ---
    stats = index.describe_index_stats()
    dim   = stats.get("dimension")
    if dim is not None and dim != 768:
        print(
            f"\n[ERROR] Index '{INDEX_NAME}' has dimension {dim}, expected 768.\n"
            "Run scripts/recreate_pinecone_index.py first to create a 768-dim index."
        )
        sys.exit(1)
    print(f"\nIndex '{INDEX_NAME}' confirmed at dimension {dim or 'unknown (new/empty)'}.")

    # --- Build source data ---
    print("\nScanning local JSON spatial maps...")
    text_lookup     = _build_text_lookup()
    metadata_lookup = _build_metadata_lookup()

    if not text_lookup:
        print(
            "[ERROR] No JSON maps found in data/json_maps/. "
            "Run the upload pipeline first to generate them."
        )
        sys.exit(1)

    all_ids     = list(text_lookup.keys())
    doc_count   = len(set(v.split("_p")[0] for v in all_ids))
    print(f"Found {len(all_ids)} page vectors to re-index across {doc_count} documents.")

    if dry_run:
        print("\n[DRY RUN] No changes will be made to Pinecone.")
        for vid in all_ids[:5]:
            print(f"  Would upsert: {vid!r}")
        if len(all_ids) > 5:
            print(f"  ... and {len(all_ids) - 5} more.")
        return

    # --- Warm up the local model (download on first run) ---
    print("\nWarming up local embedding model...")
    get_local_embedding("warmup")
    print("Model ready.\n")

    # --- Embed & batch upsert (no API = no rate limits = full CPU/GPU speed) ---
    print("Starting embedding + upsert...")
    success_count = 0
    fail_count    = 0
    upsert_buffer: List[tuple] = []

    def _flush():
        nonlocal success_count
        if not upsert_buffer:
            return
        try:
            index.upsert(vectors=upsert_buffer, namespace=namespace)
            success_count += len(upsert_buffer)
            print(f"  [Pinecone] Upserted batch of {len(upsert_buffer):>3} | total: {success_count}")
        except Exception as e:
            print(f"  [ERROR] Pinecone upsert failed: {e}")
        upsert_buffer.clear()

    for i, vid in enumerate(all_ids, start=1):
        page_text = text_lookup[vid]
        metadata  = metadata_lookup.get(vid, {})

        try:
            # Local CPU/GPU embedding — instant, zero quota cost
            vector = get_local_embedding(page_text)
            upsert_buffer.append((vid, vector, metadata))
        except Exception as e:
            fail_count += 1
            print(f"  [ERROR] Embedding failed for {vid}: {e}")
            continue

        if len(upsert_buffer) >= UPSERT_BATCH:
            _flush()

        if i % 500 == 0:
            print(f"  Progress: {i}/{len(all_ids)} embedded...")

    _flush()  # Flush remainder

    # --- Summary ---
    print("\n" + "=" * 60)
    print("  Re-indexing complete.")
    print(f"  [OK]   Upserted : {success_count} vectors")
    if fail_count:
        print(f"  [FAIL] Failed   : {fail_count} vectors (see errors above)")
    print("=" * 60)

    final_stats = index.describe_index_stats()
    total_vecs  = final_stats.get("total_vector_count", "?")
    print(f"\nPinecone index now contains {total_vecs} total vectors.")


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(
        description="Re-index Pinecone from JSON maps using local sentence-transformer embeddings."
    )
    parser.add_argument("--dry-run", action="store_true",
                        help="Print plan without writing to Pinecone.")
    parser.add_argument("--namespace", default=DEFAULT_NAMESPACE,
                        help=f"Pinecone namespace to write. Default: {DEFAULT_NAMESPACE}")
    args = parser.parse_args()
    reindex(dry_run=args.dry_run, namespace=args.namespace)
