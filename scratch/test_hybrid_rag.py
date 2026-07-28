# scratch/test_hybrid_rag.py
# Verification test for LeaseSight Paper Refactoring:
# 1. Two-Tier Parent-Child Chunking
# 2. BM25 + Dense Hybrid Ranking (S_hybrid = 0.7 * S_dense + 0.3 * S_BM25)
# 3. Parent Context Expansion
# 4. Verbatim Quote Verification & Zero-Hallucination JSON Gating

import sys
from pathlib import Path

# Add project root to path
PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app.core.rag_engine import _tokenize, retrieve_dual_namespace
from scripts.full_audit import _normalize_report
from api.schemas import AuditResult, Finding, Obligation

def test_tokenization_and_bm25():
    print("--- 1. Testing BM25 Tokenizer ---")
    tokens = _tokenize("Article 10: Governing Law of Delaware, USA")
    print(f"Tokens: {tokens}")
    assert "governing" in tokens and "delaware" in tokens
    print("[OK] Tokenizer verified.\n")

def test_verbatim_quote_verification():
    print("--- 2. Testing Verbatim Quote Verification & JSON Gating ---")
    context_text = "Section 14.2 Early Termination: Tenant may terminate this Lease before expiration date by delivering 90 days prior written notice."
    
    report = {
        "lease_metadata": {"title": "Test Lease"},
        "findings": [
            {
                "label": "Termination Notice",
                "value": "90 days",
                "evidence_quote": "delivering 90 days prior written notice"
            },
            {
                "label": "Fake Clause",
                "value": "Hallucinated Value",
                "evidence_quote": "This sentence does not exist anywhere in the contract document"
            }
        ],
        "obligations": [],
        "summary_paragraph": "Test summary paragraph.",
        "risk_score": 3,
        "warnings": []
    }
    
    normalized = _normalize_report(report, "test.pdf", context_text=context_text)
    print("Normalized Report Output:")
    for f in normalized["findings"]:
        print(f"  - Finding '{f['label']}': verified_grounded = {f.get('verified_grounded')}")
    
    assert normalized["findings"][0]["verified_grounded"] == True
    assert normalized["findings"][1]["verified_grounded"] == False
    
    # Test Pydantic validation
    audit_obj = AuditResult.model_validate(normalized)
    print(f"[OK] Pydantic AuditResult model validated successfully: {audit_obj.risk_score}/10 risk score.\n")

class MockPineconeIndex:
    def query(self, vector, top_k=5, filter=None, namespace=None, include_metadata=True, include_values=False):
        return {
            "matches": [
                {
                    "id": "doc.pdf_p1_c0",
                    "score": 0.85,
                    "metadata": {
                        "filename": "doc.pdf",
                        "file_name": "doc.pdf",
                        "page_number": 1,
                        "chunk_index": 0,
                        "parent_id": "doc.pdf_p1",
                        "text": "Tenant may terminate this lease early with notice.",
                        "parent_text": "FULL PAGE 1: Section 14.2 Early Termination. Tenant may terminate this lease early with notice by giving 90 days prior written notice to Landlord."
                    }
                },
                {
                    "id": "doc.pdf_p1_c1",
                    "score": 0.70,
                    "metadata": {
                        "filename": "doc.pdf",
                        "file_name": "doc.pdf",
                        "page_number": 1,
                        "chunk_index": 1,
                        "parent_id": "doc.pdf_p1",
                        "text": "Termination fee equals two months rent payable upon notice.",
                        "parent_text": "FULL PAGE 1: Section 14.2 Early Termination. Tenant may terminate this lease early with notice by giving 90 days prior written notice to Landlord."
                    }
                }
            ]
        }

def test_hybrid_search_and_parent_expansion():
    print("--- 3. Testing Hybrid BM25 Search & Parent Context Expansion ---")
    mock_index = MockPineconeIndex()
    query_vector = [0.1] * 768
    query_text = "What is the early termination notice period?"
    
    res = retrieve_dual_namespace(
        pinecone_index=mock_index,
        query_vector=query_vector,
        top_k=2,
        file_name="doc.pdf",
        query_text=query_text
    )
    
    matches = res["matches"]
    print(f"Retrieved {len(matches)} matches:")
    for m in matches:
        print(f"  - ID: {m['id']} | S_hybrid: {m['score']} (Dense: {m.get('dense_score')}, BM25: {m.get('bm25_score')})")
        print(f"    Context Expanded: '{m['metadata'].get('context_text')[:60]}...'")
        assert m["metadata"].get("context_text") == m["metadata"].get("parent_text")
        assert "dense_score" in m and "bm25_score" in m
        
    print("[OK] Hybrid search and parent context expansion verified.\n")

if __name__ == "__main__":
    test_tokenization_and_bm25()
    test_verbatim_quote_verification()
    test_hybrid_search_and_parent_expansion()
    print("==================================================")
    print("  ALL REFACTORING VERIFICATION TESTS PASSED SUCCESSFULLY!  ")
    print("==================================================")
