---
diataxis: explanation
---

# Why a test harness must assert its own preconditions loaded

**Assertions verify properties of what rendered; they cannot verify that
what rendered is what you intended to render.** A harness whose setup
fails silently yields a fully assertion-clean run of the wrong states, and
every artifact in it looks plausible. So a harness asserts not only that
its postconditions held, but that its preconditions loaded.

## The incident that taught it

The A11 visual QA sweep preloads IndexedDB fixtures so each matrix cell
captures a specific app state (exam date set, mid-session, all cards done).
The injector passed `page.evaluate` a *string* of an async function —
which JavaScript evaluates to a function object without invoking it. No
error, no log. Every fixture silently never loaded.

The consequence: all `--nobanner`, `midsession`, and `empty-deck` cells
captured the wrong state — the no-date banner visible where it should be
absent, a full queue where the deck should be empty — across two complete
sweeps that ended "all layout assertions passed." Every screenshot was
internally consistent and individually plausible. The bug was caught by a
human noticing a banner in a cell whose name promised none.

## The rule

For every precondition a harness sets up, it must observe an effect that
could only exist if the setup ran:

- The fixture injector now returns a `"populated"` marker that the driver
  asserts on; a silent setup failure is now a loud run failure.
- The same applies to seeds, frozen clocks, and mocked transports: assert
  the seed took (a known first value), the clock froze (two reads agree),
  the mock intercepted (a counter moved).

Postconditions answer "did the system behave?" Preconditions answer "was I
testing the system I meant to test?" — and only the second protects you
from confidently verifying the wrong world. The companion failure mode,
where the *instrument's vocabulary* rather than its setup is what's
missing, is covered in
[why-instrumentation-blindness-is-unrecoverable](./why-instrumentation-blindness-is-unrecoverable.md).
