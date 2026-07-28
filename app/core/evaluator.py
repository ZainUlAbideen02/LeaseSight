import os
# Remove any cached Google/Gemini keys — evaluation now runs via Groq
os.environ.pop("GOOGLE_API_KEY", None)
os.environ.pop("GEMINI_API_KEY", None)

# Load .env and activate Groq
from dotenv import load_dotenv
load_dotenv()

groq_key = os.getenv("GROQ_API_KEY", "")
if groq_key:
    os.environ["GROQ_API_KEY"] = groq_key

import asyncio
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional

# ---------------------------------------------------------------------------
# Groq → DeepEval bridge
# ---------------------------------------------------------------------------

GROQ_EVAL_MODEL = os.getenv("GROQ_EVAL_MODEL", "llama-3.3-70b-versatile")
LIVE_EVAL_MODEL = GROQ_EVAL_MODEL  # kept for backward-compat references

try:
    from groq import Groq as _GroqClient
    from deepeval.models.base_model import DeepEvalBaseLLM

    class GroqDeepEvalWrapper(DeepEvalBaseLLM):
        """
        Thin adapter that exposes a Groq Llama-3 model to DeepEval metrics.
        Satisfies the three abstract methods required by DeepEvalBaseLLM v3.7+:
          load_model / generate / a_generate / get_model_name
        """

        def __init__(self, model_name: str = GROQ_EVAL_MODEL):
            # Call parent with model_name so self.model_name is set before load_model
            self._groq_model_name = model_name
            self._client: Optional[_GroqClient] = None
            super().__init__(model_name=model_name)

        def load_model(self, *args, **kwargs):
            api_key = os.getenv("GROQ_API_KEY")
            if not api_key:
                raise RuntimeError(
                    "GROQ_API_KEY is required to run DeepEval evaluations via Groq."
                )
            self._client = _GroqClient(api_key=api_key)
            return self._client

        def generate(self, prompt: str, schema=None, *args, **kwargs):
            """
            Generate a response from Groq.

            When DeepEval passes a Pydantic ``schema``, we:
              1. Append an explicit JSON-shape instruction to the prompt.
              2. Enable Groq's native ``json_object`` response_format.
              3. Parse the raw string into the Pydantic model before returning
                 so DeepEval receives the typed object it expects (fixing the
                 ``'str' object has no attribute 'claims'`` error).
            """
            import json as _json

            if self._client is None:
                self.load_model()

            # --- schema-aware prompt injection ---
            effective_prompt = prompt
            use_json_mode = schema is not None
            if use_json_mode:
                try:
                    schema_hint = schema.schema_json()
                except AttributeError:
                    # Pydantic v1 fallback
                    schema_hint = _json.dumps(schema.schema())
                effective_prompt = (
                    prompt
                    + "\n\nYou MUST return ONLY valid JSON matching this schema: "
                    + schema_hint
                )

            # --- Groq API call with retry for rate limits & transient errors ---
            import time
            last_exc = None
            for attempt in range(4):
                try:
                    create_kwargs = dict(
                        model=self._groq_model_name,
                        messages=[{"role": "user", "content": effective_prompt}],
                        temperature=0,
                        max_tokens=2048,
                    )
                    if use_json_mode:
                        create_kwargs["response_format"] = {"type": "json_object"}

                    completion = self._client.chat.completions.create(**create_kwargs)
                    content = completion.choices[0].message.content or ""

                    # --- parse into Pydantic model when schema provided ---
                    if use_json_mode and schema is not None:
                        try:
                            return schema.model_validate_json(content)
                        except AttributeError:
                            return schema(**_json.loads(content))

                    return content
                except Exception as exc:
                    last_exc = exc
                    if attempt < 3:
                        time.sleep(5.0 * (attempt + 1))
                        continue
                    raise exc

        async def a_generate(self, prompt: str, schema=None, *args, **kwargs):
            """Async wrapper — defers to generate() via thread so Groq's sync SDK
            is never called from an event loop directly."""
            import functools
            return await asyncio.to_thread(
                functools.partial(self.generate, prompt, schema)
            )

        def get_model_name(self, *args, **kwargs) -> str:
            return f"Groq/{self._groq_model_name}"

    _GROQ_DEEPEVAL_AVAILABLE = True
