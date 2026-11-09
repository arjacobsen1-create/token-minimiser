"""
test_smoke.py — proof the Python port works, mirroring test/smoke.js.
Run:  python3 python/test_smoke.py
The port is held to the JavaScript engine's numbers (parity-checked
during the port across counts, task types, ranges and compressed text).
"""

import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from minimiser_core import minimise_report, compress_prompt, controlled_output

passed = 0


def check(name, fn):
    global passed
    fn()
    passed += 1
    print("PASS  " + name)


WORDY = (
    "Please note that I would like you to please summarise the attached "
    "quarterly supplier performance report for me. Please keep your "
    "summary nice and short. Thank you very much in advance."
)


def check_tiny_prompt():
    # THE founding lesson: a tiny prompt can trigger a huge answer.
    r = minimise_report("Write a strategy.", "gpt-6")
    assert r["before"] < 20
    assert r["outputRange"]["high"] > r["before"] * 50


def check_wordy_shrinks():
    r = minimise_report(WORDY, "gpt-6")
    assert r["totalAfter"] < r["totalBefore"]
    assert r["savedTotalPct"] > 0


def check_billing_framings():
    r = minimise_report(WORDY, "gpt-6")
    assert r["billingModes"]["api"]["marginalCostPerRun"]["typical"] > 0
    assert r["billingModes"]["subscription"]["marginalCostPerRun"]["typical"] == 0


def check_deterministic():
    assert compress_prompt(WORDY) == compress_prompt(WORDY)
    assert "please" not in compress_prompt(WORDY).lower()


check("tiny prompt predicts an output range far larger than its input", check_tiny_prompt)
check("wordy prompt shrinks in total (input + predicted output)", check_wordy_shrinks)
check("both billing framings present; subscription marginal cost is $0", check_billing_framings)
check("compression is deterministic and strips filler", check_deterministic)


# 5–7. The 2026-11-09 fixes, held as golden tests (MINIMISER-FIX-SPEC).
DEMO_TEXT = (
    "Please note that I would like you to please summarise the attached "
    "quarterly supplier performance report for me. The report is quite long "
    "and it contains a lot of detailed information about delivery performance "
    "and freight costs and capacity issues. Please keep your summary nice "
    "and short and please focus mainly on the most important key points "
    "that I really need to know about. Thank you very much in advance for "
    "your help with this."
)


def check_politeness_stripped():
    c = compress_prompt(DEMO_TEXT)
    assert not re.search(r"thank you", c, re.I), "a thank-you formula survived compression"
    assert "Summarise the attached quarterly supplier performance report" in c
    assert "most important key points" in c, "the user's own instruction must survive"


def check_control_bites():
    assert controlled_output("summarise", 80, "gentle") == 56
    assert controlled_output("summarise", 80, "balanced") == 40
    assert controlled_output("summarise", 80, "aggressive") == 25


def check_input_split():
    r = minimise_report(DEMO_TEXT, "gpt-6")
    assert r["input_compressed"] + r["clause_tokens"] == r["after"]
    assert r["clause_tokens"] > 0, "a summarise report carries a control clause"
    t = minimise_report("Translate this letter into French.", "gpt-6")
    assert t["taskType"] == "translate"
    assert t["clause_tokens"] == 0, "translate carries no clause"


check("demo text: sentence-level politeness stripped, instruction survives", check_politeness_stripped)
check("output control bites at small sizes: summarise/80 → 56/40/25", check_control_bites)
check("report splits the input honestly: compressed + clause = after", check_input_split)

print(f"\n{passed}/7 checks passed — the Python port works.")
