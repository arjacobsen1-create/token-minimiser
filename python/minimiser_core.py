"""
minimiser_core.py — the Python port of the Token Minimiser engine
(src/minimiser-core.js). Same rules, same predictions, same answers.

The Minimiser INTERVENES: it takes a prompt and returns a smaller prompt
that does the same job, minimising the TOTAL — input plus predicted
output — because a tiny prompt can trigger a huge, expensive answer.

Functions mirror the JS names in snake_case:
  countTokens -> count_tokens, detectTaskType -> detect_task_type,
  predictOutput -> predict_output, compressPrompt -> compress_prompt,
  minimiseReport -> minimise_report.
"""

import math
import re

# JS Math.round rounds halves up; Python's round() is banker's rounding.
def _round(x):
    return math.floor(x + 0.5)


# Prices checked 2026-11-08 against the providers' published pricing
# pages — same table as the Estimator, corrected the same day.
# Models and counting are shared, not defined here: they live in ONE
# canonical place, shared_models.py (byte-identical in the Estimator
# repo, the canonical source). The parity tests fail if the copies
# ever differ.
from shared_models import (
    MODELS,
    set_exact_counter,
    counting_method,
    count_tokens_heuristic,
    count_tokens,
)


TASK_TYPES = {
    "long-form": {
        "label": "Long-form document (pathway, roadmap, strategy, report, plan)",
        "typicalOutput": 2000,
        "formatHint": "a phased table with short bullet points",
    },
    "draft": {
        "label": "Draft / write (email, letter, post, section)",
        "typicalOutput": 800,
        "formatHint": "the draft only, no preamble or explanation",
    },
    "code": {
        "label": "Generate code",
        "typicalOutput": 1200,
        "formatHint": "code only, minimal comments",
    },
    "summarise": {
        "label": "Summarise",
        "typicalOutput": 0,  # input-dependent: ~25% of input, floor 80
        "formatHint": "bullet points only",
    },
    "extract": {
        "label": "Extract data",
        "typicalOutput": 0,  # input-dependent: ~35% of input, floor 100
        "formatHint": "a plain list, no commentary",
    },
    "translate": {
        "label": "Translate",
        "typicalOutput": 0,  # input-dependent: about the size of the input
        "formatHint": "the translation only",
    },
    "classify": {
        "label": "Classify / label",
        "typicalOutput": 15,
        "formatHint": "the label only",
    },
    "short-answer": {
        "label": "Short answer / chat reply",
        "typicalOutput": 300,
        "formatHint": "a direct answer, no preamble",
    },
}


def detect_task_type(text):
    t = (text or "").lower()
    if re.search(r"\b(classify|label|categorise|categorize|tag)\b", t):
        return "classify"
    if re.search(r"\b(extract|pull out|list the .* (from|in))\b", t):
        return "extract"
    if re.search(r"\b(summarise|summarize|summary|tl;?dr)\b", t):
        return "summarise"
    if re.search(r"\btranslate\b", t):
        return "translate"
    if re.search(r"\b(code|function|script|sql|regex|debug)\b", t):
        return "code"
    if re.search(r"\b(pathway|roadmap|strategy|strategic|transformation|report|plan|proposal|guide|blueprint|framework)\b", t):
        return "long-form"
    if re.search(r"\b(write|draft|compose|email|letter|post|article|essay)\b", t):
        return "draft"
    return "short-answer"


def predict_output(text, input_tokens, task_type):
    type_ = TASK_TYPES.get(task_type) or TASK_TYPES["short-answer"]
    if task_type == "summarise":
        return max(80, _round(input_tokens * 0.25))
    if task_type == "extract":
        return max(100, _round(input_tokens * 0.35))
    if task_type == "translate":
        return max(20, input_tokens)
    return type_["typicalOutput"]


def _round_to_50(n):
    return max(10, _round(n / 50) * 50)