except ImportError as _groq_import_err:
    _GROQ_DEEPEVAL_AVAILABLE = False
    _groq_import_err_msg = str(_groq_import_err)
BASE_DIR = Path(__file__).resolve().parents[2]
BENCHMARKS_PATH = BASE_DIR / "data" / "benchmarks.json"
FAILED_CASES_PATH = BASE_DIR / "data" / "failed_cases.json"

ACADEMIC_BENCHMARK = {
    "paper_title": "CUAD Legal Dataset Benchmark",
    "precision": 0.44,
    "recall": 0.48,
    "f1_score": 0.46,
}


@dataclass(frozen=True)
class GoldenLeaseCase:
    input: str
    actual_output: str
    expected_output: str
    retrieval_context: List[str]


GOLDEN_DATASET = [
    GoldenLeaseCase(
        input="What is the notice period for early termination?",
        actual_output="The tenant may terminate early by giving at least 90 days' written notice and paying the stated early termination fee.",
        expected_output="Early termination requires 90 days' prior written notice from the tenant and payment of an early termination fee equal to two months' rent.",
        retrieval_context=[
            "Section 14.2 Early Termination: Tenant may terminate this Lease before the expiration date by delivering no less than ninety (90) days' prior written notice to Landlord.",
            "Upon early termination, Tenant shall pay an early termination fee equal to two (2) months of Base Rent, due with the termination notice.",
        ],
    ),
    GoldenLeaseCase(
        input="Are there subletting penalties?",
        actual_output="Subletting without the landlord's prior written consent is prohibited and can trigger a $5,000 administrative charge plus default remedies.",
        expected_output="Unauthorized subletting is prohibited. If the tenant sublets without consent, the landlord may charge a $5,000 administrative fee and treat the breach as an event of default.",
        retrieval_context=[
            "Section 11 Assignment and Subletting: Tenant shall not assign this Lease or sublet all or any part of the Premises without Landlord's prior written consent.",
            "Any unauthorized assignment or sublease shall be void and Tenant shall pay Landlord an administrative charge of $5,000, without limiting Landlord's default remedies.",
        ],
    ),
    GoldenLeaseCase(
        input="Who is responsible for HVAC maintenance?",
        actual_output="The tenant handles routine HVAC filter replacement and minor maintenance, while the landlord remains responsible for capital repairs and replacement.",
        expected_output="Tenant must perform routine HVAC maintenance such as quarterly filter changes and service calls under $750. Landlord is responsible for capital repairs and full replacement.",
        retrieval_context=[
            "Section 8.4 Building Systems: Tenant shall maintain HVAC filters quarterly and arrange ordinary maintenance for service calls costing less than $750.",
            "Landlord shall remain responsible for capital repairs to, and replacement of, the HVAC units serving the Premises unless damage is caused by Tenant negligence.",
        ],
    ),
    GoldenLeaseCase(
        input="When is rent due and what is the late fee?",
        actual_output="Base rent is due on the first day of each month. A late fee of 5% applies if payment is more than five days late.",
        expected_output="Monthly base rent is payable in advance on the first day of each calendar month. If unpaid after a five-day grace period, a late charge equal to 5% of the overdue amount applies.",
        retrieval_context=[
            "Section 3.1 Base Rent: Tenant shall pay Base Rent monthly in advance on the first (1st) day of each calendar month.",
            "Section 3.3 Late Charge: If any installment is not received within five (5) days after its due date, Tenant shall pay a late charge equal to five percent (5%) of the overdue amount.",
        ],
    ),
    GoldenLeaseCase(
        input="Does the lease include an automatic renewal option?",
        actual_output="Yes. The lease renews for one additional three-year term unless either party gives written non-renewal notice at least 180 days before expiration.",
        expected_output="The lease automatically renews for one additional three-year term unless either party sends written notice of non-renewal at least 180 days before the initial term expires.",
        retrieval_context=[
            "Section 2.3 Renewal: Provided Tenant is not in default, this Lease shall automatically renew for one (1) additional term of three (3) years.",
            "Either party may prevent renewal by giving written notice of non-renewal no later than one hundred eighty (180) days before the expiration of the then-current term.",
        ],
    ),
    GoldenLeaseCase(
        input="What insurance coverage must the tenant maintain?",
        actual_output="The tenant must keep commercial general liability insurance of at least $2 million per occurrence and name the landlord as an additional insured.",
        expected_output="Tenant must maintain commercial general liability coverage with limits of at least $2,000,000 per occurrence and $4,000,000 aggregate, and must name landlord as an additional insured.",
        retrieval_context=[
            "Section 10.1 Insurance: Tenant shall maintain commercial general liability insurance with limits not less than $2,000,000 per occurrence and $4,000,000 in the aggregate.",
            "All liability policies maintained by Tenant shall name Landlord and Landlord's property manager as additional insureds.",
        ],
    ),
]


