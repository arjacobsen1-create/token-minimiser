/**
 * demo.js — run the minimiser from the command line:  node src/demo.js
 * Change the example prompts, run it again, watch the totals move.
 */

const { minimiseReport, STRATEGIES } = require("./minimiser-core");

function show(text, modelIds = ["gpt-6"]) {
  console.log("=".repeat(72));
  console.log("PROMPT: " + text + "\n");
  for (const modelId of modelIds) {
    const r = minimiseReport(text, modelId);
    console.log(r.model + " — task detected: " + r.taskLabel);
    console.log(r.clauseTokens > 0
      ? `  Input:  ${r.before} -> ${r.inputCompressed} · +${r.clauseTokens} clause = ${r.after} tokens`
      : `  Input:  ${r.before} -> ${r.after} tokens`);
    console.log(`  Output: predicted ${r.outputBefore} (range ${r.outputRange.low}-${r.outputRange.high}) -> capped ${r.outputAfter} tokens`);
    console.log(`  TOTAL:  ${r.totalBefore} -> ${r.totalAfter} tokens (saved ${r.savedTotalPct}%)`);
    console.log(`  API-equivalent cost/run: $${r.costBeforeRangePerRun.low.toFixed(3)}-$${r.costBeforeRangePerRun.high.toFixed(3)} (typical $${r.costBeforePerRun.toFixed(3)}) -> $${r.costAfterPerRun.toFixed(3)} capped`);
    console.log(`  Same at volume: $${r.costBeforePer1000Range.low.toFixed(0)}-$${r.costBeforePer1000Range.high.toFixed(0)} per 1,000 runs`);
    console.log(`  On a flat subscription: $0 marginal per run — tokens burn usage allowance, not dollars.`);
    console.log("  Minimised prompt: " + r.compressed + "\n");
  }
}

// Example 1 — the founding test (29 Oct 2026): a tiny prompt, a huge answer.
// v0.1 reported "18 tokens" and stopped there. v0.2 shows the total.
show("I want a digital transformation pathway for a company with 1000 employees", [
  "gpt-6",
  "claude-haiku-5-5",
]);

// Example 2 — the original wordy prompt: compression still matters here.
show(
  "Please note that I would like you to please summarise the attached report. " +
    "As you know, it is important to note that we need the summary in order to brief the team. " +
    "Please keep it short.",
  ["gpt-6"]
);

console.log("THE PLAYBOOK (" + STRATEGIES.length + " levers):");
for (const s of STRATEGIES) {
  console.log(`- ${s.name} [${s.lever}] — ${s.typicalSaving}`);
}
