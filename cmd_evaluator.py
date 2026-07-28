#!/usr/bin/env python3
"""
╔══════════════════════════════════════════════════════════════════════════════╗
║           LeaseSight  —  Command-Line Evaluation Pipeline                   ║
║  RAG Retrieval  ·  Multi-Agent Audit (Miner/Judge/Clerk)  ·  DeepEval       ║
╚══════════════════════════════════════════════════════════════════════════════╝

Usage
-----
  python cmd_evaluator.py <document_filename> "<user query>"

Examples
--------
  python cmd_evaluator.py "lease.pdf" "What is the termination notice period?"
  python cmd_evaluator.py "AgapeAtpCorp_20191202_10-KA_EX-10.1_11911128_EX-10.1_Supply Agreement.pdf" \
      "Who is responsible for governing law?"
"""

# ---------------------------------------------------------------------------
# Environment bootstrap  (must happen before any LeaseSight imports)
# ---------------------------------------------------------------------------
import os
import sys
import json
import time
import argparse

# Force UTF-8 output so rich emoji/unicode work on Windows CMD / PowerShell
if sys.stdout.encoding and sys.stdout.encoding.lower() not in ("utf-8", "utf8"):
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

# Silence Gemini/Google keys — evaluation backend is Groq
os.environ.pop("GOOGLE_API_KEY", None)
os.environ.pop("GEMINI_API_KEY", None)

from dotenv import load_dotenv
load_dotenv()

# Ensure the project root is on sys.path so local package imports work
PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

# ---------------------------------------------------------------------------
# Rich console  (graceful fallback to plain print if somehow unavailable)
# ---------------------------------------------------------------------------
try:
    from rich.console import Console
    from rich.panel import Panel
    from rich.table import Table
    from rich.text import Text
    from rich.rule import Rule
    from rich import box
    from rich.style import Style
    from rich.padding import Padding
    from rich.columns import Columns
    _RICH = True
    console = Console(highlight=False)
except ImportError:
    _RICH = False
    console = None  # type: ignore

# ---------------------------------------------------------------------------
# Pretty-print helpers
# ---------------------------------------------------------------------------

PASS_THRESHOLD = 0.6

def _hr(char="═", width=78):
    print(char * width)

def _banner(title: str, subtitle: str = ""):
    if _RICH:
        console.print()
        console.rule(f"[bold cyan]{title}[/bold cyan]", style="cyan")
        if subtitle:
            console.print(f"[dim]{subtitle}[/dim]", justify="center")
        console.print()
    else:
        print()
        _hr()
        print(f"  {title}")
        if subtitle:
            print(f"  {subtitle}")
        _hr()
        print()

def _section(label: str):
    if _RICH:
        console.print(Rule(f"[bold yellow]{label}[/bold yellow]", style="yellow"))
    else:
        print(f"\n{'─'*78}")
        print(f"  ▶  {label}")
        print(f"{'─'*78}")

def _print_context_chunks(chunks: list[dict]):
    _section("[DOC]  RETRIEVED CONTEXT / SPECIFIC LINES")
    for i, chunk in enumerate(chunks, 1):
        page  = chunk.get("page", "?")
        score = chunk.get("score", 0.0)
        text  = chunk.get("text", "").strip()
        if _RICH:
            header = f"[bold green]Chunk {i}[/bold green]  [dim](Page {page} · similarity {score:.4f})[/dim]"
            console.print(Panel(
                f"[italic white]{text}[/italic white]",
                title=header,
                border_style="green",
                padding=(0, 2),
            ))
        else:
            print(f"\n  ── Chunk {i} (Page {page} · score {score:.4f}) ──")
            print(f"  {text}\n")

