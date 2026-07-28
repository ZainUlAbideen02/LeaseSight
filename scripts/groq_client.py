# scripts/groq_client.py
# Groq LLM wrapper for LeaseSight REASONING tasks (drop-in replacement for GeminiChatClient).
# Uses the official groq SDK with ultra-low-latency LPU inference.
#
# Interface matches GeminiChatClient for seamless integration:
#   from scripts.groq_client import GroqChatClient
#   chat = GroqChatClient()
#   result = chat.complete_json(system_prompt, user_content, "AUDIT")

import os
from dotenv import load_dotenv

# Environment sanitization (matching api/main.py pattern)
os.environ.pop("GOOGLE_API_KEY", None)
os.environ.pop("GEMINI_API_KEY", None)
load_dotenv()
working_key = os.getenv("GROQ_API_KEY", "")
os.environ["GROQ_API_KEY"] = working_key

import time
import json
import logging
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

try:
    from groq import Groq
    _GROQ_AVAILABLE = True
except ImportError:
    _GROQ_AVAILABLE = False

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

CHAT_MODEL = "llama-3.3-70b-versatile"  # Ultra-fast, high-quality reasoning
FALLBACK_MODEL = "mixtral-8x7b-32768"   # Alternative if primary unavailable


def _clean_secret(value: Optional[str]) -> Optional[str]:
    if not value:
        return value
    return value.strip().strip('"').strip("'")


