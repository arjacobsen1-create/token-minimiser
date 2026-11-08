# Token Minimiser

An app that takes a prompt and gives you back a smaller one that does the
same job — with the saving counted.

**Input:** a prompt. **Output:** a rewritten, smaller prompt, plus
before/after tokens, % saved, and $ saved per model.

This is a separate app from the **Token Estimator** on purpose:

| | Estimator | Minimiser |
|---|---|---|
| Job | Measure and predict | Intervene and shrink |
| Moment | Planning, budgeting | Right before you send |
| Input | Task / prompt + volume | A prompt |
| Output | Counts and cost forecast | A smaller prompt + the saving |

They are siblings: both use the same counting engine underneath.
Different scope, different output, different app.

## What it does

1. **Compress** — rule-based stripping of filler, repetition and dead
   whitespace, without touching meaning-bearing words
2. **Report** — before/after token counts and cost per model
3. **Advise** — the wider playbook (summarise history, retrieve don't paste,
   lean formats, caching, output caps, fewer agent steps) matched to what
   your prompt actually contains

## Project layout

```
src/
  minimiser-core.js   The engine: counting, compression, reports, playbook.
                      Heavily commented — this is the file to learn from.
  demo.js             Run it:  node src/demo.js
LEARNING.md           Lesson notes. Start here if you're learning.
```

## Running it

Node.js (v18+), no dependencies for the core demo:

```bash
node src/demo.js
```

## Status

Public prototype, in development. A working prototype also exists as a web
app; this repo is the real codebase that will be packaged for the App Store.

## Python version

The same engine in Python lives in `python/minimiser_core.py`, held to
the JavaScript engine's numbers by a parity check (counts, task types,
output ranges, totals and the exact compressed text compared value for
value during the port).

```
python3 python/test_smoke.py   the proof the port works (4 checks)
```

The JavaScript engine remains the one that powers the live web demo —
the browser runs JavaScript natively, with no server.

## Accuracy

Counts are not taken on faith. The counter is measured against the real
tokenizers on a golden set, the errors are published in
[ACCURACY.md](ACCURACY.md), GPT-family counts go exact when a real
tokenizer is wired in (the live demo loads one), and every other count
is labelled an estimate with its measured error.


## What this measures, and what it doesn't

**It measures**

- **Input tokens** — the prompt as written, and the same prompt after
  automatic compression, counted. Exact for GPT models when the real
  o200k_base tokenizer is wired in (the live demo loads one); labelled
  estimates for other models, with the measured error published in
  ACCURACY.md.
- **Predicted output tokens** — what the prompt, as written, is likely to
  provoke, forecast from the type of task; and the capped output once an
  explicit output limit (Gentle, Balanced or Aggressive) is attached.
- **Predicted total saving** — input plus output, before and after. This is
  the figure the dashboard leads with.

**It doesn't measure**

- **Proven savings.** Every saving here is predicted. A saving is only proven
  when measured against an actual model response.
- **Quality.** A shorter answer is not automatically a better one; the
  control levels trade completeness for cost, and the trade is shown, not hidden.
- **Vendor consumption units** (SAP AI Units and the like). Vendors set
  conversion rates per scenario; this measures the token driver underneath.

**If you pay a flat subscription**, read the dollar figures as an
API-equivalent yardstick: they size and compare prompts and show what burns
the allowance you already bought. **If you pay per token or in consumption
units**, they are a direct forecast.

## Live demo

**Guided demo: https://arjacobsen1-create.github.io/token-minimiser/demo.html** — three real prompts stepped through, computed live by the same engine.

**App: https://arjacobsen1-create.github.io/token-minimiser/** — the app running in your browser, on the same engine as `src/`.

**Dashboard: https://arjacobsen1-create.github.io/token-minimiser/dashboard.html** — all samples, all control levels, the full comparison.

## Verify it works

```
node test/smoke.js
```

Four checks, including the ones that encode this project's lessons. If they
pass, the engine works. The command-line demo is `node src/demo.js`.

## A note on prices and counting

Model prices in `src/minimiser-core.js` are editable defaults — verify
against the provider's current pricing page. They were checked on
8 Nov 2026, the same audit as the Estimator's table: GPT-6 Sol $2 / $10
(GPT-6 Astra $10 / $50 as the premium option), Claude Haiku 5.5
$0.10 / $0.50 for prompts up to 100K tokens. Counting runs two ways: a
calibrated heuristic by default, and exact counts for GPT models when the
real o200k_base tokenizer is wired in (the live demo loads one). Other
models stay labelled estimates; the measured error table is in ACCURACY.md.

## Licence

Open source under the MIT License. Copyright (c) 2026 Anahita Jacobsen.
See the [LICENSE](LICENSE) file in this repo.