def predict_output_range(text, input_tokens, task_type):
    typical = predict_output(text, input_tokens, task_type)
    if task_type == "classify":
        return {"low": 10, "typical": typical, "high": 20}
    if task_type == "translate":
        return {"low": _round(typical * 0.9), "typical": typical, "high": _round(typical * 1.1)}
    if task_type == "summarise":
        return {"low": max(50, _round(typical * 0.6)), "typical": typical, "high": _round(typical * 1.6)}
    if task_type == "extract":
        return {"low": max(50, _round(typical * 0.7)), "typical": typical, "high": _round(typical * 1.4)}
    return {"low": _round_to_50(typical * 0.55), "typical": typical, "high": _round_to_50(typical * 1.6)}


REPLACEMENTS = [(re.compile(r"\bin order to\b", re.I), "to")]

FILLER_PHRASES = [
    re.compile(r"\bplease note that\b", re.I),
    re.compile(r"\bi would like you to\b", re.I),
    re.compile(r"\bi want you to\b", re.I),
    re.compile(r"\bplease\b", re.I),
    re.compile(r"\bkindly\b", re.I),
    re.compile(r"\bas you know,?\b", re.I),
    re.compile(r"\bit is important to note that\b", re.I),
]


def compress_prompt(text):
    out = text
    for pattern, replacement in REPLACEMENTS:
        out = pattern.sub(replacement, out)
    for pattern in FILLER_PHRASES:
        out = pattern.sub("", out)
    out = re.sub(r"[ \t]+", " ", out)
    out = re.sub(r"\n{3,}", "\n\n", out)
    out = re.sub(r"\s+([.,!?;:])", r"\1", out)
    out = re.sub(r"([.!?])\s*,\s*", r"\1 ", out)
    out = re.sub(r",\s*,", ",", out)
    out = re.sub(r"^\s*[.,]\s*", "", out)
    out = out.strip()
    out = re.sub(r"([.!?]\s+)([a-z])", lambda m: m.group(1) + m.group(2).upper(), out)
    return (out[0].upper() + out[1:]) if out else out


CONTROL_LEVELS = {
    "gentle": {"label": "Gentle", "keep": 0.7},
    "balanced": {"label": "Balanced", "keep": 0.5},
    "aggressive": {"label": "Aggressive", "keep": 0.3},
}

OUTPUT_FLOORS = {"classify": 15, "long-form": 250, "draft": 150, "code": 200, "short-answer": 80}


def controlled_output(task_type, predicted_output, level="balanced"):
    if task_type in ("translate", "classify"):
        return predicted_output  # can't shrink these without losing the work
    keep = (CONTROL_LEVELS.get(level) or CONTROL_LEVELS["balanced"])["keep"]
    floor = OUTPUT_FLOORS.get(task_type, 50)
    return max(floor, _round(predicted_output * keep))


def output_control_clause(task_type, target_tokens):
    if task_type in ("translate", "classify"):
        return ""  # no useful cap exists
    hint = TASK_TYPES[task_type]["formatHint"]
    return f"Output: {hint}, max ~{target_tokens} tokens. No preamble or repetition."


def build_minimised_prompt(text, task_type=None, level=None, model_id=None):
    task_type = task_type or detect_task_type(text)
    input_tokens = count_tokens(text, model_id)
    predicted = predict_output(text, input_tokens, task_type)
    target = controlled_output(task_type, predicted, level or "balanced")
    compressed = compress_prompt(text)
    clause = output_control_clause(task_type, target)
    if clause:
        joined = (compressed if compressed.endswith((".", "!", "?")) else compressed + ".") + " " + clause
    else:
        joined = compressed
    return {
        "taskType": task_type,
        "taskLabel": TASK_TYPES[task_type]["label"],
        "predictedOutput": predicted,
        "outputRange": predict_output_range(text, input_tokens, task_type),
        "controlledOutput": target,
        "compressed": compressed,
        "clause": clause,
        "prompt": joined,
    }


