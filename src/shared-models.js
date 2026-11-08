/**
 * shared-models.js — the shared pricing and counting engine.
 *
 * ONE canonical place for the model price table and the token
 * counter, used by BOTH products in the Token Estimator family:
 * the Estimator engine (token-core.js) and the Minimiser engine
 * (minimiser-core.js). This file exists byte-identical in both
 * repos; the canonical source is the Token Estimator repo, and the
 * parity tests fail if the copies ever differ. When a price changes,
 * it changes here, once, and both apps pick it up.
 *
 * Read the price table's own notes: rates are checked against the
 * providers' published pages, and a rate with a tier or a date on it
 * says so in its priceNote.
 */

"use strict";

// ---------------------------------------------------------------------------
// 1. MODEL PROFILES
// ---------------------------------------------------------------------------
// Each model needs two things:
//   charsPerToken — how its tokenizer slices text (a v1 heuristic, see
//                   LEARNING.md Lesson 1). Prose in English averages ~4.
//                   Code and JSON slice into more tokens, so their effective
//                   chars-per-token is lower.
//   inputPerMillion / outputPerMillion — price in USD per 1M tokens.
//                   *** EDITABLE DEFAULTS — checked 2026-11-08 against the
//                   providers' published pricing pages. Rates move; check
//                   the page again before relying on any figure. ***
//   priceNote (where present) — a tier or a date the single rate hides.
//                   A rate with a date on it is a fact; without one it is
//                   a guess. Pricing history: before 2026-11-08 this table
//                   carried an illustrative $5/$25 "GPT-6" and Haiku 4.5's
//                   $1/$5 against Haiku 5.5's name; a pricing audit against
//                   the published pages corrected both, on the record.
// ---------------------------------------------------------------------------

const MODELS = {
  "gpt-6": {
    label: "GPT-6 Sol (frontier)",
    charsPerToken: 4.0,
    inputPerMillion: 2.0,
    outputPerMillion: 10.0,
    tokenizer: "o200k_base", // exact counting available for this family
  },
  "gpt-6-astra": {
    label: "GPT-6 Astra (premium frontier)",
    charsPerToken: 4.0,
    inputPerMillion: 10.0,
    outputPerMillion: 50.0,
    tokenizer: "o200k_base",
  },
  "claude-opus-5": {
    label: "Claude Opus 5 (frontier)",
    charsPerToken: 3.9,
    inputPerMillion: 5.0,
    outputPerMillion: 25.0,
  },
  "claude-haiku-5-5": {
    label: "Claude Haiku 5.5 (fast/cheap)",
    charsPerToken: 3.9,
    inputPerMillion: 0.1,
    outputPerMillion: 0.5,
    priceNote: "Rate for prompts up to 100K tokens; $0.50 / $2.50 above 100K.",
  },
  "gemini-4-argon": {
    label: "Gemini 4 Argon (frontier)",
    charsPerToken: 4.1,
    inputPerMillion: 4.0,
    outputPerMillion: 20.0,
    priceNote: "Standard rate from 1 Dec 2026; introductory $2 / $10 through 30 Nov 2026.",
  },
  "mercury-3": {
    label: "Mercury 3 (diffusion, speed)",
    charsPerToken: 4.0,
    inputPerMillion: 0.2, // list price; a launch promotion halves it
    outputPerMillion: 0.7,
    priceNote: "List price; the launch promotion is half this.",
  },
};

// ---------------------------------------------------------------------------
// 2. COUNTING
// ---------------------------------------------------------------------------
// v1 heuristic: tokens ≈ characters / charsPerToken, blended with a
// word-based estimate (words / 0.75). Taking the average of the two is more
// stable than either alone across prose, code and lists.
// The production version replaces ONLY this function with the model's real
// tokenizer — everything else in the app stays the same.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// ACCURACY — read this before trusting a count (added 2026-11-08).
// The heuristic below was measured against real tokenizers on a golden
// set of ten texts (test/accuracy.mjs, ACCURACY.md). Verdict: fine on
// short plain prose (±12%), but it overstates long prose by ~30% and
// understates code, JSON and number-heavy text by 35–60%. A number that
// wrong is not a count, it's a guess — so:
//   * Models with a published tokenizer (the GPT family, o200k_base)
//     can be counted EXACTLY once a real counter is wired in with
//     setExactCounter() — the demo pages load one; Node users can pass
//     gpt-tokenizer's encode. Exact beats estimated, always.
//   * Models without a public tokenizer (Claude and others) stay
//     estimates, labelled as such, with the measured error published.
// ---------------------------------------------------------------------------

let exactCounter = null;

/** Wire in a real tokenizer: setExactCounter(text => encode(text).length). */
function setExactCounter(fn) {
  exactCounter = fn;
}

/** "exact" when a real tokenizer is wired for this model, else "estimate". */
function countingMethod(modelId) {
  const model = MODELS[modelId] || MODELS["gpt-6"];
  return exactCounter && model.tokenizer ? "exact" : "estimate";
}

function countTokensHeuristic(text, modelId) {
  if (!text) return 0;
  const model = MODELS[modelId] || MODELS["gpt-6"];
  const byChars = text.length / model.charsPerToken;
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const byWords = words / 0.75;
  return Math.round((byChars + byWords) / 2);
}

function countTokens(text, modelId) {
  if (!text) return 0;
  const model = MODELS[modelId] || MODELS["gpt-6"];
  if (exactCounter && model.tokenizer) return exactCounter(text);
  return countTokensHeuristic(text, modelId);
}


module.exports = {
  MODELS,
  setExactCounter,
  countingMethod,
  countTokensHeuristic,
  countTokens,
};