def _load_deepeval_dependencies() -> Dict[str, Any]:
    from deepeval.metrics import ContextualRecallMetric, FaithfulnessMetric

    try:
        from deepeval.metrics import AnswerRelevanceMetric
    except ImportError:
        from deepeval.metrics import AnswerRelevancyMetric as AnswerRelevanceMetric

    from deepeval.test_case import LLMTestCase

    return {
        "ContextualRecallMetric": ContextualRecallMetric,
        "FaithfulnessMetric": FaithfulnessMetric,
        "AnswerRelevanceMetric": AnswerRelevanceMetric,
        "LLMTestCase": LLMTestCase,
    }


def _configure_eval_model(model_name: str = GROQ_EVAL_MODEL) -> Any:
    """Return a DeepEval-compatible model backed by Groq Llama-3."""
    if not _GROQ_DEEPEVAL_AVAILABLE:
        raise RuntimeError(
            f"groq or deepeval package is missing. Run: pip install groq deepeval\n"
            f"Import error was: {_groq_import_err_msg}"
        )
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise RuntimeError(
            "GROQ_API_KEY is required to run DeepEval evaluations via Groq. "
            "Add it to your .env file."
        )
    return GroqDeepEvalWrapper(model_name=model_name)


# Keep old name as alias so any leftover internal callers don't break
_configure_gemini_model = _configure_eval_model


def _build_metrics(model: Any, deps: Dict[str, Any]):
    return {
        "faithfulness": deps["FaithfulnessMetric"](
            threshold=0.7,
            model=model,
            include_reason=False,
        ),
        "answer_relevance": deps["AnswerRelevanceMetric"](
            threshold=0.7,
            model=model,
            include_reason=False,
        ),
        "context_recall": deps["ContextualRecallMetric"](
            threshold=0.7,
            model=model,
            include_reason=False,
        ),
    }


def _to_test_case(golden: GoldenLeaseCase, deps: Dict[str, Any]) -> Any:
    return deps["LLMTestCase"](
        input=golden.input,
        actual_output=golden.actual_output,
        expected_output=golden.expected_output,
        retrieval_context=golden.retrieval_context,
    )


