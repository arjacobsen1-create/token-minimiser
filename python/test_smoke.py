"""
test_smoke.py — proof the Python port works, mirroring test/smoke.js.
Run:  python3 python/test_smoke.py
The port is held to the JavaScript engine's numbers (parity-checked
during the port across counts, task types, ranges and compressed text).
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from minimiser_core import minimise_report, compress_prompt

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

print(f"\n{passed}/4 checks passed — the Python port works.")
