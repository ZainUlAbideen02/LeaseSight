# app/core/rag_engine.py
# Multi-namespace hybrid retrieval engine for strict tenant isolation.
# Queries both "academic_baseline" and the dynamic "user_{user_id}" namespace.
# Blended Hybrid Scoring: S_hybrid = 0.7 * S_dense + 0.3 * S_BM25
# Parent Context Expansion: maps matching 250-char child chunks back to full parent_text.

import re
from typing import List, Dict, Any, Optional

try:
    from rank_bm25 import BM25Okapi
    _BM25_AVAILABLE = True
except ImportError:
    _BM25_AVAILABLE = False


def _tokenize(text: str) -> List[str]:
    """Simple alphanumeric lower-case tokenizer for BM25 ranking."""
    if not text:
        return []
    return re.findall(r"\w+", text.lower())


def retrieve_dual_namespace(
    pinecone_index,
    query_vector: List[float],
    top_k: int = 5,
    file_name: str = None,
    user_id: str = None,
    include_metadata: bool = True,
    exclude_file_name: bool = False,
    include_values: bool = False,
    query_text: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Queries Pinecone across both 'academic_baseline' and 'user_{user_id}' namespaces.
    Applies BM25Okapi keyword scoring if query_text is provided, blending dense cosine
    similarity and sparse BM25 scores:
        S_hybrid = 0.7 * S_dense + 0.3 * S_BM25
    Expands retrieved child chunks back to full parent context (parent_text).
    """
    matches = []
    
    # 1. Query 'academic_baseline' namespace
    try:
        filt = {}
        if file_name:
            key = "$ne" if exclude_file_name else "$eq"
            filt = {
                "$or": [
                    {"file_name": {key: file_name}},
                    {"filename": {key: file_name}}
                ]
            }
            
        res_baseline = pinecone_index.query(
            vector=query_vector,
            top_k=top_k * 2 if query_text else top_k,  # Fetch wider candidate pool for hybrid re-ranking
            filter=filt if filt else None,
            namespace="academic_baseline",
            include_metadata=include_metadata,
            include_values=include_values
        )
        if res_baseline.get("matches"):
            for m in res_baseline["matches"]:
                if "metadata" in m and m["metadata"]:
                    if "filename" in m["metadata"] and "file_name" not in m["metadata"]:
                        m["metadata"]["file_name"] = m["metadata"]["filename"]
                matches.append(m)
    except Exception as e:
        print(f"[RAG_ENGINE] Error querying academic_baseline namespace: {e}")

    # 2. Query 'user_{user_id}' namespace if user_id is provided
    namespaces_to_query = []
    if user_id:
        namespaces_to_query.append(f"user_{user_id}")
        if user_id == "default_user":
            namespaces_to_query.append("user_local")
        elif user_id == "local":
            namespaces_to_query.append("user_default_user")

    for user_ns in namespaces_to_query:
        try:
            filt = {}
            if file_name:
                key = "$ne" if exclude_file_name else "$eq"
                filt = {
                    "$or": [
                        {"file_name": {key: file_name}},
                        {"filename": {key: file_name}}
                    ]
                }
                
            res_user = pinecone_index.query(
                vector=query_vector,
                top_k=top_k * 2 if query_text else top_k,
                filter=filt if filt else None,
                namespace=user_ns,
                include_metadata=include_metadata,
                include_values=include_values
            )
            if res_user.get("matches"):
                for m in res_user["matches"]:
                    if "metadata" in m and m["metadata"]:
                        if "filename" in m["metadata"] and "file_name" not in m["metadata"]:
                            m["metadata"]["file_name"] = m["metadata"]["filename"]
                    matches.append(m)
        except Exception as e:
            print(f"[RAG_ENGINE] Error querying {user_ns} namespace: {e}")

    # 3. Securely deduplicate matches
    seen_ids = set()
    deduped_matches = []
    for m in matches:
        if m["id"] not in seen_ids:
            seen_ids.add(m["id"])
            deduped_matches.append(m)

    # 4. Hybrid BM25 Ranking: S_hybrid = 0.7 * S_dense + 0.3 * S_BM25
    if query_text and _BM25_AVAILABLE and deduped_matches:
        try:
            corpus = [
                _tokenize(
                    (m.get("metadata") or {}).get("text", "")
                    + " "
                    + (m.get("metadata") or {}).get("parent_text", "")
                )
                for m in deduped_matches
            ]
            q_tokens = _tokenize(query_text)

            if any(corpus) and q_tokens:
                bm25 = BM25Okapi(corpus)
                raw_bm25_scores = list(bm25.get_scores(q_tokens))
                min_bm = min(raw_bm25_scores) if raw_bm25_scores else 0.0
                max_bm = max(raw_bm25_scores) if raw_bm25_scores else 0.0
                bm_range = max_bm - min_bm

                for idx, m in enumerate(deduped_matches):
                    s_dense = float(m.get("score", 0.0))
                    if bm_range > 0:
                        s_bm25_norm = float(raw_bm25_scores[idx] - min_bm) / float(bm_range)
                    else:
                        s_bm25_norm = 1.0 if max_bm > 0 else 0.0
                    s_hybrid = (0.7 * s_dense) + (0.3 * s_bm25_norm)

                    m["dense_score"] = round(s_dense, 6)
                    m["bm25_score"] = round(s_bm25_norm, 6)
                    m["score"] = round(s_hybrid, 6)
        except Exception as e:
            print(f"[RAG_ENGINE] BM25 hybrid ranking skipped: {e}")

    # 5. Parent Context Expansion & Sorting
    deduped_matches.sort(key=lambda x: x.get("score", 0.0), reverse=True)

    for m in deduped_matches:
        meta = m.get("metadata")
        if meta and isinstance(meta, dict):
            # Expand child text back to parent_text for context assembly if present
            if meta.get("parent_text") and not meta.get("context_text"):
                meta["context_text"] = meta["parent_text"]

    return {"matches": deduped_matches[:top_k]}