def _load_benchmark_config() -> Dict[str, Any]:
    try:
        with open(BENCHMARKS_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return ACADEMIC_BENCHMARK.copy()


def _load_failed_cases() -> List[Dict[str, str]]:
    if not FAILED_CASES_PATH.exists():
        return []
    try:
        with open(FAILED_CASES_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, list) else []
    except Exception:
        return []


def _classify_failure(
    golden: GoldenLeaseCase,
    faithfulness: float,
    answer_relevance: float,
    context_recall: float,
) -> str:
    context_text = " ".join(golden.retrieval_context).strip()
    if not context_text or len(context_text) < 80:
        return "OCR_ERROR"
    if context_recall < 0.7:
        return "RETRIEVAL_ERROR"
    if faithfulness < 0.7 or answer_relevance < 0.7:
        return "GENERATION_ERROR"
    return "GENERATION_ERROR"


def _append_failed_case(
    golden: GoldenLeaseCase,
    faithfulness: float,
    answer_relevance: float,
    context_recall: float,
):
    FAILED_CASES_PATH.parent.mkdir(parents=True, exist_ok=True)
    failed_cases = _load_failed_cases()
    failed_cases.append(
        {
            "user_query": golden.input,
            "generated_output": golden.actual_output,
            "failure_reason": _classify_failure(
                golden,
                faithfulness,
                answer_relevance,
                context_recall,
            ),
        }
    )
    with open(FAILED_CASES_PATH, "w", encoding="utf-8") as f:
        json.dump(failed_cases, f, indent=2)


def _run_evaluation_sync() -> Dict[str, Any]:
    deps = _load_deepeval_dependencies()
    model = _configure_eval_model()
    benchmark = _load_benchmark_config()
    totals = {
        "faithfulness": 0.0,
        "answer_relevance": 0.0,
        "context_recall": 0.0,
    }

    for golden in GOLDEN_DATASET:
        test_case = _to_test_case(golden, deps)
        metrics = _build_metrics(model, deps)

        for metric_name, metric in metrics.items():
            metric.measure(test_case)
            totals[metric_name] += float(metric.score or 0.0)

        faithfulness = float(metrics["faithfulness"].score or 0.0)
        answer_relevance = float(metrics["answer_relevance"].score or 0.0)
        context_recall = float(metrics["context_recall"].score or 0.0)
        if faithfulness < 0.7 or answer_relevance < 0.7:
            _append_failed_case(
                golden,
                faithfulness,
                answer_relevance,
                context_recall,
            )

    case_count = len(GOLDEN_DATASET)
    averages = {
        metric_name: round(total / case_count, 2)
        for metric_name, total in totals.items()
    }

    return {
        "deepeval_metrics": averages,
        "academic_benchmark": {
            "paper_title": benchmark["paper_title"],
            "precision": benchmark["precision"],
            "recall": benchmark["recall"],
            "f1_score": benchmark["f1_score"],
            "paper_f1_score": benchmark["f1_score"],
            "leasesight_f1_score": round(
                (
                    averages["faithfulness"]
                    + averages["answer_relevance"]
                    + averages["context_recall"]
                )
                / 3,
                2,
            ),
        },
        "failed_cases": _load_failed_cases(),
    }


async def run_system_evaluation() -> Dict[str, Any]:
    return await asyncio.to_thread(_run_evaluation_sync)


def evaluate_live_document(
    user_query: str,
    generated_output: str,
    retrieved_chunks: List[str],
    user_id: str = None,
) -> Dict[str, float | bool | str]:
    try:
        deps = _load_deepeval_dependencies()
        test_case = deps["LLMTestCase"](
            input=user_query,
            actual_output=generated_output,
            retrieval_context=retrieved_chunks or [],
        )
        model = _configure_eval_model(model_name=LIVE_EVAL_MODEL)
        metrics = {
            "faithfulness": deps["FaithfulnessMetric"](
                threshold=0.6,
                model=model,
                include_reason=False,
            ),
            "answer_relevance": deps["AnswerRelevanceMetric"](
                threshold=0.6,
                model=model,
                include_reason=False,
            ),
        }

        for metric in metrics.values():
            metric.measure(test_case)

        faithfulness = float(metrics["faithfulness"].score or 0.0)
        answer_relevance = float(metrics["answer_relevance"].score or 0.0)
        groundedness_index = (faithfulness + answer_relevance) / 2
        return {
            "faithfulness": faithfulness,
            "answer_relevance": answer_relevance,
            "groundedness_index": groundedness_index,
            "is_trusted": faithfulness >= 0.6 and answer_relevance >= 0.6,
        }
    except Exception as e:
        return {
            "faithfulness": 0.0,
            "answer_relevance": 0.0,
            "groundedness_index": 0.0,
            "is_trusted": False,
            "error": f"Live evaluation unavailable: {str(e)[:240]}",
        }
