# Learning notes — Token Minimiser

These notes grow as the app is built. Ask Muse about any line, any time.

---

## Lesson 1 — Compression: cut the packaging, keep the payload

Every prompt has two parts:

- **Payload** — the words that change what the model does: the task, the
  facts, the constraints, the format you want back.
- **Packaging** — politeness ("please note that I would like you to…"),
  throat-clearing ("as you know…"), repetition, and formatting bulk.

People need packaging; it's how we soften requests. Models don't. The
packaging is billed on **every single call**, so a wordy system prompt run
10,000 times a day is a real line item.

### Why rules first, AI second

An AI can rewrite a prompt shorter — but it costs tokens to save tokens,
and it can quietly change meaning. Rules (delete these phrases, collapse
this whitespace) are free, instant, and predictable. So the app compresses
with rules first, and treats AI rewriting as the optional second pass whose
output you compare before accepting.

That's a general product principle worth keeping: **do the free,
predictable thing first; sell the clever thing as the upgrade.**

### The levers beyond compression

Compression only shrinks the instruction. The bigger bills hide elsewhere:
old conversation history resent every turn, whole documents pasted when
three paragraphs matter, JSON structure characters, and agent loops that
resend everything at every step. `STRATEGIES` in `src/minimiser-core.js`
is that playbook — Lesson 2 takes them one at a time.

### Exercise

Run `node src/demo.js`, read the compressed sentence, and check it by eye:
did anything that *matters* disappear? Then add a filler phrase of your own
to the `FILLER_PHRASES` list in `src/minimiser-core.js` and run it again.
You just shipped a feature.

---

## Lesson 2 — The prompt is not the bill (added 29 Oct 2026, from a real test)

The author typed a short request — a digital transformation pathway for a
1,000-employee company — into the v0.1 Minimiser and it said "18 tokens."
She asked: is that it? It wasn't. The count was right and the app was
wrong, and the difference is this lesson:

- **Input tokens** are what you send. That prompt really is ~18.
- **Output tokens** are what the model sends back — for a pathway,
  roughly 2,000. And output is priced higher (on frontier models, 5x
  the input price). The answer is the bill.

So output size follows **the deliverable you ask for**, not the length
of your prompt. A one-line prompt can buy a very long answer.

v0.2 therefore minimises the **total**:

1. Compress the input (Lesson 1).
2. Detect the task type, predict the uncontrolled output size.
3. Add an **output-control clause** to the rewritten prompt — format
   plus a length cap ("Output: a phased table with short bullet
   points, max ~1,000 tokens. No preamble or repetition.")
4. Report input + output, before and after, as one total in tokens
   and in dollars.

Notice the honest wrinkle: the control clause makes the *prompt* a few
tokens longer while making the *total* far cheaper. If an app only
shows you the prompt count, it will call that a loss. It is a win —
which is why totals, not prompt counts, are the number to watch.

### Exercise

Run `node src/demo.js` and find the pathway example. Check the three
lines — Input, Output, TOTAL — then change the level in
`minimiseReport(text, modelId, { level: "aggressive" })` and run it
again. Watch which line moves the most. That line is where the money is.

---

## Lesson 3 — A prediction is a range, and "cost" depends on how you pay

Two corrections from the author, same evening, both about honesty:

**1. A predicted output is not a number, it's a range.**
v0.2 showed "≈2,200 out · $0.033" in bold. The 2,200 was an assumed
typical for that task type — a brisk answer could be ~1,200, a thorough
one ~3,500. A single figure dressed up as fact is worse than an honest
range, so v0.3 shows low–high bands for the prediction *and* for every
cost derived from it, plus the per-1,000-runs figure so the scale means
something (cents per run, tens of dollars per thousand).

**2. Per-token cost is only real if you pay per token.**
A user on a flat monthly subscription can ask the same
question there — no $0.033 charge appears. The $ figures are
*API-equivalent* cost: real charges for API / usage-based users,
meaningless as a "bill" for subscription users, whose marginal cost
per run is $0. For them tokens still matter, differently: long answers
and long context burn the plan's usage allowance, bring limits closer,
and eat the context window.

Design rule that follows: **never show a $ without saying whose $ it
is.** The report now carries both framings (`billingModes`), and the
app asks how you pay before deciding which one to lead with.