def _strip_json_fence(text: str) -> str:
    """Remove ```json ... ``` fences that Groq may wrap output in."""
    text = text.strip()
    import re
    text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s*```$", "", text)
    return text.strip()


# ---------------------------------------------------------------------------
# GroqChatClient  (reasoning / audit tasks only)
# ---------------------------------------------------------------------------

class GroqChatClient:
    """
    JSON-mode Groq chat client with exponential backoff.
    Uses the official groq SDK for ultra-low-latency LPU inference.

    Interface matches GeminiChatClient for drop-in replacement.
    Supports structured JSON output via response_format.

    Responsibilities:
      - Agent prompts: MINER, JUDGE, CLERK, AUDIT
      - Entity extraction (api/processor.py)
      - Document Q&A (scripts/query_engine.py)
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        temperature: float = 0.1,
        max_retries: int = 4,
    ):
        if not _GROQ_AVAILABLE:
            raise ImportError(
                "groq is not installed. Run: pip install groq"
            )

        self._api_key = _clean_secret(api_key or os.getenv("GROQ_API_KEY"))
        if not self._api_key:
            raise ValueError("GROQ_API_KEY not found in environment.")

        os.environ["GROQ_API_KEY"] = self._api_key
        self._client = Groq(api_key=self._api_key)
        self._model_name = model or os.getenv("AUDIT_MODEL", CHAT_MODEL)
        self._temperature = temperature
        self._max_retries = max_retries

        logger.info("[GroqChatClient] Initialized with model=%s, temperature=%s", 
                    self._model_name, self._temperature)

    # ------------------------------------------------------------------ #

    def complete_json(
        self,
        system_prompt: str,
        user_content: str,
        agent_name: str = "Agent",
    ) -> Dict[str, Any]:
        """Call Groq and return a parsed JSON dict."""

        last_exc: Optional[Exception] = None

        for attempt in range(self._max_retries):
            try:
                # Groq API call with JSON response format constraint
                response = self._client.chat.completions.create(
                    model=self._model_name,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_content},
                    ],
                    temperature=self._temperature,
                    response_format={"type": "json_object"},  # Enforce JSON output
                    max_tokens=4096,
                )

                raw = response.choices[0].message.content if response.choices else ""
                cleaned = _strip_json_fence(raw)

                if not cleaned:
                    raise ValueError(f"{agent_name}: Empty response from Groq")

                return json.loads(cleaned)

            except json.JSONDecodeError as exc:
                last_exc = exc
                logger.warning("[%s] JSON parse error on attempt %d/%d: %s",
                               agent_name, attempt + 1, self._max_retries, str(exc)[:200])
                if attempt < self._max_retries - 1:
                    time.sleep(2 * (attempt + 1))
                    continue
                raise RuntimeError(
                    f"{agent_name}: Groq returned malformed JSON after "
                    f"{self._max_retries} attempts. Last error: {exc}"
                ) from exc

            except Exception as exc:
                last_exc = exc
                msg = str(exc).lower()

                # Auth errors are fatal; don't retry
                if any(k in msg for k in ("api_key", "unauthorized", "permission", "credential")):
                    raise RuntimeError(
                        f"{agent_name}: Groq auth error. Last error: {exc}"
                    ) from exc

                logger.warning("[%s] attempt %d/%d failed: %s",
                               agent_name, attempt + 1, self._max_retries, str(exc)[:300])

                # Rate limit / transient errors: retry with backoff
                if attempt < self._max_retries - 1:
                    wait = max(5.0 * (attempt + 1), min(8 * (2 ** attempt), 64))
                    logger.info("[%s] Retrying in %.1f s (rate limit / transient)...", agent_name, wait)
                    time.sleep(wait)
                    continue

                raise RuntimeError(
                    f"{agent_name}: Groq call failed after {self._max_retries} attempts. "
                    f"Last error: {exc}"
                ) from exc

        raise RuntimeError(f"{agent_name}: Exceeded {self._max_retries} retries.")

    def complete(
        self,
        system_prompt: str,
        user_content: str,
        agent_name: str = "Agent",
    ) -> str:
        """Call Groq and return plain text response (no JSON parsing)."""
        last_exc: Optional[Exception] = None

        for attempt in range(self._max_retries):
            try:
                response = self._client.chat.completions.create(
                    model=self._model_name,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_content},
                    ],
                    temperature=self._temperature,
                    max_tokens=4096,
                )

                text = response.choices[0].message.content if response.choices else ""
                if not text:
                    raise ValueError(f"{agent_name}: Empty response from Groq")
                return text

            except Exception as exc:
                last_exc = exc
                msg = str(exc).lower()

                if any(k in msg for k in ("api_key", "unauthorized", "permission", "credential")):
                    raise RuntimeError(
                        f"{agent_name}: Groq auth error. Last error: {exc}"
                    ) from exc

                logger.warning("[%s] attempt %d/%d failed: %s",
                               agent_name, attempt + 1, self._max_retries, str(exc)[:300])

                if attempt < self._max_retries - 1:
                    wait = max(5.0 * (attempt + 1), min(8 * (2 ** attempt), 64))
                    logger.info("[%s] Retrying in %.1f s (rate limit / transient)...", agent_name, wait)
                    time.sleep(wait)
                    continue

                raise RuntimeError(
                    f"{agent_name}: Groq call failed after {self._max_retries} attempts. "
                    f"Last error: {exc}"
                ) from exc

        raise RuntimeError(f"{agent_name}: Exceeded {self._max_retries} retries.")

    def smoke_test(self) -> str:
        """Perform a real Groq generation call for connection diagnostics."""
        try:
            response = self._client.chat.completions.create(
                model=self._model_name,
                messages=[
                    {"role": "user", "content": "Reply with the word 'ok'."},
                ],
                temperature=0,
                max_tokens=64,
            )

            text = (response.choices[0].message.content or "").strip()
            if not text:
                raise RuntimeError("Groq smoke test returned an empty response.")
            return text

        except Exception as e:
            raise RuntimeError(f"Groq smoke test failed: {e}") from e


def _get_mock_response(agent_name: str, user_content: str) -> Dict[str, Any]:
    """Provides structured mock responses when Groq is unavailable."""
    agent_upper = str(agent_name).upper()
    if "AUDIT" in agent_upper:
        return {
            "findings": [
                {
                    "clause_name": "Governing Law",
                    "evidence_quote": "This Agreement shall be governed by and construed in accordance with the laws of the State of Delaware.",
                    "audit_finding": "The contract is governed by Delaware law, which is standard for corporate agreements.",
                    "compliance_status": "COMPLIANT",
                    "risk_level": "LOW",
                    "action_required": "None."
                }
            ],
            "obligations": [
                {
                    "obligation_name": "Supply Obligation",
                    "due_date": "Ongoing",
                    "evidence_quote": "The Manufacturer agrees to supply organic preparations to the Customer.",
                    "audit_finding": "Ongoing obligation to supply designated products.",
                    "compliance_status": "COMPLIANT",
                    "risk_level": "LOW",
                    "action_required": "Monitor product quality."
                }
            ],
            "risk_score": 15
        }
    elif "MINER" in agent_upper or "EXTRACT" in agent_upper:
        return {
            "extracted_entities": {
                "governing_law": "Delaware",
                "termination_notice": "90 days",
                "payment_terms": "Net 30"
            }
        }
    else:
        return {"answer": "Fallback response: Unable to reach Groq service."}