def minimise_report(text, model_id=None, task_type=None, level=None):
    model = MODELS.get(model_id) or MODELS["gpt-6"]
    built = build_minimised_prompt(text, task_type=task_type, level=level, model_id=model_id)

    input_before = count_tokens(text, model_id)
    input_after = count_tokens(built["prompt"], model_id)  # includes the control clause's cost
    output_before = built["predictedOutput"]
    output_after = built["controlledOutput"]

    total_before = input_before + output_before
    total_after = input_after + output_after

    def cost(input_, output):
        return (input_ / 1e6) * model["inputPerMillion"] + (output / 1e6) * model["outputPerMillion"]

    cost_before = cost(input_before, output_before)
    cost_after = cost(input_after, output_after)

    rng = built["outputRange"]
    cost_before_range = {
        "low": cost(input_before, rng["low"]),
        "typical": cost_before,
        "high": cost(input_before, rng["high"]),
    }

    saved_total = total_before - total_after
    return {
        "model": model["label"],
        "taskType": built["taskType"],
        "taskLabel": built["taskLabel"],
        "compressed": built["prompt"],  # the full minimised prompt (compressed + control clause)
        "controlClause": built["clause"],
        # Input side ("before/after" have always meant the INPUT count)
        "before": input_before,
        "after": input_after,
        "savedTokens": input_before - input_after,  # can be negative — the clause costs input tokens on purpose
        "savedPct": _round(((input_before - input_after) / input_before) * 100) if input_before else 0,
        "savedCostPerRun": (input_before - input_after) / 1e6 * model["inputPerMillion"],
        # Output side (range = v0.3 honesty)
        "outputBefore": output_before,
        "outputRange": rng,
        "outputAfter": output_after,
        "savedOutputTokens": output_before - output_after,
        # Total — the number that actually matters
        "totalBefore": total_before,
        "totalAfter": total_after,
        "savedTotalTokens": saved_total,
        "savedTotalPct": _round((saved_total / total_before) * 100) if total_before else 0,
        "costBeforePerRun": cost_before,
        "costAfterPerRun": cost_after,
        "savedCostTotalPerRun": cost_before - cost_after,
        "costBeforeRangePerRun": cost_before_range,
        "costBeforePer1000Range": {
            "low": cost_before_range["low"] * 1000,
            "typical": cost_before_range["typical"] * 1000,
            "high": cost_before_range["high"] * 1000,
        },
        # HOW THE USER PAYS changes what a token "costs"
        "billingModes": {
            "api": {
                "label": "Pay-per-token (API)",
                "note": "The $ ranges in this report are real charges at this model's per-token rates.",
                "marginalCostPerRun": cost_before_range,
            },
            "subscription": {
                "label": "Flat subscription (flat monthly chat plans)",
                "note": "Marginal cost per run is $0 — the plan is already paid. Tokens still matter: long answers and long context burn your usage allowance and bring limits/throttling closer, and they use up context window.",
                "marginalCostPerRun": {"low": 0, "typical": 0, "high": 0},
            },
        },
    }


STRATEGIES = [
    {"id": "strip-filler", "name": "Strip filler and repetition", "lever": "compression",
     "typicalSaving": "10–55% of the instruction text",
     "note": "What the automatic compressor does. Politeness is for people."},
    {"id": "cap-output", "name": "Ask for the format, cap the length", "lever": "output",
     "typicalSaving": "output tokens cost 3–5x input — the answer is the bill",
     "note": "Now built into every minimised prompt (v0.2): the rewritten prompt carries a format + length cap, and the report shows input + predicted output as one total."},
    {"id": "summarise-history", "name": "Summarise old conversation turns", "lever": "context",
     "typicalSaving": "50–90% of the history portion",
     "note": "Old turns are resent every call. A rolling summary replaces them."},
    {"id": "retrieve-dont-paste", "name": "Retrieve chunks, don't paste whole documents", "lever": "context",
     "typicalSaving": "often 80%+ of the context portion",
     "note": "Send the paragraphs that matter, not the 40-page report."},
    {"id": "lean-format", "name": "Lean formats instead of JSON", "lever": "format",
     "typicalSaving": "20–40% on structured data",
     "note": "Braces, quotes and repeated keys are tokens too. Lists and CSV are leaner."},
    {"id": "cache-static", "name": "Cache the parts that never change", "lever": "billing",
     "typicalSaving": "up to ~90% on the cached portion",
     "note": "System prompts and reference docs resent every call can be prompt-cached at a discount."},
    {"id": "fewer-steps", "name": "Fewer agent round-trips", "lever": "architecture",
     "typicalSaving": "compounds — the deepest saving there is",
     "note": "Every agent step resends the whole context. Plan first, then execute in fewer steps."},
]
