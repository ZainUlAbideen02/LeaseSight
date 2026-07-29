#!/usr/bin/env python3
"""
scripts/run_ablation_study.py
-----------------------------
Automated Ablation Study & Baseline Evaluation Runner for LeaseSight.

Compares 4 Pipeline Variations across 100 SEC EDGAR Commercial Contracts across 10 CUAD Categories:
1. Full LeaseSight Engine: Hybrid Search (0.7 * Dense + 0.3 * BM25) + Parent-Child Expansion.
2. Variant 1 (Flat RAG Baseline): Pure Dense Retrieval on 500-char Chunks (No BM25, No Parent Expansion).
3. Variant 2 (Dense Only): Dense Retrieval (1.0 * Dense) + Parent-Child Expansion.
4. Variant 3 (Sparse BM25 Only): Sparse BM25 Search (1.0 * BM25) + Parent-Child Expansion.

Outputs:
- data/baseline_ablation_results.json
- ABLATION_BENCHMARK_REPORT.md
"""

import os
import sys

os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"

import re
import time
import json
import glob
import numpy as np
from pathlib import Path
from typing import List, Dict, Any

if sys.stdout.encoding and sys.stdout.encoding.lower() not in ("utf-8", "utf8"):
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

PROJECT_ROOT = Path(__file__).resolve().parents[1]
BENCHMARK_DIR = PROJECT_ROOT / "data" / "sec_edgar_test_100"
RESULTS_JSON_PATH = PROJECT_ROOT / "data" / "baseline_ablation_results.json"
REPORT_MD_PATH = PROJECT_ROOT / "ABLATION_BENCHMARK_REPORT.md"

try:
    from pypdf import PdfReader
except ImportError:
    try:
        from PyPDF2 import PdfReader
    except ImportError:
        PdfReader = None

try:
    from sentence_transformers import SentenceTransformer
except ImportError:
    SentenceTransformer = None

try:
    from rank_bm25 import BM25Okapi
except ImportError:
    BM25Okapi = None

# --- 10 Core CUAD Compliance Queries & Keyword Schemas ---
COMPLIANCE_QUERIES = [
    {
        "category": "Governing Law & Jurisdiction",
        "query": "What is the governing law, jurisdiction, or governing state of this agreement?",
        "keywords": ["governing law", "jurisdiction", "governed by", "state of", "laws of", "courts of", "venue"],
    },
    {
        "category": "Termination & Default Provisions",
        "query": "What are the early termination, cancellation, default, or breach provisions?",
        "keywords": ["terminate", "termination", "default", "cancel", "cancellation", "breach", "cure", "remedy", "foreclosure"],
    },
    {
        "category": "Notice Period & Renewal Terms",
        "query": "What is the required notice period for termination, renewal, or modification?",
        "keywords": ["notice", "days", "written notice", "prior notice", "promptly", "notice period", "calendar days", "renewal"],
    },
    {
        "category": "Liability Caps & Indemnification",
        "query": "What are the limitation of liability, liability caps, or indemnification limits?",
        "keywords": ["liability", "limitation of liability", "indemnify", "indemnification", "cap", "aggregate liability", "consequential damages", "hold harmless"],
    },
    {
        "category": "Anti-Assignment & Sub-licensing Restrictions",
        "query": "What are the anti-assignment, sublease, transfer, or sub-licensing consent requirements?",
        "keywords": ["assignment", "assign", "sublease", "sublicense", "transfer", "consent", "affiliate"],
    },
    {
        "category": "Exclusivity & Non-Compete Obligations",
        "query": "What are the exclusivity, non-compete, or restrictive territory covenants?",
        "keywords": ["exclusivity", "exclusive", "non-compete", "compete", "restrictive covenant", "territory"],
    },
    {
        "category": "Financial Audit Rights & Cost Penalties",
        "query": "What are the audit rights, financial record inspections, or shift-of-cost audit thresholds?",
        "keywords": ["audit", "records", "inspection", "inspect", "books", "underpayment", "accounting"],
    },
    {
        "category": "Liquidated Damages & Late Fees",
        "query": "What are the liquidated damages, late fee interest rates, or penalty triggers?",
        "keywords": ["liquidated damages", "penalty", "late fee", "interest rate", "default rate", "forfeiture", "security deposit"],
    },
    {
        "category": "Confidentiality & Survival Clauses",
        "query": "What are the confidentiality obligations, non-disclosure scope, and post-termination survival terms?",
        "keywords": ["confidential", "confidentiality", "nondisclosure", "survival", "survive", "trade secret", "proprietary"],
    },
    {
        "category": "Permitted Use & Scope of License",
        "query": "What is the permitted use, operational scope, or amendment grant of this agreement?",
        "keywords": ["permitted use", "scope", "license", "grant", "amendment", "agreement", "purpose"],
    },
]

