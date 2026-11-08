/**
 * minimiser-core.js — the engine of the Token Minimiser app.
 *
 * The Estimator app MEASURES. This app INTERVENES:
 * it takes a prompt and returns a smaller prompt that does the same job,
 * plus the numbers that prove the saving.
 *
 * *** v0.2 — THE LESSON THE FOUNDING TEST TAUGHT US (29 Oct 2026) ***
 * v0.1 only counted and shrank the PROMPT (input tokens). That is not
 * the whole bill. A tiny prompt ("digital transformation pathway for a
 * 1000-employee company" — about 18 input tokens) can trigger a huge
 * answer, and OUTPUT tokens cost 3–5x more than input tokens.
 * So v0.2 minimises the TOTAL:
 *   1. INPUT  — compress the prompt (strip packaging, keep payload).
 *   2. OUTPUT — predict the answer size BY THE DELIVERABLE ASKED FOR
 *               (not by prompt length), then add an output-control
 *               clause to the rewritten prompt that caps it.
 * The control clause can make the prompt slightly LONGER while making
 * the total far cheaper. That trade is the whole point, and the report
 * shows it openly instead of hiding it.
 *
 *   countTokens()     — shared counting engine (same heuristic as the
 *                       Estimator; the two apps are siblings, not rivals)
 *   detectTaskType()  — what deliverable is this prompt asking for?
 *   predictOutput()   — how big an answer will that deliverable be?
 *   compressPrompt()  — rule-based compression: strip the packaging,
 *                       keep the payload
 *   minimiseReport()  — before/after INPUT, predicted OUTPUT, TOTAL
 *                       tokens, % saved and $ saved per model
 *   STRATEGIES        — the wider playbook rules alone can't do
 *
 * Read it top to bottom — it's written to be learned from.
 * See LEARNING.md for the matching lessons.
 */

"use strict";

// ---------------------------------------------------------------------------
// 1. COUNTING (shared with the Estimator app)
// ---------------------------------------------------------------------------
// v1 heuristic: tokens ≈ characters / charsPerToken, blended with a
// word-based estimate (words / 0.75). Production swaps this one function
// for each model's real tokenizer — nothing else changes.
// Prices are EDITABLE DEFAULTS — verify before relying on a $ figure.
// NOTE: models charge DIFFERENT prices for input and output tokens.
// Output is the expensive direction (here: 5x on the frontier models).
// ---------------------------------------------------------------------------

const MODELS = {
  "gpt-6": { label: "GPT-6 (frontier)", charsPerToken: 4.0, inputPerMillion: 5.0, outputPerMillion: 25.0 },
  "claude-opus-5": { label: "Claude Opus 5 (frontier)", charsPerToken: 3.9, inputPerMillion: 5.0, outputPerMillion: 25.0 },
  "claude-haiku-5-5": { label: "Claude Haiku 5.5 (fast/cheap)", charsPerToken: 3.9, inputPerMillion: 1.0, outputPerMillion: 5.0 },
  "gemini-4-argon": { label: "Gemini 4 Argon (frontier)", charsPerToken: 4.1, inputPerMillion: 4.0, outputPerMillion: 20.0 },
  "mercury-3": { label: "Mercury 3 (diffusion, speed)", charsPerToken: 4.0, inputPerMillion: 0.2, outputPerMillion: 0.7 },
};

function countTokens(text, modelId) {
  if (!text) return 0;
  const model = MODELS[modelId] || MODELS["gpt-6"];
  const byChars = text.length / model.charsPerToken;
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const byWords = words / 0.75;
  return Math.round((byChars + byWords) / 2);
}

