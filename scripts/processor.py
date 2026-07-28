# scripts/processor.py
# PDF ingestion: Azure Layout Analysis -> local sentence-transformer embeddings (768-dim) -> Pinecone upsert -> JSON spatial map.
# Embedding engine: sentence-transformers/all-mpnet-base-v2 (100% offline, no API keys, no rate limits).

import os
import json
from pathlib import Path
from typing import List

from azure.ai.formrecognizer import DocumentAnalysisClient
from azure.core.credentials import AzureKeyCredential
from pinecone import Pinecone
from dotenv import load_dotenv
try:
    from pypdf import PdfReader
except ImportError:
    PdfReader = None

try:
    import torch
except ImportError:
    torch = None

try:
    from sentence_transformers import SentenceTransformer
except ImportError:
    SentenceTransformer = None

load_dotenv()

# ---------------------------------------------------------------------------
# Local Embedding Engine (singleton — model is loaded once at import time)
# ---------------------------------------------------------------------------

_LOCAL_MODEL = None
_LOCAL_MODEL_NAME = "all-mpnet-base-v2"  # 768-dim, state-of-the-art SBERT model
PINECONE_METADATA_LIMIT_BYTES = 40 * 1024
PINECONE_METADATA_TARGET_BYTES = 38 * 1024


def _get_model():
    """Lazy-load the sentence-transformer model (cached after first call)."""
    global _LOCAL_MODEL
    if _LOCAL_MODEL is None:
        if torch is None:
            raise RuntimeError(
                "PyTorch is not installed in this Python environment. "
                "Install torch in the backend environment to enable local all-mpnet-base-v2 embeddings."
            )
        if SentenceTransformer is None:
            raise RuntimeError(
                "sentence-transformers is not installed in this Python environment. "
                "Install sentence-transformers to enable local all-mpnet-base-v2 embeddings."
            )
        # Check if a GPU is available, otherwise default to CPU
        device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"--- Running Embeddings on: {device.upper()} ---")

        print(f"[EMBED] Loading local model '{_LOCAL_MODEL_NAME}' (first use — downloading if needed)...")
        # Load the model directly onto the selected device
        _LOCAL_MODEL = SentenceTransformer(_LOCAL_MODEL_NAME, device=device)
        print(f"[EMBED] Model loaded. Dimension: {_LOCAL_MODEL.get_sentence_embedding_dimension()}")
    return _LOCAL_MODEL


def get_local_embedding(text: str) -> List[float]:
    """
    Embed a single string using the local all-mpnet-base-v2 model.

    Returns a 768-dimensional float list, matching the existing Pinecone index.
    No API key, no network call, no rate limits.

    Parameters
    ----------
    text : str
        The text to embed. Long texts are automatically truncated by the model
        to its max token length (384 tokens for all-mpnet-base-v2).

    Returns
    -------
    List[float]
        768-dimensional embedding vector.
    """
    model = _get_model()
    vector = model.encode(text, normalize_embeddings=True)
    return vector.tolist()


def _metadata_size(metadata: dict) -> int:
    return len(json.dumps(metadata, ensure_ascii=True, separators=(",", ":")).encode("utf-8"))


def _truncate_metadata(metadata: dict, limit_bytes: int = PINECONE_METADATA_TARGET_BYTES) -> dict:
    """
    Keep Pinecone metadata safely below the 40KB hard limit while preserving
    required schema fields (parent_id, parent_text, child text) and coordinates for retrieval.
    """
    safe = dict(metadata)
    for text_limit, parent_limit, coord_limit in (
        (12000, 15000, 22000),
        (8000, 10000, 18000),
        (5000, 7000, 12000),
        (3000, 4000, 8000),
        (1800, 2500, 5000),
        (1000, 1500, 2500),
    ):
        safe["text"] = str(safe.get("text", ""))[:text_limit]
        if "parent_text" in safe:
            safe["parent_text"] = str(safe.get("parent_text", ""))[:parent_limit]
        safe["coordinates_json"] = str(safe.get("coordinates_json", ""))[:coord_limit]
        if _metadata_size(safe) < limit_bytes:
            return safe

    safe["text"] = str(safe.get("text", ""))[:800]
    if "parent_text" in safe:
        safe["parent_text"] = str(safe.get("parent_text", ""))[:1200]
    safe["coordinates_json"] = str(safe.get("coordinates_json", ""))[:1200]
    if _metadata_size(safe) >= PINECONE_METADATA_LIMIT_BYTES:
        safe["coordinates_json"] = "[]"
    return safe


def _fallback_spatial_data_from_pdf(pdf_path, file_name, warning: str) -> dict:
    spatial_data = {"file_name": file_name, "pages": [], "warnings": [warning]}
    try:
        if PdfReader is None:
            raise RuntimeError("pypdf is not installed in this Python environment.")
        reader = PdfReader(pdf_path)
        for idx, page in enumerate(reader.pages, start=1):
            text = page.extract_text() or ""
            lines = [
                {"content": line.strip(), "bounding_box": []}
                for line in text.splitlines()
                if line.strip()
            ]
            spatial_data["pages"].append({
                "page_number": idx,
                "width": 8.5,
                "height": 11.0,
                "unit": "inch",
                "lines": lines,
            })
    except Exception as exc:
        spatial_data["warnings"].append(f"Local PDF text fallback failed: {exc}")
    return spatial_data