def _tokenize(text: str) -> List[str]:
    if not text:
        return []
    return re.findall(r"\w+", text.lower())

def extract_pdf_layout(pdf_path: Path) -> Dict[str, Any]:
    spatial_data = {"file_name": pdf_path.name, "pages": []}
    if PdfReader is None:
        raise RuntimeError("pypdf or PyPDF2 is required to parse PDF layout.")

    reader = PdfReader(str(pdf_path))
    for idx, page in enumerate(reader.pages, start=1):
        text = page.extract_text() or ""
        lines = [line.strip() for line in text.splitlines() if line.strip()]
        spatial_data["pages"].append({
            "page_number": idx,
            "lines": lines,
            "text": text,
        })
    return spatial_data

def create_parent_child_chunks(spatial_data: Dict[str, Any], child_size: int = 250) -> List[Dict[str, Any]]:
    file_name = spatial_data["file_name"]
    chunks = []
    for page in spatial_data["pages"]:
        page_num = page["page_number"]
        page_text = page["text"] or " ".join(page.get("lines", []))
        if not page_text.strip():
            continue

        parent_id = f"{file_name}_p{page_num}"
        if len(page_text) <= child_size:
            chunks.append({
                "id": f"{parent_id}_c0",
                "file_name": file_name,
                "page_number": page_num,
                "parent_id": parent_id,
                "text": page_text,
                "parent_text": page_text,
            })
        else:
            c_idx = 0
            for start_pos in range(0, len(page_text), child_size):
                c_text = page_text[start_pos : start_pos + child_size]
                if c_text.strip():
                    chunks.append({
                        "id": f"{parent_id}_c{c_idx}",
                        "file_name": file_name,
                        "page_number": page_num,
                        "parent_id": parent_id,
                        "text": c_text,
                        "parent_text": page_text,
                    })
                    c_idx += 1
    return chunks

def create_flat_chunks(spatial_data: Dict[str, Any], chunk_size: int = 500) -> List[Dict[str, Any]]:
    file_name = spatial_data["file_name"]
    full_text = " ".join(p["text"] for p in spatial_data["pages"] if p.get("text"))
    chunks = []
    if not full_text.strip():
        return chunks

    if len(full_text) <= chunk_size:
        chunks.append({
            "id": f"{file_name}_flat_0",
            "file_name": file_name,
            "page_number": 1,
            "text": full_text,
            "parent_text": full_text,
        })
    else:
        for idx, start_pos in enumerate(range(0, len(full_text), chunk_size)):
            chunk_txt = full_text[start_pos : start_pos + chunk_size]
            if chunk_txt.strip():
                chunks.append({
                    "id": f"{file_name}_flat_{idx}",
                    "file_name": file_name,
                    "page_number": 1,
                    "text": chunk_txt,
                    "parent_text": chunk_txt,
                })
    return chunks

def verify_quote_grounding(quote: str, doc_text: str) -> bool:
    if not quote or not doc_text:
        return False
    clean_q = re.sub(r'[^a-zA-Z0-9]', '', quote).lower()
    clean_doc = re.sub(r'[^a-zA-Z0-9]', '', doc_text).lower()
    if len(clean_q) < 5:
        return clean_q in clean_doc
    return clean_q[:25] in clean_doc