// ---------------------------------------------------------------------------
// 2. WHAT DELIVERABLE IS BEING ASKED FOR? (output prediction)
// ---------------------------------------------------------------------------
// Output size follows the DELIVERABLE, not the prompt length.
// "Summarise this" over 5,000 tokens of report produces a small answer;
// 18 tokens asking for a transformation pathway produce a huge one.
// So each task type carries a TYPICAL answer size. Input-dependent
// types (summarise, extract, translate) scale with the input instead —
// the code says which is which, in the open.
// These are starting defaults, meant to be tuned from real usage.
// ---------------------------------------------------------------------------

const TASK_TYPES = {
  "long-form": {
    label: "Long-form document (pathway, roadmap, strategy, report, plan)",
    typicalOutput: 2000, // a pathway/roadmap answer, uncontrolled
    formatHint: "a phased table with short bullet points",
  },
  draft: {
    label: "Draft / write (email, letter, post, section)",
    typicalOutput: 800,
    formatHint: "the draft only, no preamble or explanation",
  },
  code: {
    label: "Generate code",
    typicalOutput: 1200,
    formatHint: "code only, minimal comments",
  },
  summarise: {
    label: "Summarise",
    typicalOutput: 0, // input-dependent: ~25% of input, floor 80
    formatHint: "bullet points only",
  },
  extract: {
    label: "Extract data",
    typicalOutput: 0, // input-dependent: ~35% of input, floor 100
    formatHint: "a plain list, no commentary",
  },
  translate: {
    label: "Translate",
    typicalOutput: 0, // input-dependent: about the size of the input
    formatHint: "the translation only",
  },
  classify: {
    label: "Classify / label",
    typicalOutput: 15,
    formatHint: "the label only",
  },
  "short-answer": {
    label: "Short answer / chat reply",
    typicalOutput: 300,
    formatHint: "a direct answer, no preamble",
  },
};

// Keyword detection — checked in order, first match wins. Long-form is
// checked before draft on purpose: "pathway" IS the deliverable, even
// when the prompt has no verb like "write" in it.
function detectTaskType(text) {
  const t = (text || "").toLowerCase();
  if (/\b(classify|label|categorise|categorize|tag)\b/.test(t)) return "classify";
  if (/\b(extract|pull out|list the .* (from|in))\b/.test(t)) return "extract";
  if (/\b(summarise|summarize|summary|tl;?dr)\b/.test(t)) return "summarise";
  if (/\btranslate\b/.test(t)) return "translate";
  if (/\b(code|function|script|sql|regex|debug)\b/.test(t)) return "code";
  if (/\b(pathway|roadmap|strategy|strategic|transformation|report|plan|proposal|guide|blueprint|framework)\b/.test(t)) return "long-form";
  if (/\b(write|draft|compose|email|letter|post|article|essay)\b/.test(t)) return "draft";
  return "short-answer";
}

function predictOutput(text, inputTokens, taskType) {
  const type = TASK_TYPES[taskType] || TASK_TYPES["short-answer"];
  if (taskType === "summarise") return Math.max(80, Math.round(inputTokens * 0.25));
  if (taskType === "extract") return Math.max(100, Math.round(inputTokens * 0.35));
  if (taskType === "translate") return Math.max(20, inputTokens);
  return type.typicalOutput;
}

// *** v0.3 — A PREDICTION IS A RANGE, NOT A NUMBER (29 Oct 2026) ***
// The follow-up doubt was correct: v0.2 showed "~2,200 out ·
// $0.033" in big bold type, and 2,200 was an assumed typical — a quick
// answer could be half of it, a thorough one half as much again.
// Presenting a guess as a point figure overstates certainty, so the
// prediction now carries a low–high band (roughly 0.55x–1.6x the
// typical for deliverable-sized tasks) and every cost derived from it
// is a range too. Fixed-size tasks (classify) and input-bound tasks
// (translate) get narrow bands, because their answers really are
// predictable. Round bands to the nearest 50 so they LOOK estimated.
function roundTo50(n) {
  return Math.max(10, Math.round(n / 50) * 50);
}

