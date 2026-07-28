import os
# Clean environment: remove Gemini keys, activate Groq
os.environ.pop("GOOGLE_API_KEY", None)
os.environ.pop("GEMINI_API_KEY", None)

from dotenv import load_dotenv
load_dotenv()

groq_key = os.getenv("GROQ_API_KEY", "")
if groq_key:
    os.environ["GROQ_API_KEY"] = groq_key

import json
import re
import time
from pathlib import Path

from scripts.groq_client import GroqChatClient
from scripts.processor import get_local_embedding
from app.core.rag_engine import retrieve_dual_namespace

# --- CONTEXT LIMIT SAFETY ---
CONTEXT_CHAR_LIMIT = 15000

# ============================================================================
# AGENT PROMPTS  (identical contracts – only the LLM backend changes)
# ============================================================================

MINER_PROMPT = """
You are "The Miner," a Legal Data Extraction specialist. Your goal is to extract EVERY critical clause and data point from the provided contract text.

CRITICAL EXTRACTION LIST:
1. Parties (Lessor/Lessee)
2. Commencement & Expiration Dates
3. Base Rent and Escalations
4. Security Deposit
5. Maintenance & Repair Obligations
6. Termination & Renewal Clauses
7. Governing Law

CRITICAL RULES:
1. Extract ALL details into the 'findings' array. 
2. Each finding MUST have: 'label', 'value', and 'evidence_quote'.
3. 'evidence_quote' MUST be the EXACT phrase from the text (do not paraphrase).
4. If a value is missing, use "Not Found".
5. Also populate the 'obligations' array with specific 'action_item', 'due_date', and 'party_responsible'.
"""

JUDGE_PROMPT = """
You are "The Judge," a Legal Risk Analyst. Compare the findings against Market Context and identify outliers or red flags.
Assign a 'risk_score' (1-10) and a list of 'warnings'.
"""

CLERK_PROMPT = """
You are "The Clerk," a Legal Synthesizer. Produce a final JSON report with:
- findings (Miner's output)
- obligations (Miner's output)
- summary_paragraph (3 sentences)
- risk_score (Judge's score)
- warnings (Judge's warnings)
"""

AUDIT_PROMPT = """
You are a Senior Legal Analyst and Data Architect specializing in commercial real estate and corporate contract auditing.
Convert the provided document text into high-fidelity structured JSON for visual grounding.

EXTRACT THE FOLLOWING 20-POINT COMPREHENSIVE MATRIX:

1. CORE ENTITY & METADATA IDENTIFICATION:
   - Document Category Class (e.g., Commercial Lease, Content License, SaaS, NDA)
   - First Party Name & Identity (Landlord / Licensor / Service Provider)
   - Second Party Name & Identity (Tenant / Licensee / Client)
   - Execution Date & Formal Agreement Title

2. CHRONOLOGICAL LIFECYCLE CONTROLS:
   - Contract Commencement / Effective Date
   - Initial Contract Duration (Term Length in months/years)
   - Automatic Renewal / Extension Provisions (Provisions for rollover periods)
   - Termination Notice Window (Required prior written notice period, e.g., 60 days)

3. FINANCIALS, FEES & REVENUE CONFIGURATIONS:
   - Base Fixed Monetary Obligations (e.g., Monthly Rent, Fixed Retainers)
   - Variable Splits / Revenue Shares (e.g., Percentage payout allocations like 45%)
   - Security Deposits / Fiscal Guarantees
   - Invoicing, Payment, and Reporting Cycles (e.g., Monthly or Quarterly terms)

4. RISK, COMPLIANCE & LEGAL TRAPS:
   - Financial Audit Rights & Shift-of-Cost Penalty Thresholds
   - Late Fees, Interest Penalties, and Liquidated Damage Rates
   - Non-Compete, Exclusivity, or Restrictive Covenants
   - Indemnification & Liability Hold-Harmless Clauses

5. RESTRICTIONS, SCOPE & GOVERNANCE:
   - Permitted Use / Scope of Distribution (e.g., Worldwide, Specific Content Verticals)
   - Subleasing / Sub-licensing Assignment Restrictions
   - Governing Law Jurisdiction (State/Country) and Designated Dispute Venue (STRIP STRUCTURAL HEADERS like 'ARTICLE 10' - return only 'New York, USA')
   - Survival Clauses (e.g., Confidentiality surviving for 2 years post-termination)

CRITICAL RULES:
- Every finding and obligation MUST include an 'evidence_quote' that is an EXACT verbatim string from the text.
- IF A CLAUSE IS NOT EXPLICITLY FOUND IN THE TEXT, DO NOT INCLUDE IT IN THE 'findings' OR 'obligations' ARRAY. OMIT IT ENTIRELY.
- For Governing Law and Venue, automatically strip structural headers and just return the location.
- Prefer quotes at least 20 characters long.

Return JSON only with this shape:
{
  "lease_metadata": {"title": "...", "lessor": "...", "lessee": "...", "tenure": "..."},
  "findings": [{"label": "...", "value": "...", "evidence_quote": "...", "risk_level": "Low|Medium|High"}],
  "obligations": [{"label": "...", "date": "...", "description": "...", "evidence_quote": "..."}],
  "risk_score": 1,
  "warnings": [],
  "summary_paragraph": "..."
}
"""