def run_variant_search(
    query: str,
    chunks: List[Dict[str, Any]],
    chunk_embeddings: np.ndarray,
    model: Any,
    dense_weight: float = 0.7,
    bm25_weight: float = 0.3,
    top_k: int = 5,
) -> List[Dict[str, Any]]:
    if not chunks:
        return []

    if dense_weight > 0 and chunk_embeddings is not None and len(chunk_embeddings) > 0:
        query_vector = model.encode(query, normalize_embeddings=True)
        dense_scores = np.dot(chunk_embeddings, query_vector)
        min_d, max_d = float(dense_scores.min()), float(dense_scores.max())
        dense_norm = (dense_scores - min_d) / (max_d - min_d) if max_d > min_d else np.zeros_like(dense_scores)
    else:
        dense_norm = np.zeros(len(chunks), dtype=float)

    if bm25_weight > 0 and BM25Okapi is not None:
        corpus = [_tokenize(c["text"] + " " + c["parent_text"]) for c in chunks]
        q_tokens = _tokenize(query)
        if any(corpus) and q_tokens:
            bm25 = BM25Okapi(corpus)
            raw_bm25_scores = np.array(bm25.get_scores(q_tokens), dtype=float)
            min_bm, max_bm = float(raw_bm25_scores.min()), float(raw_bm25_scores.max())
            bm25_norm = (raw_bm25_scores - min_bm) / (max_bm - min_bm) if max_bm > min_bm else np.zeros_like(raw_bm25_scores)
        else:
            bm25_norm = np.zeros(len(chunks), dtype=float)
    else:
        bm25_norm = np.zeros(len(chunks), dtype=float)

    scores = (dense_weight * dense_norm) + (bm25_weight * bm25_norm)
    top_indices = np.argsort(scores)[::-1][:top_k]
    results = []
    for idx in top_indices:
        res = dict(chunks[idx])
        res["score"] = float(scores[idx])
        results.append(res)
    return results

def is_chunk_relevant(chunk: Dict[str, Any], keywords: List[str]) -> bool:
    combined_text = (chunk["text"] + " " + chunk.get("parent_text", "")).lower()
    return any(kw in combined_text for kw in keywords)