function predictOutputRange(text, inputTokens, taskType) {
  const typical = predictOutput(text, inputTokens, taskType);
  if (taskType === "classify") return { low: 10, typical, high: 20 };
  if (taskType === "translate")
    return { low: Math.round(typical * 0.9), typical, high: Math.round(typical * 1.1) };
  if (taskType === "summarise")
    return { low: Math.max(50, Math.round(typical * 0.6)), typical, high: Math.round(typical * 1.6) };
  if (taskType === "extract")
    return { low: Math.max(50, Math.round(typical * 0.7)), typical, high: Math.round(typical * 1.4) };
  return { low: roundTo50(typical * 0.55), typical, high: roundTo50(typical * 1.6) };
}

// ---------------------------------------------------------------------------
// 3. RULE-BASED COMPRESSION (the input side)
// ---------------------------------------------------------------------------
// Models don't need politeness filler, throat-clearing, or repeated
// instructions — people do. Stripping them costs the model nothing and
// saves tokens on EVERY call, forever. Rules first: predictable and free.
// (An AI rewriter can go further; it's the premium step, not the first one.)
// ---------------------------------------------------------------------------

const REPLACEMENTS = [[/\bin order to\b/gi, "to"]];

const FILLER_PHRASES = [
  /\bplease note that\b/gi,
  /\bi would like you to\b/gi,
  /\bi want you to\b/gi,
  /\bplease\b/gi,
  /\bkindly\b/gi,
  /\bas you know,?\b/gi,
  /\bit is important to note that\b/gi,
];

function compressPrompt(text) {
  let out = text;
  for (const [pattern, replacement] of REPLACEMENTS) {
    out = out.replace(pattern, replacement);
  }
  for (const pattern of FILLER_PHRASES) {
    out = out.replace(pattern, "");
  }
  out = out
    .replace(/[ \t]+/g, " ") // collapse runs of spaces
    .replace(/\n{3,}/g, "\n\n") // collapse blank-line piles
    .replace(/\s+([.,!?;:])/g, "$1") // tidy spaces left before punctuation
    .replace(/([.!?])\s*,\s*/g, "$1 ") // filler removal can leave "report., we" — tidy it
    .replace(/,\s*,/g, ",") // and doubled commas
    .replace(/^\s*[.,]\s*/, "") // a leading orphan punctuation mark
    .trim();
  // A sentence that survives compression starts capitalised, even if
  // filler removal exposed it mid-string ("...report. we need...").
  out = out.replace(/([.!?]\s+)([a-z])/g, (m, p, c) => p + c.toUpperCase());
  // Capitalise the first letter — compression shouldn't look sloppy.
  return out ? out.charAt(0).toUpperCase() + out.slice(1) : out;
}

// ---------------------------------------------------------------------------
// 4. OUTPUT CONTROL (the output side — where the real money is)
// ---------------------------------------------------------------------------
// The strongest minimising move for most prompts is not shrinking the
// question, it's capping the answer: name the format, cap the length.
// Levels mirror the compression levels the app already offers:
//   gentle   — keep ~70% of the typical answer
//   balanced — keep ~50%
//   aggressive — keep ~30% (never below a usable floor per type)
// The clause COSTS a few input tokens. The report counts that cost
// honestly — total is what matters, not prompt length alone.
// ---------------------------------------------------------------------------

const CONTROL_LEVELS = {
  gentle: { label: "Gentle", keep: 0.7 },
  balanced: { label: "Balanced", keep: 0.5 },
  aggressive: { label: "Aggressive", keep: 0.3 },
};

const OUTPUT_FLOORS = { classify: 15, "long-form": 250, draft: 150, code: 200, "short-answer": 80 };

function controlledOutput(taskType, predictedOutput, level = "balanced") {
  if (taskType === "translate" || taskType === "classify") return predictedOutput; // can't shrink these without losing the work
  const keep = (CONTROL_LEVELS[level] || CONTROL_LEVELS.balanced).keep;
  const floor = OUTPUT_FLOORS[taskType] || 50;
  return Math.max(floor, Math.round(predictedOutput * keep));
}

