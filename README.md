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

Private project, in development. A working prototype also exists as a web
app; this repo is the real codebase that will be packaged for the App Store.

## A note on prices and counting

Model prices in `src/minimiser-core.js` are editable defaults — verify
against the provider's current pricing page. Counting v1 uses a calibrated
heuristic; the production step is each model's real tokenizer (one function
swap, by design).