# ---------------------------------------------------------------------------
# Main ingestion entry point
# ---------------------------------------------------------------------------

def process_new_pdf(
    pdf_path,
    file_name,
    pinecone_index=None,
    azure_client=None,
    user_id=None,
    # Legacy kwargs accepted but ignored (openai_client / embed_client removed)
    openai_client=None,
    embed_client=None,
):
    """
    Process a PDF:
      Azure layout analysis -> local sentence-transformer embedding -> Pinecone upsert -> JSON spatial map.

    No external embedding API required. Falls back to .env for Pinecone/Azure if clients not injected.
    """
    # --- Client Resolution ---
    if azure_client is None:
        try:
            azure_client = DocumentAnalysisClient(
                endpoint=os.getenv("AZURE_ENDPOINT"),
                credential=AzureKeyCredential(os.getenv("AZURE_KEY")),
            )
        except Exception as e:
            print(f"[INGEST] Azure client unavailable; local PDF fallback will be used: {e}")
            azure_client = None

    if pinecone_index is None:
        try:
            pc = Pinecone(api_key=os.getenv("PINECONE_API_KEY"))
            pinecone_index = pc.Index("leasesight-index")
        except Exception as e:
            print(f"[INGEST] Pinecone client unavailable; vector upsert will be skipped: {e}")
            pinecone_index = None

    # 1. Azure Layout Analysis
    try:
        with open(pdf_path, "rb") as f:
            poller = azure_client.begin_analyze_document("prebuilt-layout", f)
            result = poller.result(timeout=180)

        spatial_data = {"file_name": file_name, "pages": []}
        for page in result.pages:
            lines = []
            for line in page.lines:
                lines.append({
                    "content": line.content,
                    "bounding_box": [{"x": p.x, "y": p.y} for p in line.polygon],
                })

            spatial_data["pages"].append({
                "page_number": page.page_number,
                "width":       getattr(page, "width",  8.5),
                "height":      getattr(page, "height", 11.0),
                "unit":        getattr(page, "unit",   "inch"),
                "lines":       lines,
            })
    except Exception as e:
        print(f"[INGEST] Azure layout failed for {file_name}; using local text fallback: {e}")
        spatial_data = _fallback_spatial_data_from_pdf(pdf_path, file_name, str(e)[:500])

    # Save JSON spatial map before embeddings so the audit pipeline can use the
    # extracted text even if vector indexing fails.
    BASE_DIR  = Path(__file__).resolve().parents[1]
    json_path = BASE_DIR / "data" / "json_maps" / f"{file_name}.json"
    json_path.parent.mkdir(parents=True, exist_ok=True)
    with open(json_path, "w") as f:
        json.dump(spatial_data, f, indent=4)

    # 2. Local Embedding + Pinecone Upsert (Two-Tier Parent-Child Chunking: 250-char child chunks)
    CHILD_CHUNK_SIZE = 250

    for page in spatial_data["pages"]:
        page_text   = " ".join(line.get("content", "") for line in page.get("lines", []))
        page_number = page.get("page_number", 1)

        if not page_text.strip():
            continue

        parent_id = f"{file_name}_p{page_number}"
        coordinates = [
            {
                "text": line.get("content", "")[:240],
                "bounding_box": line.get("bounding_box", []),
            }
            for line in page.get("lines", [])
        ]

        # Slice full-page text into 250-character Child Chunks
        child_chunks = []
        if len(page_text) <= CHILD_CHUNK_SIZE:
            child_chunks.append((0, page_text))
        else:
            for c_idx, start_pos in enumerate(range(0, len(page_text), CHILD_CHUNK_SIZE)):
                c_text = page_text[start_pos : start_pos + CHILD_CHUNK_SIZE]
                if c_text.strip():
                    child_chunks.append((c_idx, c_text))

        vectors_to_upsert = []
        for c_idx, child_text in child_chunks:
            try:
                vector = get_local_embedding(child_text)
                vector_id = f"{file_name}_p{page_number}_c{c_idx}"
                metadata = _truncate_metadata({
                    "filename": file_name,
                    "file_name": file_name,
                    "page_number": int(page_number) if str(page_number).isdigit() else page_number,
                    "chunk_index": c_idx,
                    "parent_id": parent_id,
                    "text": child_text,
                    "parent_text": page_text,
                    "coordinates_json": json.dumps(coordinates, ensure_ascii=True, separators=(",", ":")),
                })
                vectors_to_upsert.append((vector_id, vector, metadata))
            except Exception as e:
                print(f"[INGEST] Skipping child vector for {file_name} p{page_number} c{c_idx}: {e}")

        if vectors_to_upsert:
            ns = f"user_{user_id}" if user_id else "academic_baseline"
            if pinecone_index is None:
                print(f"[INGEST] Skipping vector upsert for {file_name} page {page_number}: Pinecone unavailable")
            else:
                try:
                    pinecone_index.upsert(vectors=vectors_to_upsert, namespace=ns)
                except Exception as e:
                    print(f"[INGEST] Skipping vector upsert for {file_name} page {page_number}: {e}")

    return json_path