def _print_audit_report(report: dict):
    _section("[AI]  MULTI-AGENT AUDIT REPORT  (Miner -> Judge -> Clerk)")

    if _RICH:
        # ── Metadata ──────────────────────────────────────────────────────────
        meta = report.get("lease_metadata", {})
        meta_table = Table(show_header=False, box=box.MINIMAL, padding=(0, 2))
        meta_table.add_column("Field", style="bold cyan", width=20)
        meta_table.add_column("Value", style="white")
        for k, v in meta.items():
            meta_table.add_row(k.replace("_", " ").title(), str(v))
        console.print(Panel(meta_table, title="[bold]Lease Metadata[/bold]", border_style="cyan"))

        # ── Risk Score ────────────────────────────────────────────────────────
        risk  = report.get("risk_score", 0)
        color = "green" if risk <= 3 else "yellow" if risk <= 6 else "red"
        risk_text = Text(f"  ⚠  Risk Score: {risk} / 10", style=f"bold {color}")
        console.print(Padding(risk_text, (1, 0)))

        # ── Summary ───────────────────────────────────────────────────────────
        summary = report.get("summary_paragraph", "")
        if summary:
            console.print(Panel(
                f"[white]{summary}[/white]",
                title="[bold]Executive Summary[/bold]",
                border_style="blue",
                padding=(0, 2),
            ))

        # ── Findings ──────────────────────────────────────────────────────────
        findings = report.get("findings", [])
        if findings:
            f_table = Table(
                "Label", "Value", "Risk", "Evidence Quote",
                box=box.SIMPLE_HEAVY, show_header=True,
                header_style="bold magenta", padding=(0, 1),
            )
            for f in findings:
                risk_level = f.get("risk_level", "Low")
                rl_style   = "red" if risk_level == "High" else "yellow" if risk_level == "Medium" else "green"
                f_table.add_row(
                    f.get("label", ""),
                    f.get("value", ""),
                    Text(risk_level, style=rl_style),
                    f.get("evidence_quote", "")[:120],
                )
            console.print(Panel(f_table, title="[bold]Findings[/bold]", border_style="magenta"))

        # ── Obligations ───────────────────────────────────────────────────────
        obligations = report.get("obligations", [])
        if obligations:
            o_table = Table(
                "Label", "Date", "Description", "Evidence Quote",
                box=box.SIMPLE_HEAVY, show_header=True,
                header_style="bold yellow", padding=(0, 1),
            )
            for o in obligations:
                o_table.add_row(
                    o.get("label", ""),
                    o.get("date", ""),
                    o.get("description", "")[:80],
                    o.get("evidence_quote", "")[:100],
                )
            console.print(Panel(o_table, title="[bold]Obligations[/bold]", border_style="yellow"))

        # ── Warnings ──────────────────────────────────────────────────────────
        warnings = report.get("warnings", [])
        if warnings:
            w_text = "\n".join(f"  • {w}" for w in warnings)
            console.print(Panel(f"[red]{w_text}[/red]", title="[bold red]Warnings[/bold red]", border_style="red"))

        # ── Raw JSON ──────────────────────────────────────────────────────────
        console.print()
        console.print("[dim]Full JSON response:[/dim]")
        console.print_json(json.dumps(report, indent=2))

    else:
        print(json.dumps(report, indent=2))

def _print_eval_scores(scores: dict):
    _section("[EVAL]  DeepEval METRIC SCORES")

    metrics = [
        ("Faithfulness",        scores.get("faithfulness",       0.0)),
        ("Answer Relevance",    scores.get("answer_relevance",   0.0)),
        ("Contextual Recall",   scores.get("context_recall",     0.0)),
    ]

    if _RICH:
        table = Table(
            "Metric", "Score", "Threshold", "Status",
            box=box.DOUBLE_EDGE, show_header=True,
            header_style="bold white on #1a1a2e",
            title="[bold]DeepEval · Groq Llama-3.3-70B Evaluation[/bold]",
            title_style="bold cyan",
            padding=(0, 2),
        )
        all_pass = True
        for name, val in metrics:
            passed    = val >= PASS_THRESHOLD
            all_pass  = all_pass and passed
            val_str   = f"{val:.4f}"
            status    = Text("✅  PASS", style="bold green") if passed else Text("❌  FAIL", style="bold red")
            score_col = Text(val_str, style="bold green" if passed else "bold red")
            table.add_row(name, score_col, f"{PASS_THRESHOLD:.1f}", status)

        console.print(table)

        overall_style = "bold green" if all_pass else "bold red"
        overall_label = "🏆  ALL METRICS PASSED" if all_pass else "⚠️   ONE OR MORE METRICS BELOW THRESHOLD"
        console.print(Padding(Text(overall_label, style=overall_style), (1, 0)))

        # Groundedness composite
        composite = scores.get("groundedness_index")
        if composite is not None:
            console.print(f"[dim]Groundedness Index (composite): [bold]{composite:.4f}[/bold][/dim]")

        if "error" in scores:
            console.print(f"\n[red dim]  ⚠  Evaluation note: {scores['error']}[/red dim]")

    else:
        for name, val in metrics:
            passed = val >= PASS_THRESHOLD
            status = "PASS" if passed else "FAIL"
            print(f"  {name:22s}  {val:.4f}  (threshold {PASS_THRESHOLD})  [{status}]")
        if "error" in scores:
            print(f"\n  Note: {scores['error']}")

# ---------------------------------------------------------------------------
# Core pipeline
# ---------------------------------------------------------------------------