# ============================================================================
# AGENT FUNCTIONS
# ============================================================================

def _is_rate_limit_error(error_text):
    text = str(error_text).lower()
    return (
        "429" in text
        or "too many requests" in text
        or "rate limit" in text
        or "quota" in text
        or "resource exhausted" in text
    )

def _public_error_message(error_text):
    if _is_rate_limit_error(error_text):
        return "AI service is temporarily rate-limited. A conservative partial audit was generated from indexed document text."
    return "AI audit service was unavailable. A conservative partial audit was generated from indexed document text."

def _call_agent(system_prompt, user_content, agent_name="Agent", gemini_client=None, attempts=3):
    """Shared helper to call a Gemini agent with JSON output.
    
    Signature-compatible with the former OpenAI _call_agent so existing
    call-sites need only rename the keyword argument openai_client → gemini_client.
    """
    if not gemini_client:
        raise RuntimeError(f"{agent_name}: Gemini client missing")

    # Delegate retry logic to GroqChatClient (has its own exponential backoff).
    # We honour `attempts` here as an override if needed.
    client = GroqChatClient(max_retries=attempts) if not isinstance(gemini_client, GroqChatClient) else gemini_client

    try:
        return client.complete_json(system_prompt, user_content, agent_name)
    except Exception as exc:
        raise RuntimeError(_public_error_message(exc)) from exc

def _first_match(patterns, text):
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE | re.DOTALL)
        if match:
            value = " ".join(match.group(1).split())
            quote = " ".join(match.group(0).split())
            return value[:180], quote[:500]
    return "Not Found", "Not Found"