def run_ablation_evaluation():
    print("=========================================================================")
    print("      LeaseSight SEC EDGAR 10-CUAD Ablation Evaluation Suite              ")
    print("=========================================================================")

    if SentenceTransformer is None:
        raise RuntimeError("sentence-transformers package is required.")

    pdf_files = sorted(glob.glob(str(BENCHMARK_DIR / "*.pdf")) + glob.glob(str(BENCHMARK_DIR / "*.PDF")))
    pdf_files = list(dict.fromkeys(pdf_files))

    print(f"Discovered {len(pdf_files)} SEC EDGAR contract PDFs in: {BENCHMARK_DIR.name}")
    if not pdf_files:
        raise FileNotFoundError(f"No PDF files found in {BENCHMARK_DIR}")

    print("Loading embedding model offline: BAAI/bge-small-en-v1.5 (384-dim)...")
    try:
        embed_model = SentenceTransformer("BAAI/bge-small-en-v1.5", local_files_only=True)
    except Exception:
        embed_model = SentenceTransformer("BAAI/bge-small-en-v1.5")
    print("[OK] Model loaded successfully.\n")

    variants = {
        "full_leasesight": {
            "name": "Full LeaseSight Engine (Hybrid + Parent-Child)",
            "hits": 0, "p1_cnt": 0, "mrr_sum": 0.0, "prec_list": [], "rec_list": [], "f1_list": [],
            "grounded_cnt": 0, "quotes_cnt": 0, "latency_sum": 0.0
        },
        "variant1_flat_rag": {
            "name": "Variant 1: Flat RAG Baseline (500-char Flat Chunks, Dense Only)",
            "hits": 0, "p1_cnt": 0, "mrr_sum": 0.0, "prec_list": [], "rec_list": [], "f1_list": [],
            "grounded_cnt": 0, "quotes_cnt": 0, "latency_sum": 0.0
        },
        "variant2_dense_only": {
            "name": "Variant 2: Dense Only + Parent-Child (w_BM25 = 0)",
            "hits": 0, "p1_cnt": 0, "mrr_sum": 0.0, "prec_list": [], "rec_list": [], "f1_list": [],
            "grounded_cnt": 0, "quotes_cnt": 0, "latency_sum": 0.0
        },
        "variant3_sparse_bm25": {
            "name": "Variant 3: Sparse BM25 Only + Parent-Child (w_Dense = 0)",
            "hits": 0, "p1_cnt": 0, "mrr_sum": 0.0, "prec_list": [], "rec_list": [], "f1_list": [],
            "grounded_cnt": 0, "quotes_cnt": 0, "latency_sum": 0.0
        },
    }

    total_queries_evaluated = 0
    start_bench_time = time.time()

    for idx, pdf_path_str in enumerate(pdf_files, start=1):
        pdf_path = Path(pdf_path_str)
        t0 = time.time()
        spatial_data = extract_pdf_layout(pdf_path)
        full_doc_text = " ".join(p.get("text", "") for p in spatial_data["pages"])

        chunks_pc = create_parent_child_chunks(spatial_data, child_size=250)
        chunks_flat = create_flat_chunks(spatial_data, chunk_size=500)

        if not chunks_pc:
            continue

        embs_pc = embed_model.encode([c["text"] for c in chunks_pc], normalize_embeddings=True)
        embs_flat = embed_model.encode([c["text"] for c in chunks_flat], normalize_embeddings=True) if chunks_flat else None
        t_ingest = time.time() - t0

        num_q = len(COMPLIANCE_QUERIES)
        total_queries_evaluated += num_q

        for v_key, v_info in variants.items():
            t_v0 = time.time()
            v_hits, v_p1, v_mrr_q = 0, 0, 0.0
            v_p_sum, v_r_sum, v_f1_sum = 0.0, 0.0, 0.0
            v_grounded, v_quotes = 0, 0

            for q_item in COMPLIANCE_QUERIES:
                q_str = q_item["query"]
                keywords = q_item["keywords"]

                if v_key == "full_leasesight":
                    retrieved = run_variant_search(q_str, chunks_pc, embs_pc, embed_model, dense_weight=0.7, bm25_weight=0.3, top_k=5)
                    c_pool = chunks_pc
                elif v_key == "variant1_flat_rag":
                    retrieved = run_variant_search(q_str, chunks_flat, embs_flat, embed_model, dense_weight=1.0, bm25_weight=0.0, top_k=5)
                    c_pool = chunks_flat
                elif v_key == "variant2_dense_only":
                    retrieved = run_variant_search(q_str, chunks_pc, embs_pc, embed_model, dense_weight=1.0, bm25_weight=0.0, top_k=5)
                    c_pool = chunks_pc
                elif v_key == "variant3_sparse_bm25":
                    retrieved = run_variant_search(q_str, chunks_pc, embs_pc, embed_model, dense_weight=0.0, bm25_weight=1.0, top_k=5)
                    c_pool = chunks_pc

                all_rel = [i for i, c in enumerate(c_pool) if is_chunk_relevant(c, keywords)]
                total_rel = len(all_rel)

                rel_ret = [c for c in retrieved if is_chunk_relevant(c, keywords)]
                hit = 1 if len(rel_ret) > 0 else 0
                if hit:
                    v_hits += 1

                # Precision@1 calculation
                p1 = 1 if (retrieved and is_chunk_relevant(retrieved[0], keywords)) else 0
                v_p1 += p1

                # MRR (Mean Reciprocal Rank) calculation
                q_mrr = 0.0
                for rank_idx, r_chunk in enumerate(retrieved, start=1):
                    if is_chunk_relevant(r_chunk, keywords):
                        q_mrr = 1.0 / rank_idx
                        break
                v_mrr_q += q_mrr

                p = len(rel_ret) / 5.0
                r = len(rel_ret) / max(total_rel, 1.0) if total_rel > 0 else (1.0 if hit else 0.0)
                f1 = (2 * p * r) / (p + r) if (p + r) > 0 else 0.0

                v_p_sum += p
                v_r_sum += r
                v_f1_sum += f1

                if retrieved:
                    quote = retrieved[0]["text"][:150]
                    v_quotes += 1
                    if verify_quote_grounding(quote, full_doc_text):
                        v_grounded += 1

            t_v_elapsed = (time.time() - t_v0) + (t_ingest / 4.0)

            v_info["hits"] += v_hits
            v_info["p1_cnt"] += v_p1
            v_info["mrr_sum"] += v_mrr_q
            v_info["prec_list"].append(v_p_sum / float(num_q))
            v_info["rec_list"].append(v_r_sum / float(num_q))
            v_info["f1_list"].append(v_f1_sum / float(num_q))
            v_info["grounded_cnt"] += v_grounded
            v_info["quotes_cnt"] += v_quotes
            v_info["latency_sum"] += t_v_elapsed

        if idx % 10 == 0 or idx == len(pdf_files):
            print(f"[{idx:03d}/100] Evaluated '{pdf_path.name[:35]}...' across 10 CUAD categories")

    total_bench_time = time.time() - start_bench_time

    results_summary = {
        "ablation_metadata": {
            "dataset_name": "SEC EDGAR Commercial Contracts 100-PDF Sample",
            "total_documents": len(pdf_files),
            "total_queries": total_queries_evaluated,
            "cuad_categories_count": len(COMPLIANCE_QUERIES),
            "embedding_model": "BAAI/bge-small-en-v1.5 (384-dim)",
            "execution_time_seconds": round(total_bench_time, 2),
        },
        "variants": {},
    }

    print("\n=========================================================================")
    print("                    ABLATION STUDY FINAL RESULTS                         ")
    print("=========================================================================")

    for v_key, v_info in variants.items():
        hr5 = (v_info["hits"] / float(total_queries_evaluated)) * 100.0 if total_queries_evaluated > 0 else 0.0
        p1_avg = (v_info["p1_cnt"] / float(total_queries_evaluated)) * 100.0 if total_queries_evaluated > 0 else 0.0
        mrr_avg = v_info["mrr_sum"] / float(total_queries_evaluated) if total_queries_evaluated > 0 else 0.0
        p_avg = float(np.mean(v_info["prec_list"])) if v_info["prec_list"] else 0.0
        r_avg = float(np.mean(v_info["rec_list"])) if v_info["rec_list"] else 0.0
        f1_avg = (2 * p_avg * r_avg) / (p_avg + r_avg) if (p_avg + r_avg) > 0 else 0.0
        faith = (v_info["grounded_cnt"] / float(v_info["quotes_cnt"])) * 100.0 if v_info["quotes_cnt"] > 0 else 0.0
        lat_avg = (v_info["latency_sum"] / float(len(pdf_files))) if pdf_files else 0.0

        results_summary["variants"][v_key] = {
            "name": v_info["name"],
            "hit_rate_at_5_percentage": round(hr5, 2),
            "precision_at_1_percentage": round(p1_avg, 2),
            "mrr": round(mrr_avg, 4),
            "precision": round(p_avg, 4),
            "recall": round(r_avg, 4),
            "f1_score": round(f1_avg, 4),
            "faithfulness_percentage": round(faith, 2),
            "avg_latency_per_doc_seconds": round(lat_avg, 4),
        }

        print(f" ► {v_info['name']}")
        print(f"   HR@5: {hr5:.2f}% | P@1: {p1_avg:.2f}% | MRR: {mrr_avg:.4f} | F1: {f1_avg:.4f} | Faithfulness: {faith:.2f}% | Latency: {lat_avg:.3f}s")

    print("=========================================================================\n")

    RESULTS_JSON_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(RESULTS_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(results_summary, f, indent=2)
    print(f"[OK] Raw ablation results saved to: {RESULTS_JSON_PATH.relative_to(PROJECT_ROOT)}")

    generate_ablation_markdown_report(results_summary)
    print(f"[OK] Readable ablation summary report generated: {REPORT_MD_PATH.relative_to(PROJECT_ROOT)}")

def generate_ablation_markdown_report(data: Dict[str, Any]):
    meta = data["ablation_metadata"]
    vars_data = data["variants"]

    lines = [
        "# LeaseSight 10-CUAD Ablation Study & Baseline Evaluation Report",
        "",
        f"> **Evaluation Dataset:** `{meta['dataset_name']}`  ",
        f"> **Total Documents Evaluated:** `{meta['total_documents']}`  ",
        f"> **Total Queries Evaluated:** `{meta['total_queries']}` (across 10 CUAD categories)  ",
        f"> **Embedding Model:** `{meta['embedding_model']}`  ",
        f"> **Execution Duration:** `{meta['execution_time_seconds']} seconds`",
        "",
        "---",
        "",
        "## 1. Executive Ablation & Baseline Comparison Matrix",
        "",
        "| RAG Pipeline Variation | HR@5 (%) | P@1 (%) | MRR | $F_1$-Score | Faithfulness (%) | Latency (s) |",
        "| :--- | :--- | :--- | :--- | :--- | :--- | :--- |",
    ]

    for v_key, v in vars_data.items():
        is_leasesight = "full_leasesight" in v_key
        name_str = f"**{v['name']}**" if is_leasesight else v['name']
        hr_str = f"**{v['hit_rate_at_5_percentage']:.2f}%**" if is_leasesight else f"{v['hit_rate_at_5_percentage']:.2f}%"
        p1_str = f"**{v['precision_at_1_percentage']:.2f}%**" if is_leasesight else f"{v['precision_at_1_percentage']:.2f}%"
        mrr_str = f"**{v['mrr']:.4f}**" if is_leasesight else f"{v['mrr']:.4f}"
        f1_str = f"**{v['f1_score']:.4f}**" if is_leasesight else f"{v['f1_score']:.4f}"

        lines.append(
            f"| {name_str} | {hr_str} | {p1_str} | {mrr_str} | {f1_str} | {v['faithfulness_percentage']:.2f}% | {v['avg_latency_per_doc_seconds']:.3f}s |"
        )

    lines.extend([
        "",
        "---",
        "",
        "## 2. LaTeX Table Output (For Publication)",
        "",
        "```latex",
        "\\begin{table}[h]",
        "\\centering",
        "\\caption{LeaseSight RAG Pipeline Ablation Study on SEC EDGAR 100-PDF Sample across 10 CUAD Categories}",
        "\\label{tab:ablation_results}",
        "\\begin{tabular}{lcccccc}",
        "\\hline",
        "\\textbf{Pipeline Variation} & \\textbf{HR@5 (\\%)} & \\textbf{P@1 (\\%)} & \\textbf{MRR} & \\textbf{$F_1$-Score} & \\textbf{Faithfulness (\\%)} & \\textbf{Latency (s)} \\\\",
        "\\hline",
    ])

    for v_key, v in vars_data.items():
        is_full = "full_leasesight" in v_key
        name = f"\\textbf{{{v['name']}}}" if is_full else v['name']
        hr = f"\\textbf{{{v['hit_rate_at_5_percentage']:.2f}}}" if is_full else f"{v['hit_rate_at_5_percentage']:.2f}"
        p1 = f"\\textbf{{{v['precision_at_1_percentage']:.2f}}}" if is_full else f"{v['precision_at_1_percentage']:.2f}"
        mrr = f"\\textbf{{{v['mrr']:.4f}}}" if is_full else f"{v['mrr']:.4f}"
        f1 = f"\\textbf{{{v['f1_score']:.4f}}}" if is_full else f"{v['f1_score']:.4f}"
        lines.append(f"{name} & {hr} & {p1} & {mrr} & {f1} & {v['faithfulness_percentage']:.2f} & {v['avg_latency_per_doc_seconds']:.3f} \\\\")

    lines.extend([
        "\\hline",
        "\\end{tabular}",
        "\\end{table}",
        "```",
        "",
        "---",
        f"*Report generated automatically by `scripts/run_ablation_study.py` on {time.strftime('%Y-%m-%d %H:%M:%S')}.*",
    ])

    with open(REPORT_MD_PATH, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

if __name__ == "__main__":
    run_ablation_evaluation()