def run_evaluation(file_name: str, query: str, user_id: str = "default_user"):
    """Execute the full LeaseSight evaluation pipeline and print results."""

    start_time = time.time()

    _banner(
        "LeaseSight  ·  Command-Line Evaluation Pipeline",
        f"Document: {file_name}  |  Query: {query}",
    )

    # ── 1. Pinecone RAG Retrieval ────────────────────────────────────────────
    _section("[STEP 1]  Pinecone RAG Retrieval")

    if _RICH:
        console.print(f"[dim]Connecting to Pinecone and embedding query…[/dim]")

    from pinecone import Pinecone
    from scripts.processor import get_local_embedding
    from app.core.rag_engine import retrieve_dual_namespace

    pc = Pinecone(api_key=os.getenv("PINECONE_API_KEY"))
    pinecone_index = pc.Index("leasesight-index")

    if _RICH:
        console.print("[green]  ✔  Pinecone index connected[/green]")
        console.print("[dim]  Generating local all-mpnet-base-v2 embedding…[/dim]")

    query_vector = get_local_embedding(query)

    if _RICH:
        console.print(f"[green]  ✔  Query embedded ({len(query_vector)}-dim)[/green]")
        console.print("[dim]  Querying dual namespace (academic_baseline + user namespace)…[/dim]")

    # Query both academic_baseline AND user_<id> namespace so user-uploaded docs are found (Hybrid Dense + BM25)
    results = retrieve_dual_namespace(
        pinecone_index=pinecone_index,
        query_vector=query_vector,
        top_k=5,
        file_name=file_name,
        user_id=user_id,
        include_metadata=True,
        query_text=query,
    )

    matches = results.get("matches", [])
    if _RICH:
        ns_label = f"academic_baseline + user_{user_id}" if user_id else "academic_baseline"
        console.print(f"[green]  ✔  Retrieved {len(matches)} chunk(s) from [{ns_label}] via Hybrid BM25+Dense RAG[/green]")

    # Build chunk list for display and evaluation (Parent Context Expansion)
    context_chunks = []
    context_text   = ""
    retrieved_strs = []   # plain strings for DeepEval

    for m in matches:
        meta     = m.get("metadata", {})
        text     = meta.get("parent_text") or meta.get("context_text") or meta.get("text", "")
        page     = meta.get("page_number", "?")
        score    = m.get("score", 0.0)
        context_chunks.append({"page": page, "score": score, "text": text})
        snippet = f"Page {page}: {text}"
        context_text += f"\n---\n{snippet}"
        retrieved_strs.append(text)

    # ── JSON map fallback (used when Pinecone has 0 results) ─────────────────
    if not matches:
        if _RICH:
            console.print("[yellow]  ⚠  Pinecone returned 0 results — falling back to local JSON spatial map…[/yellow]")
        else:
            print("  ⚠  Pinecone 0 results — using local JSON map fallback…")

        from scripts.full_audit import _context_from_json_map
        fallback_text = _context_from_json_map(file_name)
        if not fallback_text:
            if _RICH:
                console.print("[red]  ✖  No JSON map found either. Upload the document first via the frontend.[/red]")
            else:
                print("  ✖  No context found at all. Upload the document first.")
            sys.exit(1)

        # Synthesise fake chunks from the JSON map pages (score=1.0 = local)
        from pathlib import Path as _Path
        import json as _json
        _jmap = _Path(PROJECT_ROOT) / "data" / "json_maps" / f"{file_name}.json"
        if _jmap.exists():
            with open(_jmap, encoding="utf-8") as _f:
                _data = _json.load(_f)
            for _pg in _data.get("pages", [])[:5]:
                _pnum = _pg.get("page_number", "?")
                _ptxt = " ".join(l.get("content", "") for l in _pg.get("lines", []))
                if _ptxt.strip():
                    context_chunks.append({"page": _pnum, "score": 1.0, "text": _ptxt})
                    context_text += f"\n---\nPage {_pnum}: {_ptxt}"
                    retrieved_strs.append(_ptxt)
        else:
            # Plain text fallback
            context_chunks.append({"page": 1, "score": 1.0, "text": fallback_text[:3000]})
            context_text = fallback_text[:15000]
            retrieved_strs.append(fallback_text[:3000])

        if _RICH:
            console.print(f"[green]  ✔  Loaded {len(context_chunks)} page(s) from JSON map[/green]")

    _print_context_chunks(context_chunks)

    # ── 2. Single-Pass AUDIT_PROMPT (Miner → Judge → Clerk) ─────────────────
    _section("[STEP 2]  Multi-Agent Audit  (Miner . Judge . Clerk via Groq)")

    from scripts.groq_client import GroqChatClient
    from scripts.full_audit import AUDIT_PROMPT, _call_agent, _normalize_report

    if _RICH:
        console.print("[dim]  Initialising GroqChatClient (llama-3.3-70b-versatile)…[/dim]")

    groq_client = GroqChatClient()

    if _RICH:
        console.print("[green]  ✔  Groq client ready[/green]")
        console.print("[dim]  Running single-pass AUDIT_PROMPT…[/dim]")

    payload = json.dumps({
        "document_name": file_name,
        "lease_text":    context_text[:15000],
        "market_context": "",
    })

    raw_report  = _call_agent(AUDIT_PROMPT, payload, "AUDIT", groq_client, attempts=4)
    audit_report = _normalize_report(raw_report, file_name)

    # Extract the generated answer for evaluation (summary_paragraph or first finding value)
    generated_output = (
        audit_report.get("summary_paragraph")
        or next((f.get("value", "") for f in audit_report.get("findings", [])), "")
        or str(raw_report)
    )

    _print_audit_report(audit_report)

    # ── 3. DeepEval Metrics ──────────────────────────────────────────────────
    _section("[STEP 3]  DeepEval Evaluation  (Faithfulness . Relevance . Recall)")

    if _RICH:
        console.print("[dim]  Importing GroqDeepEvalWrapper and DeepEval metrics from app.core.evaluator…[/dim]")

    from app.core.evaluator import (
        GroqDeepEvalWrapper,
        _load_deepeval_dependencies,
    )

    deps  = _load_deepeval_dependencies()
    model = GroqDeepEvalWrapper()

    FaithfulnessMetric    = deps["FaithfulnessMetric"]
    AnswerRelevanceMetric = deps["AnswerRelevanceMetric"]
    ContextualRecallMetric = deps["ContextualRecallMetric"]
    LLMTestCase           = deps["LLMTestCase"]

    if _RICH:
        console.print("[green]  ✔  DeepEval metrics loaded via Groq backend[/green]")
        console.print("[dim]  Building LLMTestCase…[/dim]")

    test_case = LLMTestCase(
        input=query,
        actual_output=generated_output,
        expected_output=generated_output,   # self-grounding for live eval
        retrieval_context=retrieved_strs,
    )

    faithfulness_metric = FaithfulnessMetric(
        threshold=PASS_THRESHOLD, model=model, include_reason=False
    )
    relevance_metric = AnswerRelevanceMetric(
        threshold=PASS_THRESHOLD, model=model, include_reason=False
    )
    recall_metric = ContextualRecallMetric(
        threshold=PASS_THRESHOLD, model=model, include_reason=False
    )

    scores = {}
    errors = []

    for metric_name, metric in [
        ("faithfulness",     faithfulness_metric),
        ("answer_relevance", relevance_metric),
        ("context_recall",   recall_metric),
    ]:
        if _RICH:
            console.print(f"[dim]  Measuring {metric_name.replace('_', ' ').title()}…[/dim]")
        try:
            metric.measure(test_case)
            scores[metric_name] = float(metric.score or 0.0)
            if _RICH:
                val = scores[metric_name]
                col = "green" if val >= PASS_THRESHOLD else "red"
                console.print(f"  [bold {col}]{metric_name.replace('_', ' ').title()}: {val:.4f}[/bold {col}]")
        except Exception as exc:
            scores[metric_name] = 0.0
            errors.append(f"{metric_name}: {exc}")
            if _RICH:
                console.print(f"  [red]⚠  {metric_name} measurement failed: {exc}[/red]")

    if errors:
        scores["error"] = "; ".join(errors)

    # Composite
    if scores.get("faithfulness") and scores.get("answer_relevance"):
        scores["groundedness_index"] = round(
            (scores["faithfulness"] + scores["answer_relevance"]) / 2, 4
        )

    _print_eval_scores(scores)

    # ── 4. Summary Footer ────────────────────────────────────────────────────
    elapsed = time.time() - start_time
    if _RICH:
        console.print()
        console.rule(style="dim")
        console.print(
            f"[dim]  Pipeline completed in {elapsed:.1f}s  ·  "
            f"Document: [italic]{file_name}[/italic]  ·  "
            f"Query: [italic]{query}[/italic][/dim]"
        )
        console.print()
    else:
        print(f"\n{'═'*78}")
        print(f"  Pipeline completed in {elapsed:.1f}s")
        print(f"  Document : {file_name}")
        print(f"  Query    : {query}")
        print(f"{'═'*78}\n")


# ---------------------------------------------------------------------------
# CLI entry-point
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        prog="cmd_evaluator",
        description=(
            "LeaseSight Command-Line Evaluator\n"
            "Runs RAG retrieval -> multi-agent audit -> DeepEval metrics pipeline."
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "document",
        help="Filename of the document in Pinecone (e.g. 'lease.pdf')",
    )
    parser.add_argument(
        "query",
        help="Natural-language question to evaluate against the document",
    )
    parser.add_argument(
        "--user-id",
        default="default_user",
        help="Tenant/user ID used when the document was uploaded (default: default_user)",
    )

    args = parser.parse_args()
    run_evaluation(file_name=args.document, query=args.query, user_id=args.user_id)


if __name__ == "__main__":
    main()