function outputControlClause(taskType, targetTokens) {
  if (taskType === "translate" || taskType === "classify") return ""; // no useful cap exists
  const hint = TASK_TYPES[taskType].formatHint;
  return `Output: ${hint}, max ~${targetTokens} tokens. No preamble or repetition.`;
}

// Build the full minimised prompt: compressed question + control clause.
function buildMinimisedPrompt(text, opts = {}) {
  const taskType = opts.taskType || detectTaskType(text);
  const inputTokens = countTokens(text, opts.modelId);
  const predicted = predictOutput(text, inputTokens, taskType);
  const target = controlledOutput(taskType, predicted, opts.level || "balanced");
  const compressed = compressPrompt(text);
  const clause = outputControlClause(taskType, target);
  // Join cleanly: the clause is its own sentence, so the compressed
  // prompt needs terminal punctuation before it.
  const joined = clause
    ? `${/[.!?]$/.test(compressed) ? compressed : compressed + "."} ${clause}`
    : compressed;
  return {
    taskType,
    taskLabel: TASK_TYPES[taskType].label,
    predictedOutput: predicted,
    outputRange: predictOutputRange(text, inputTokens, taskType),
    controlledOutput: target,
    compressed,
    clause,
    prompt: joined,
  };
}

// ---------------------------------------------------------------------------
// 5. THE REPORT — input + output = total, before and after
// ---------------------------------------------------------------------------
// Cost per side uses that side's own price: input tokens are billed at
// inputPerMillion, output tokens at outputPerMillion. The $ saving is
// almost always dominated by the output side — the report shows both
// so the user can see WHY the total moved.
// ---------------------------------------------------------------------------

