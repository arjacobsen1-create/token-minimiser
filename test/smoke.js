/**
 * smoke.js — the proof this engine works. Run:  node test/smoke.js
 * Exits 0 and prints PASS lines when every check holds; exits 1 otherwise.
 */
const assert = require("node:assert");
const { minimiseReport, compressPrompt, controlledOutput } = require("../src/minimiser-core");

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log("PASS  " + name);
}

// 1. The founding lesson: a tiny prompt can predict a huge output.
check("tiny prompt, output predicted far larger than input", () => {
  const r = minimiseReport(
    "I want a digital transformation pathway for a company with 1000 employees",
    "gpt-6"
  );
  assert.ok(r.before <= 25, `input should be tiny, got ${r.before}`);
  assert.ok(r.outputRange.high > r.before * 10, "predicted output should dwarf the input");
  assert.ok(r.outputRange.low <= r.outputRange.high);
});

// 2. A wordy prompt comes back smaller in total.
check("wordy prompt shrinks in total", () => {
  const r = minimiseReport(
    "Please note that I would like you to please summarise the attached report. " +
      "As you know, it is important to note that we need the summary in order to brief the team. " +
      "Please keep it short.",
    "gpt-6"
  );
  assert.ok(r.totalAfter < r.totalBefore, `${r.totalAfter} !< ${r.totalBefore}`);
  assert.ok(r.savedTotalPct > 0);
});

// 3. Both billing framings are always reported.
check("report carries API and subscription framings", () => {
  const r = minimiseReport("Summarise this report for the team", "gpt-6");
  assert.ok(r.billingModes.api, "missing API framing");
  assert.ok(r.billingModes.subscription, "missing subscription framing");
  assert.strictEqual(r.billingModes.subscription.marginalCostPerRun.typical, 0);
});

// 4. Compression is deterministic: same input, same output.
check("compressPrompt is deterministic", () => {
  const t = "Please note that I would like you to please draft a short summary.";
  assert.strictEqual(compressPrompt(t), compressPrompt(t));
});

// 5–7. The 2026-11-09 fixes, held as golden tests (MINIMISER-FIX-SPEC).
const DEMO_TEXT =
  "Please note that I would like you to please summarise the attached quarterly supplier performance report for me. " +
  "The report is quite long and it contains a lot of detailed information about delivery performance and freight costs and capacity issues. " +
  "Please keep your summary nice and short and please focus mainly on the most important key points that I really need to know about. " +
  "Thank you very much in advance for your help with this.";

check("demo text: sentence-level politeness stripped, instruction survives", () => {
  const c = compressPrompt(DEMO_TEXT);
  assert.ok(!/thank you/i.test(c), "a thank-you formula survived compression");
  assert.ok(c.includes("Summarise the attached quarterly supplier performance report"));
  assert.ok(c.includes("most important key points"), "the user's own instruction must survive");
});

check("output control bites at small sizes: summarise/80 → 56/40/25", () => {
  assert.strictEqual(controlledOutput("summarise", 80, "gentle"), 56);
  assert.strictEqual(controlledOutput("summarise", 80, "balanced"), 40);
  assert.strictEqual(controlledOutput("summarise", 80, "aggressive"), 25);
});

check("report splits the input honestly: compressed + clause = after", () => {
  const r = minimiseReport(DEMO_TEXT, "gpt-6");
  assert.strictEqual(r.inputCompressed + r.clauseTokens, r.after);
  assert.ok(r.clauseTokens > 0, "a summarise report carries a control clause");
  const t = minimiseReport("Translate this letter into French.", "gpt-6");
  assert.strictEqual(t.taskType, "translate");
  assert.strictEqual(t.clauseTokens, 0, "translate carries no clause");
});

console.log(`\n${passed}/7 checks passed — the Token Minimiser engine works.`);
