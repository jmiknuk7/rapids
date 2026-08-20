---
diataxis: explanation
---

# Why instrumentation blindness is unrecoverable from inside

**Any defect class your instrumentation cannot detect is also a defect class
you cannot recover from your instrumentation.** When a source document is
unavailable and you reconstruct it from your tooling, you recover exactly
the subset the tooling covers — and the gap is invisible from inside,
because the reconstruction looks complete.

## The incident that taught it

A11 filed five visual defects against the Phase 3 Feed. The defect list
itself wasn't attached, so the defects were reconstructed from A11's
assertion descriptions. Four of the five were geometry — a collapsed scroll
container, a clipped input, off-viewport controls, duplicate chips — and
geometry is what the assertion suite describes, so the reconstruction
recovered them perfectly.

The fifth (D5) was prose: the home page still said "Phase 1 content dump /
No study UI yet" while linking to a working Feed. No assertion describes
prose, so the reconstruction had no material to recover it from — and the
report confidently declared all five defects fixed. The miss was
structural, not careless: the reconstruction could only ever find what the
instruments could see.

## The general shape

- Assertions verify properties of what rendered; they cannot verify that
  what rendered is what you intended to render, and they cannot see defect
  classes outside their vocabulary.
- A reconstruction from tooling inherits the tooling's blind spots and
  presents them as coverage.
- The confidence of the reconstruction is not evidence of its completeness
  — it is evidence of the tooling's internal consistency.

## What to do about it

1. **Widen the vocabulary when a class is discovered.** D5's fix included a
   copy-audit assertion (no phase references, build-status disclaimers, or
   TODO markers in shipped-route chrome) so the whole prose-defect class is
   now inside the instrument's vocabulary.
2. **Flag reconstructions as reconstructions.** The A11 report labeled its
   defect mapping as inferred; that label is what let the gap be found by
   the person holding the original list.
3. **Keep a human-review lane that is not assertion-shaped.** The
   per-screenshot review exists precisely to catch what the assertions
   cannot name yet. See also
   [why-harnesses-assert-their-own-preconditions](./why-harnesses-assert-their-own-preconditions.md).
