# Accuracy

The Minimiser shares its token counter with the Token Estimator, and it
is measured the same way: against the real tokenizers, on a golden set
of ten texts (prose, code, JSON, numbers, French, SAP text), with
Claude's ground truth taken from real Anthropic API usage counts.

The full method and results table live in the Estimator repo's
ACCURACY.md. The summary that matters here:

- The built-in heuristic overstates long prose by ~30% and understates
  code, JSON and number-heavy text by 35–60%. Short plain prose and
  lists are within ~12%.
- **GPT family counts are exact** whenever a real tokenizer is wired in
  (`setExactCounter()` in JavaScript, `set_exact_counter()` in Python).
  The live demo loads the o200k_base tokenizer and counts GPT models
  exactly.
- **Other models are labelled estimates**, with the measured error
  published rather than hidden. Exact Claude counts exist only through
  Anthropic's API.
- Output sizes are predictions by nature and are always reported as
  ranges.