def _context_from_json_map(target_file):
    json_path = Path(__file__).resolve().parents[1] / "data" / "json_maps" / f"{target_file}.json"
    if not json_path.exists():
        return ""
    try:
        with open(json_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        pages = []
        for page in data.get("pages", []):
            page_number = page.get("page_number", "?")
            text = " ".join(line.get("content", "") for line in page.get("lines", []))
            if text.strip():
                pages.append(f"Page {page_number}: {text}")
        return "\n".join(pages)
    except Exception as e:
        print(f"[AUDIT] Could not load JSON map context for {target_file}: {e}")
        return ""

def _fallback_audit(context_text, target_file, warning=None):
    text = " ".join((context_text or "").split())
    patterns = {
        "Lessor": [
            r"(?:lessor|landlord)\s*[:\-]?\s*([A-Z][A-Za-z0-9&.,'() \-]{3,120})",
            r"between\s+([A-Z][A-Za-z0-9&.,'() \-]{3,120})\s+(?:\(|,)?\s*(?:as\s+)?(?:lessor|landlord)",
        ],
        "Lessee": [
            r"(?:lessee|tenant)\s*[:\-]?\s*([A-Z][A-Za-z0-9&.,'() \-]{3,120})",
            r"and\s+([A-Z][A-Za-z0-9&.,'() \-]{3,120})\s+(?:\(|,)?\s*(?:as\s+)?(?:lessee|tenant)",
        ],
        "Rent": [
            r"((?:monthly|annual|base)?\s*rent[^.]{0,180}(?:\$|USD|Rs\.?|PKR)[^.]{0,120})",
            r"((?:\$|USD|Rs\.?|PKR)\s?[0-9][0-9,]*(?:\.[0-9]{2})?[^.]{0,120}(?:rent|per month|per annum|annually|monthly))",
        ],
        "Security Deposit": [
            r"(security deposit[^.]{0,180}(?:\$|USD|Rs\.?|PKR)[^.]{0,120})",
        ],
        "Commencement Date": [
            r"(commencement date[^.]{0,160})",
            r"(effective date[^.]{0,160})",
        ],
        "Expiry Date": [
            r"(expir(?:y|ation) date[^.]{0,160})",
            r"(term[^.]{0,120}(?:expire|expires|expiration)[^.]{0,120})",
        ],
        "Termination Notice": [
            r"(termination[^.]{0,180}(?:notice|days)[^.]{0,120})",
            r"((?:[0-9]+|thirty|sixty|ninety)\s*\(?[0-9]*\)?\s*days[^.]{0,160}notice[^.]{0,80})",
        ],
        "Renewal Option": [
            r"(renew(?:al|)[^.]{0,220})",
        ],
        "Force Majeure": [
            r"(force majeure[^.]{0,220})",
        ],
        "Governing Law": [
            r"(governing law[^.]{0,180})",
            r"(laws of [A-Z][A-Za-z ]{2,80})",
        ],
        "Dispute Resolution": [
            r"(dispute[^.]{0,220}(?:arbitration|litigation|court)[^.]{0,120})",
            r"(arbitration[^.]{0,220})",
        ],
    }

    findings = []
    for label, label_patterns in patterns.items():
        value, quote = _first_match(label_patterns, text)
        if value != "Not Found":
            findings.append({
                "label": label,
                "value": value,
                "evidence_quote": quote,
                "risk_level": "Medium" if label in {"Termination Notice", "Governing Law", "Dispute Resolution"} else "Low",
            })

    obligations = []
    for label in ("Termination Notice", "Renewal Option"):
        value, quote = _first_match(patterns[label], text)
        if value != "Not Found":
            obligations.append({
                "label": label,
                "date": value[:80],
                "description": value,
                "evidence_quote": quote,
            })

    warning_text = warning or "AI audit service was unavailable. Showing conservative extraction from indexed document text."
    return {
        "lease_metadata": {"title": target_file, "lessor": "Not Found", "lessee": "Not Found", "tenure": "Not Found"},
        "findings": findings,
        "obligations": obligations,
        "summary_paragraph": "A conservative audit was generated from indexed lease text because the AI audit service was temporarily unavailable. Review the extracted fields against the source document before committing them to the knowledge base.",
        "risk_score": 5 if findings else 1,
        "warnings": [warning_text],
    }

def _normalize_report(report, target_file, context_text=""):
    if not isinstance(report, dict):
        report = {}
    findings    = report.get("findings")    or []
    obligations = report.get("obligations") or []
    warnings    = report.get("warnings")    or []

    clean_warnings = []
    for warning in warnings:
        text = str(warning)
        if "<html" in text.lower() or "openresty" in text.lower() or "crash:" in text.lower():
            clean_warnings.append(_public_error_message(text))
        elif text.strip():
            clean_warnings.append(text)

    clean_context = re.sub(r'[^a-zA-Z0-9]', '', context_text or "").lower()

    for item in findings:
        item.setdefault("label",          "Finding")
        item.setdefault("value",          "Not Found")
        item.setdefault("evidence_quote", "Not Found")
        item.setdefault("risk_level",     "Medium")
        quote = str(item.get("evidence_quote", ""))
        if clean_context and quote and quote != "Not Found" and len(quote) >= 15:
            clean_q = re.sub(r'[^a-zA-Z0-9]', '', quote).lower()
            item["verified_grounded"] = clean_q[:25] in clean_context
        else:
            item["verified_grounded"] = True

    for item in obligations:
        item.setdefault("label",          "Obligation")
        item.setdefault("date",           "Not Found")
        item.setdefault("description",    item.get("value", ""))
        item.setdefault("evidence_quote", "Not Found")
        quote = str(item.get("evidence_quote", ""))
        if clean_context and quote and quote != "Not Found" and len(quote) >= 15:
            clean_q = re.sub(r'[^a-zA-Z0-9]', '', quote).lower()
            item["verified_grounded"] = clean_q[:25] in clean_context
        else:
            item["verified_grounded"] = True

    summary = report.get("summary_paragraph") or report.get("summary") or ""
    if not summary or "technical error" in summary.lower() or "crash" in summary.lower():
        summary = "Lease audit completed. Review the extracted fields and source evidence before committing this document to the knowledge base."

    out = {
        "lease_metadata":    report.get("lease_metadata") or {"title": target_file},
        "findings":          findings,
        "obligations":       obligations,
        "summary_paragraph": summary,
        "risk_score":        int(report.get("risk_score") or 5),
        "warnings":          clean_warnings,
    }

    try:
        from api.schemas import AuditResult
        AuditResult.model_validate(out)
    except Exception as exc:
        print(f"[AUDIT] Pydantic schema validation note: {exc}")

    return out

# ============================================================================
# AGENT ENTRY POINTS
# ============================================================================

def agent_miner(context_text, gemini_client):
    print("[MINER] Extracting data points...")
    truncated = (context_text or "")[:CONTEXT_CHAR_LIMIT]
    return _call_agent(MINER_PROMPT, f"Extract from:\n\n{truncated}", "MINER", gemini_client)

def agent_judge(miner_output, market_context, gemini_client):
    print("[JUDGE] Reviewing for red flags...")
    input_data = json.dumps({"findings": miner_output, "market_context": market_context})
    return _call_agent(JUDGE_PROMPT, f"Review:\n\n{input_data}", "JUDGE", gemini_client)

def agent_clerk(miner_output, judge_output, gemini_client):
    print("[CLERK] Synthesizing report...")
    combined = json.dumps({"miner": miner_output, "judge": judge_output})
    return _call_agent(CLERK_PROMPT, f"Synthesize:\n\n{combined}", "CLERK", gemini_client)

# ============================================================================
# MAIN ORCHESTRATOR
# ============================================================================

def run_full_audit(target_file, gemini_client=None, pinecone_index=None,
                   user_id=None,
                   # Legacy keyword kept for backwards-compatibility; ignored
                   openai_client=None):
    """
    Run the full Miner→Judge→Clerk audit pipeline with Parent context expansion
    and hybrid BM25 + dense search retrieval.
    """
    try:
        if gemini_client is None:
            gemini_client = GroqChatClient()

        if not pinecone_index:
            return {"error": "Pinecone index not initialised"}

        print(f"--- STARTING AUDIT: {target_file} ---")

        # 1. Prefer the exact JSON spatial map for the selected PDF.
        context = _context_from_json_map(target_file)
        vec = None
        if not context:
            try:
                vec = get_local_embedding("Lease terms, parties, rent")
                query_text_term = "Lease terms, parties, rent, commencement date, expiration, governing law"
                results = retrieve_dual_namespace(
                    pinecone_index=pinecone_index,
                    query_vector=vec,
                    top_k=15,
                    file_name=target_file,
                    user_id=user_id,
                    include_metadata=True,
                    query_text=query_text_term,
                )
                if results.get("matches"):
                    context = "\n".join([
                        f"Page {m['metadata'].get('page_number', '?')}: {m['metadata'].get('parent_text') or m['metadata'].get('context_text') or m['metadata'].get('text', '')}"
                        for m in results["matches"]
                    ])
            except Exception as e:
                print(f"[AUDIT] Pinecone retrieval skipped: {str(e)[:300]}")

        if not context:
            return _fallback_audit(
                "", target_file,
                f"No indexed text found for {target_file}. Upload indexing may still be in progress."
            )

        # 2. Market Precedents
        market_context = "No market precedents found."
        try:
            if vec is None:
                vec = get_local_embedding("Lease terms, parties, rent")
            m_res = retrieve_dual_namespace(
                pinecone_index=pinecone_index,
                query_vector=vec,
                top_k=5,
                file_name=target_file,
                user_id=user_id,
                include_metadata=True,
                exclude_file_name=True,
                query_text="Lease terms, parties, rent",
            )
            if m_res.get("matches"):
                market_context = "\n".join([
                    m["metadata"].get("parent_text") or m["metadata"].get("context_text") or m["metadata"].get("text", "") for m in m_res["matches"]
                ])
        except Exception:
            pass

        # 3. Single-pass AUDIT_PROMPT
        try:
            payload = json.dumps({
                "document_name": target_file,
                "lease_text":    context[:CONTEXT_CHAR_LIMIT],
                "market_context": market_context[:5000],
            })
            final_report = _call_agent(AUDIT_PROMPT, payload, "AUDIT", gemini_client, attempts=4)
            return _normalize_report(final_report, target_file, context_text=context)
        except Exception as e:
            print(f"[AUDIT] Falling back after error: {str(e)}")
            return _fallback_audit(context, target_file, str(e))

    except Exception as e:
        return _fallback_audit("", target_file, f"Audit pipeline could not complete: {str(e)}")
