# AEO Outbound: Peec parity (source chart, whole-number labels, same-day warning). Implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the report's source chart matches Peec's dashboard (weighted by `usage_rate`, whole-number labels), and
Before you send warns when a report includes the pull's own UTC day.

**Architecture:** one decision value switches the weighting; the domains contract enforces the new field; new rows
record their weighting so the Glean Data line and older rows stay as they are; one pure `sliceLabel` feeds both the
desktop donut and the phone redraw; one new note kind, written when the window ends on the pull's day.

**Tech Stack:** Next.js 16, React 19, TypeScript, zod 4, Vitest + jsdom, Plotly 3.5.0 (CDN).

**Spec:** `docs/superpowers/specs/2026-10-19-aeo-outbound-peec-parity-design.md` (two review rounds; round 2's one
MAJOR resolved by my decision: the four-part multi-day check in §8).

## Global Constraints

- `DECISIONS.sourceMixWeight = 'usage_rate'`, type `'retrieval_count' | 'retrieved_chat_count' | 'usage_rate'`.
- Domains contract: `usage_rate: z.number().min(0)`, enforced. Stored data: `sourceMixWeight` optional enum of those three.
- `sliceLabel(pct)`: `r = Math.round(pct)`; `r === 0` → `<1%`; `r === 100 && pct < 100` → `>99%`; else `${r}%`.
- Donut trace: `textinfo: 'text'`, `text: mix.map((m) => sliceLabel(m.pct))`, hover `<b>%{label}</b><br>%{text}<extra></extra>`.
- Data block line for a `usage_rate` row: `Source types by share of AI use (Peec's usage rate): …`; every other row unchanged.
- Note kind `same_day_data`, text exactly as spec §4 states it (revised after Paul's #403 review: no "the day it was
  generated", and "Rerun later" with the leave-the-day-out option only for a multi-day window); written when
  `pull.window.end === pull.pulledDay`; `PeecPull.pulledDay` required, `todayUtc(nowMs)`.
- `SENTENCES_VERSION` unchanged. No em or en dashes. Comments match the surrounding code.

## Edge cases (the change parses Peec's API response: edge-case gate, full form)

Subject: `pullSnapshot` → `peecContract('peec.domains_report', …)` (`pull.ts:129`, `contracts.ts:77-78,96`) →
`buildSnapshotData` source mix (`metrics.ts:220-232`) → `sourceDonutFigure` and `PAGE_JS` (`charts.ts:73-87`,
`render.ts:157-160`); inputs come from Peec's `/reports/domains`.

| # | Category | What breaks | file:line | Disposition |
|---|---|---|---|---|
| 1 | external failure | Peec omits `usage_rate`, sends null, a string, NaN or a negative | `contracts.ts:77-78` | fix: enforced field, named `contract_violation` (`contracts.ts:96`) |
| 2 | operator visibility | which field failed | `contracts.ts:96` | decline: the error already names `peec.domains_report.<field>` and the row records it |
| 3 | bounds | `usage_rate` above 1 | `contracts.ts:47` | fix: not `ratio`; `min(0)` only (measured max 1.399) |
| 4 | input boundary | all weights 0 | `metrics.ts:232` | decline: existing `empty_source_mix` note covers it; test pins it |
| 5 | state / concurrency | a build without `same_day_data` reads a new row as unreadable (shared dev DB, a revert) | `contracts.ts:144,158`, `store.ts:22` | decline: accepted in spec §5; the editor offers Rerun |
| 6 | security | none identified: the note and labels are code-written; no secret touched | | |

## Review Focus

1. A row generated before this ships (no `sourceMixWeight`): Data line unchanged, chart labels whole numbers on its
   old weights. Task 1 and Task 2 tests.
2. Chart and sentence on the same slice never print different whole numbers. Task 2 test with 18.5.
3. Phone width with a trace that has no `text`: no redraw, no "undefined". Task 2.
4. A run whose pull is on its last data day gets the note; one day later none. Task 3.
5. Peec dropping `usage_rate` fails loudly, not silently. Task 1.

## Round 2 MINORs, handled here (spec §3 corrected the rest)

- Stored-data enum for `sourceMixWeight` with a bad-value test (Task 1).
- `PeecPull.pulledDay` required; fixtures set it to the day after `window.end` except the same-day test (Task 3):
  `metrics.test.ts:22`, `contracts.test.ts:177`, `__fixtures__/sentences-live-shape.ts:17`, `sentences.test.ts:14`.
- Test fallout listed in each task below (`render.frame.test.ts:229,245-267,284,307`; `charts.test.ts:24,33`).

---

### Task 1: weight the source mix by `usage_rate`

**Files:** `lib/aeo-outbound/config.ts:11-13`, `pull.ts:19-26`, `contracts.ts:77-78,146-162`, `metrics.ts` (the
`SnapshotData` type and its return), `prompt.ts:56`; tests `contracts.test.ts`, `metrics.test.ts`, `prompt` tests,
`config` test; fixtures that build domain rows (`metrics.test.ts:40-44`, `__fixtures__/sentences-live-shape.ts:15`,
`contracts.test.ts:85-86,97,116,189`, `generate.test.ts:46`, `pull.test.ts:43,304`, sentences and grounding tests).

- [ ] Failing tests first:
  - contract: a domains row without `usage_rate`, with `-0.1`, `"0.3"`, `null` or `NaN` fails `peec.domains_report`;
    `1.4` passes.
  - stored data: `sourceMixWeight: 'bogus'` makes a row unreadable; `'usage_rate'` and absent are fine.
  - metrics: rows where `retrieval_count` puts Competitor above Editorial and `usage_rate` the reverse (PocketGuard's
    shape): with `DECISIONS`, Editorial is first of the two and `data.sourceMixWeight === 'usage_rate'`; with
    `sourceMixWeight: 'retrieval_count'`, Competitor is first.
  - `DECISIONS.sourceMixWeight === 'usage_rate'`.
  - prompt: `usage_rate` row → `Source types by share of AI use (Peec's usage rate): …`; a row without the field →
    `Source types by share of retrievals: …` (and `v1-compat.test.ts:14-16` stays green).
- [ ] Run, watch them fail.
- [ ] Implement: `usage_rate: count`-like `z.number().min(0)` in `peec.domains_report`; `usage_rate: number` on
  `DomainRow`; decision value, type and comment; `sourceMixWeight?: …` on `SnapshotData`, set from
  `decisions.sourceMixWeight` in `buildSnapshotData`; `sourceMixWeight: z.enum([...]).optional()` in `STORED_DATA`;
  the conditional prompt line. Give every domain-row fixture a deliberate `usage_rate`; pin the tests that assert
  `retrieval_count` behaviour (`metrics.test.ts:67-70,228-232,416`) to `sourceMixWeight: 'retrieval_count'`;
  `generate.test.ts:232` keeps `zero_retrievals` (its rows carry `usage_rate`).
- [ ] Green; commit with the edge-case table; push.

### Task 2: whole-number labels, desktop and phone

**Files:** `lib/aeo-outbound/charts.ts:73-87`, `render.ts:137-160,270`; tests `charts.test.ts:21-33`,
`render.frame.test.ts:229,245-267,284,307`, `v1-compat.test.ts:43`.

- [ ] Failing tests first:
  - `sliceLabel`: 18.5 → `19%`; 0.0 and 0.4 → `<1%`; 0.5 → `1%`; 99.6 → `>99%`; 99.4 → `99%`; 100.0 → `100%`; 37.4 → `37%`.
  - figure: `textinfo: 'text'`, `text` from `sliceLabel`, the new hover; the AIVx golden test computes `pct` with
    `pyRound((w / total) * 100, 1)` and lists these as deliberate differences beside the hover.
  - phone (`render.frame.test.ts`): slice text `%{text}` from an exact 5% share, legend `Label N%` equal to the desktop
    labels; a trace without `text` (or a shorter one) is not redrawn; the M5 tie test replaced by "phone legend equals
    the desktop labels"; `:284` and `:307` updated to the new figure.
  - v1-compat: the donut difference added as one listed replacement.
- [ ] Implement `sliceLabel` and the figure; `render.ts:270` passes `data.sourceMix` (already `{label, weight, pct}`);
  `PAGE_JS` reads `t.text`, guards its length, drops `r1`; update the comment at `render.ts:137-140`.
- [ ] Green; commit; push.

### Task 3: same-day data note

**Files:** `lib/aeo-outbound/notes.ts:3-10`, `pull.ts` (`PeecPull`, the return at `:157`), `metrics.ts:184-186`;
tests `notes.test.ts`, `metrics.test.ts`, `pull.test.ts`, fixtures listed above.

- [ ] Failing tests first: `pullSnapshot` returns `pulledDay` = UTC day of `nowMs`; `buildSnapshotData` writes
  `same_day_data` with the exact text when `window.end === pulledDay`, none when `pulledDay` is the next day;
  `noteGroup` puts it under `check`; the editor panel shows it with a Looks right tick.
- [ ] Implement; set fixture `pulledDay` to the day after `window.end` everywhere except the same-day test.
- [ ] Green; commit; push.

### Task 4: verify, then the PR

- [ ] `DATABASE_URL=postgresql://ci:ci@db.invalid/ci make check`, bounded; paste the counts.
- [ ] Browser, dev database: generate PocketGuard; donut against Peec at the same time; hover; the same-day note if its
  data is still on the pull's day. Phone width 375px. A `<1%` slice rendered as text. An older draft still renders.
- [ ] Multi-day check (spec §8, all four): A Place for Mom (PITCH) with my "All time" Domain types screenshot. Any
  failure stops the PR.
- [ ] PR to `dev`, Paul as reviewer.

## For Paul's review

Specific things to check, then anything else you see:

1. **The evidence for `usage_rate`.** Two PocketGuard dashboard panels and the multi-day project matched; Peec does not
   document the field. Is enforcing it in the contract the right call, given a missing field now fails the run?
2. **One rounding source.** The chart rounds the stored one-decimal `pct` so it agrees with the sentence, at the cost of
   rare one-point differences from Peec on a near-half share. Agree with that trade?
3. **Stored `sourceMixWeight`.** New rows carry it so the Glean Data line changes only for them. Is the optional field
   the cleanest way to keep v1 rows and grounding unchanged?
4. **`PAGE_JS` on phones** now reads the figure's `text`. Is the guard (no redraw without a matching `text`) enough?
5. **The `NOTE_KINDS` rollout hazard** (spec §5): accepted rather than split into its own PR. Agree?
6. Anything else: correctness, naming, a simpler way, something the spec missed.
