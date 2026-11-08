"""
shared_models.py — the shared pricing and counting engine.

ONE canonical place for the model price table and the token counter,
used by BOTH Python ports (token_core.py and minimiser_core.py).
This file exists byte-identical in both repos; the canonical source
is the Token Estimator repo, and the parity tests fail if the copies
ever differ. Mirror of src/shared-models.js.
"""

import math


# JS Math.round rounds halves up; Python's round() is banker's rounding.
def _round(x):
    return math.floor(x + 0.5)


MODELS = {
    "gpt-6": {
        "label": "GPT-6 Sol (frontier)",
        "charsPerToken": 4.0,
        "inputPerMillion": 2.0,
        "outputPerMillion": 10.0,
        "tokenizer": "o200k_base",  # exact counting available for this family
    },
    "gpt-6-astra": {
        "label": "GPT-6 Astra (premium frontier)",
        "charsPerToken": 4.0,
        "inputPerMillion": 10.0,
        "outputPerMillion": 50.0,
        "tokenizer": "o200k_base",
    },
    "claude-opus-5": {
        "label": "Claude Opus 5 (frontier)",
        "charsPerToken": 3.9,
        "inputPerMillion": 5.0,
        "outputPerMillion": 25.0,
    },
    "claude-haiku-5-5": {
        "label": "Claude Haiku 5.5 (fast/cheap)",
        "charsPerToken": 3.9,
        "inputPerMillion": 0.1,
        "outputPerMillion": 0.5,
        "priceNote": "Rate for prompts up to 100K tokens; $0.50 / $2.50 above 100K.",
    },
    "gemini-4-argon": {
        "label": "Gemini 4 Argon (frontier)",
        "charsPerToken": 4.1,
        "inputPerMillion": 4.0,
        "outputPerMillion": 20.0,
        "priceNote": "Standard rate from 1 Dec 2026; introductory $2 / $10 through 30 Nov 2026.",
    },
    "mercury-3": {
        "label": "Mercury 3 (diffusion, speed)",
        "charsPerToken": 4.0,
        "inputPerMillion": 0.2,  # list price; a launch promotion halves it
        "outputPerMillion": 0.7,
        "priceNote": "List price; the launch promotion is half this.",
    },
}


# ACCURACY (2026-11-08): the heuristic below was measured against real
# tokenizers on a golden set (see ACCURACY.md in this repo). It overstates
# long prose by ~30% and understates code, JSON and number-heavy text by
# 35-60%. Models with a published tokenizer (GPT family, o200k_base) can
# be counted EXACTLY once a real counter is wired in, e.g.:
#   import tiktoken
#   enc = tiktoken.get_encoding("o200k_base")
#   set_exact_counter(lambda text: len(enc.encode(text)))
# Everything else stays a labelled estimate with the measured error
# published.
_exact_counter = None


def set_exact_counter(fn):
    """Wire in a real tokenizer: set_exact_counter(fn) where fn(text)->int."""
    global _exact_counter
    _exact_counter = fn


def counting_method(model_id=None):
    """"exact" when a real tokenizer is wired for this model, else "estimate"."""
    model = MODELS.get(model_id) or MODELS["gpt-6"]
    return "exact" if (_exact_counter and model.get("tokenizer")) else "estimate"


def count_tokens_heuristic(text, model_id=None):
    if not text:
        return 0
    model = MODELS.get(model_id) or MODELS["gpt-6"]
    by_chars = len(text) / model["charsPerToken"]
    words = len(text.split())
    by_words = words / 0.75
    return _round((by_chars + by_words) / 2)


def count_tokens(text, model_id=None):
    if not text:
        return 0
    model = MODELS.get(model_id) or MODELS["gpt-6"]
    if _exact_counter and model.get("tokenizer"):
        return _exact_counter(text)
    return count_tokens_heuristic(text, model_id)


def analyse_prompt(parts, model_id=None):
    """parts: dict with any of system / context / history / question."""
    result = {}
    total = 0
    for name, text in parts.items():
        tokens = count_tokens(text or "", model_id)
        result[name] = tokens
        total += tokens
    result["total"] = total
    for name in parts:
        result[name + "Pct"] = _round((result[name] / total) * 100) if total else 0
    return result
