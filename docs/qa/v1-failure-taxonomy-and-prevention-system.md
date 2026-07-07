# V1 Failure Taxonomy + Prevention System

> **Purpose.** Turn the post-mortem into prevention. This is seed material for
> future skills. The goal Thomas set: build systems and habits so we **never
> need a v2 feedback round** — every v1 change requested is accounted for,
> correct, and dynamic (never hardcoded), the first time. This doc is the "why"
> behind each issue so nothing gets thrown together that doesn't make sense.
>
> Source: surgical source-level + git-archaeology sweep of the Overview, PR
> Influence, and Content Impact tabs (branch `tina-post-split-qa`). Every failure
> below is traced to real pre-fix v1 code, not a guess.

---

## The core insight

Across three tabs, ~12 distinct v1 failures dedupe to **six repeating classes**.
Sorted by *what could have caught them*, they split into two buckets:

- **Bucket A — machine-catchable before anyone looks** (lint / test / type / assert).
- **Bucket B — only catchable by seeing it render with live data** (human or render pass).

Every v1 failure we shipped lives in one of these. Close both buckets and the
v2 round disappears.

---

## The six failure classes

| # | Class | Why it happens | V1 examples (real code) | Bucket |
|---|-------|----------------|-------------------------|--------|
| 1 | **Placeholder shipped as real** | Scaffolding built "to validate layout" with hardcoded consts / DEMO arrays, then shipped before wiring to live data. Real code and scaffolding look identical in a screenshot. | Sentiment `const SENTIMENT_PCT = 89.4` + `POSITIVE_THEMES`/`WEAKNESSES` const arrays gated to `avenue-z` (PR Influence). `DEMO_BRAND_ABSENT_TITLES/SLUGS/COMPETITORS` in the brand-absent table. | A + B |
| 2 | **Wrong-number-that-computed** | Grabbed a data field whose *name* sounded right without checking its *range/definition*, rendered it in a bounded column. Math runs fine; output is wrong. | `citationShare: d.citationRate` → **199.9%** (§H.1). Per-model raw count rendered as `%` → **5590%** (PR Influence Top Editorial Domains). Both: unbounded field in a `%` slot. | A + B |
| 3 | **Label/value mismatch** | Tooltip/label text lives far from the value it describes, copied from the wrong metric definition. | Citation Share tooltip "average number of times… referenced" (a count) on a column rendering a **percentage** (§H.1 and §H.2). "AI Visibility" column that actually measured source appearance. | A |
| 4 | **Silent data-drop** | Joins fail quietly — they return fewer rows, not an error. Exact-key matching drops near-misses invisibly. | §F owned-host match used exact equality `ownedHostKeys.has(host)`, dropping every subdomain URL (`blog.x.com`) → looked like "only 14 pages cited." | A |
| 5 | **Partial application** | The same per-item work done N times by hand; one item forgotten. | Prompt Coverage was the 1 KPI of 4 that forgot to plumb its delta (§A). | A |
| 6 | **Missing provenance** | Value is correct but the *context to trust it* is absent. | Unexplained `--` rows (§B), the 30-day window with no reason (§D), the speed stat with no source URL to validate (§C). | B (+ A for the "--" cause) |

Not a failure class but worth logging: **over-literal spec reading** — FB-015
deleted the PR Placement Matchback because it wasn't in Tina's 5-section layout
sketch, though she wanted it. Cause: treated a layout sketch as an exhaustive
keep-list. Prevention lives in requirements traceability (below), not code.

---

## Prevention mechanisms (class → gate)

### Bucket A — automated gates (catch on every commit, forever)

- **#2 wrong-number → bound assertion.** Any value rendered as `%` passes through
  a helper that asserts/clamps 0-100 at compute time and logs on violation.
  `199.9%` throws in dev, never reaches a screen. (This is the generalization of
  the FB-051 / FB-062 one-off fixes.)
- **#3 label/value mismatch → metric single-source-of-truth.** One registry per
  metric: `{ label, unit, tooltip, range, sourceField }`. A `%` column physically
  cannot carry a count tooltip because both come from the same entry.
- **#4 silent drop → visible unmatched stat.** Every join emits "N of M unmatched"
  as a first-class surface (what FB-043 added *after* the fact — make it a habit,
  not a patch). A drop becomes loud.
- **#5 partial application → DRY the repeated UI.** Drive the 4 KPIs (etc.) from
  one array/config so the delta path is written once and can't be forgotten.
- **#1 placeholder → no-hardcoded-content lint.** CI grep fails the build if a
  report component contains `const …THEME`, `DEMO_`, `SANDBOX`, `= 89.4`, or a
  bare numeric literal where a metric belongs. Forbids the hardcoding that caused
  the worst failures. (Directly serves Thomas's "not hardcoded either" rule.)
- **#6 "--" cause → footnote-required rule.** If a cell can render `--`, a test
  asserts the surface also renders a footnote explaining why.

### Bucket B — the live-render pass (mandatory before Tina)

Source-read structurally **cannot** catch these: the code is present and wired.
- Placeholder that *looks* fake (a pill that never moves).
- `199.9%` on the actual screen.
- Empty/confusing tables from a silent drop.
A repeatable per-tab render checklist with **live data** is the only gate. It was
the missing gate on v1. Deferred to the end of the source sweep, then run once
across all tabs before anything reaches the client.

---

## The habit that ties it together: flip the scorecard to a pre-flight contract

The scorecard we fill in *after* Tina complains is the right artifact pointed the
wrong way in time. Flip it: fill it **before** shipping. Every ask gets three
columns:

1. **Data source** — which Peec/GA4 field, **and its real range**, not its name.
2. **How it's verified** — the bound-check / the unmatched stat / the render shot.
3. **Proof** — a link or a screenshot.

If a row can't be filled, it's not done. This single discipline would have blocked
the static sentiment card (no data source), the 199.9% (range never checked), and
the "14 pages" (no unmatched stat) — before Tina ever saw them.

---

## Candidate skills to extract from this doc

1. **`aeo-metric-contract`** — the metric single-source-of-truth pattern + the
   `%`-bound assertion helper (classes #2, #3).
2. **`no-placeholder-ship`** — the no-hardcoded-content lint + the "every metric
   traces to a live source" rule (class #1).
3. **`loud-joins`** — always emit an unmatched-count stat at every data join
   (class #4).
4. **`pre-flight-feedback-contract`** — the flipped scorecard: ask → source →
   verification → proof, filled before shipping (all classes; the front-end
   discipline).
5. **`live-render-pass`** — the per-tab Bucket B checklist run with live data
   before client review.

---

## Status

Analysis captured, not yet built. Thomas is collecting this to author the skills
above later. No code written from it yet. When we build, each mechanism is itself
dynamic (data-driven), never a hardcoded patch — that is the whole point.