function minimiseReport(text, modelId, opts = {}) {
  const model = MODELS[modelId] || MODELS["gpt-6"];
  const built = buildMinimisedPrompt(text, { ...opts, modelId });

  const inputBefore = countTokens(text, modelId);
  const inputAfter = countTokens(built.prompt, modelId); // includes the control clause's cost
  const outputBefore = built.predictedOutput;
  const outputAfter = built.controlledOutput;

  const totalBefore = inputBefore + outputBefore;
  const totalAfter = inputAfter + outputAfter;

  const cost = (input, output) =>
    (input / 1e6) * model.inputPerMillion + (output / 1e6) * model.outputPerMillion;
  const costBefore = cost(inputBefore, outputBefore);
  const costAfter = cost(inputAfter, outputAfter);

  // v0.3: every $ figure is a RANGE, derived from the output range —
  // and every $ figure is API-EQUIVALENT cost (see billingModes below).
  const range = built.outputRange;
  const costBeforeRange = {
    low: cost(inputBefore, range.low),
    typical: costBefore,
    high: cost(inputBefore, range.high),
  };

  const savedTotal = totalBefore - totalAfter;
  return {
    model: model.label,
    taskType: built.taskType,
    taskLabel: built.taskLabel,
    compressed: built.prompt, // the full minimised prompt (compressed + control clause)
    controlClause: built.clause,
    // Input side (field names kept from v0.1 so existing callers work;
    // "before/after" have always meant the INPUT count)
    before: inputBefore,
    after: inputAfter,
    savedTokens: inputBefore - inputAfter, // can be negative — the clause costs input tokens on purpose
    savedPct: inputBefore ? Math.round(((inputBefore - inputAfter) / inputBefore) * 100) : 0,
    savedCostPerRun: (inputBefore - inputAfter) / 1e6 * model.inputPerMillion,
    // Output side (new in v0.2; range added in v0.3)
    outputBefore,
    outputRange: range,
    outputAfter,
    savedOutputTokens: outputBefore - outputAfter,
    // Total (new in v0.2 — the number that actually matters)
    totalBefore,
    totalAfter,
    savedTotalTokens: savedTotal,
    savedTotalPct: totalBefore ? Math.round((savedTotal / totalBefore) * 100) : 0,
    costBeforePerRun: costBefore,
    costAfterPerRun: costAfter,
    savedCostTotalPerRun: costBefore - costAfter,
    // v0.3 ranges + volume context (API-equivalent $)
    costBeforeRangePerRun: costBeforeRange,
    costBeforePer1000Range: {
      low: costBeforeRange.low * 1000,
      typical: costBeforeRange.typical * 1000,
      high: costBeforeRange.high * 1000,
    },
    // *** HOW THE USER PAYS changes what a token "costs" (v0.3) ***
    // The point: a user on a flat monthly subscription can ask the
    // same question there — no $0.033 charge appears. Both framings are
    // true; they are true for DIFFERENT users, and an app that shows
    // only the $ misleads the majority, who are on subscriptions.
    billingModes: {
      api: {
        label: "Pay-per-token (API)",
        note: "The $ ranges in this report are real charges at this model's per-token rates.",
        marginalCostPerRun: costBeforeRange,
      },
      subscription: {
        label: "Flat subscription (flat monthly chat plans)",
        note: "Marginal cost per run is $0 — the plan is already paid. Tokens still matter: long answers and long context burn your usage allowance and bring limits/throttling closer, and they use up context window.",
        marginalCostPerRun: { low: 0, typical: 0, high: 0 },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// 6. THE WIDER PLAYBOOK
// ---------------------------------------------------------------------------
// Compression is one lever. These are the others — the app surfaces the
// right ones based on what it sees in the prompt (long history? JSON?
// repeated context?), with typical saving ranges.
// ---------------------------------------------------------------------------

const STRATEGIES = [
  {
    id: "strip-filler",
    name: "Strip filler and repetition",
    lever: "compression",
    typicalSaving: "10–55% of the instruction text",
    note: "What the automatic compressor does. Politeness is for people.",
  },
  {
    id: "cap-output",
    name: "Ask for the format, cap the length",
    lever: "output",
    typicalSaving: "output tokens cost 3–5x input — the answer is the bill",
    note: "Now built into every minimised prompt (v0.2): the rewritten prompt carries a format + length cap, and the report shows input + predicted output as one total.",
  },
  {
    id: "summarise-history",
    name: "Summarise old conversation turns",
    lever: "context",
    typicalSaving: "50–90% of the history portion",
    note: "Old turns are resent every call. A rolling summary replaces them.",
  },
  {
    id: "retrieve-dont-paste",
    name: "Retrieve chunks, don't paste whole documents",
    lever: "context",
    typicalSaving: "often 80%+ of the context portion",
    note: "Send the paragraphs that matter, not the 40-page report.",
  },
  {
    id: "lean-format",
    name: "Lean formats instead of JSON",
    lever: "format",
    typicalSaving: "20–40% on structured data",
    note: "Braces, quotes and repeated keys are tokens too. Lists and CSV are leaner.",
  },
  {
    id: "cache-static",
    name: "Cache the parts that never change",
    lever: "billing",
    typicalSaving: "up to ~90% on the cached portion",
    note: "System prompts and reference docs resent every call can be prompt-cached at a discount.",
  },
  {
    id: "fewer-steps",
    name: "Fewer agent round-trips",
    lever: "architecture",
    typicalSaving: "compounds — the deepest saving there is",
    note: "Every agent step resends the whole context. Plan first, then execute in fewer steps.",
  },
];

module.exports = {
  MODELS,
  TASK_TYPES,
  CONTROL_LEVELS,
  STRATEGIES,
  countTokens,
  detectTaskType,
  predictOutput,
  predictOutputRange,
  controlledOutput,
  outputControlClause,
  compressPrompt,
  buildMinimisedPrompt,
  minimiseReport,
};
