# AEO Outbound: match Peec's source chart, whole-number labels, a same-day data warning

Status: draft for review, 2026-10-19. Branch `fix/aeo-outbound-peec-parity` off `dev` `36cbfe49`. Every line reference was
read on that commit in this session. Evidence and probes: `aeo-outbound-audit-notes`
`findings/2026-10-19-ryan-peec-parity.md`.

## 1. Why

Ryan (2026-10-19) saw the report's numbers differ slightly from Peec's dashboard on PocketGuard. Root causes, measured:

1. **Main numbers:** the report was generated while that day's data was still changing. Pulled again with the tool's
   own code, they match the dashboard exactly (33.3%, 9.8%, #3.2). The tool is right; a report is a snapshot.
2. **Source chart:** the report weights each source by `retrieval_count` (`lib/aeo-outbound/config.ts:13`,
   `metrics.ts:220-231`). Peec's dashboard "Domain types" chart is each domain's **`usage_rate`** summed by
   classification: on PocketGuard it reproduces all eight slices (37.4, 18.9, 17.1, 9.1, 8.0, 4.1, 3.1, 2.4 against the
   dashboard's 37, 19, 17, 9, 8, 4, 3, 2) and the "Total retrievals: 46.6k" (sum of `usage_rate` x 5,766 chats =
   46,608), confirmed twice against two dashboard screenshots.
3. **Display:** the donut prints Plotly's own percent (`charts.ts:79`, `textinfo: 'percent'`): 35.9%, 9.45%, 2.33%.
   Peec prints whole numbers.

Ryan's answers (Slack, 2026-10-19 12:58): switch the chart to match Peec, **yes**; whole numbers on it, **yes**; warn
when a report includes today's data, **yes**.

## 2. Change A: the source chart weights by `usage_rate`

- `DECISIONS.sourceMixWeight` (`config.ts:13`) becomes `'usage_rate'`; its type gains `'usage_rate'`; its comment states
  the 2026-10-19 finding. `buildSnapshotData` already reads the field named there (`metrics.ts:222`), so the weighting
  itself needs no new logic in `metrics.ts`.
- New rows record the weighting they used: `SnapshotData` gains an optional `sourceMixWeight` (the stored-data contract
  is a `looseObject`, `contracts.ts:146`, so older rows without it stay valid). `buildSnapshotData` sets it from
  `decisions.sourceMixWeight`.
- `DomainRow` (`pull.ts:19-26`) gains `usage_rate: number`.
- The domains contract (`contracts.ts:77-78`, `peec.domains_report`, enforce) gains `usage_rate: z.number().min(0)`
  (finite, non-negative; not `ratio`, because it exceeds 1). Measured 2026-10-19 on the first 12 projects Peec lists
  (11 pulled, 1 had no data), full windows: 16,835 of 16,835 rows carry a finite `usage_rate`, none negative, max
  1.399 (findings doc, "usage_rate presence"). A missing or broken value fails the run with a named contract
  violation, like every other enforced field (no off switch, my rule).
- The Glean Data block line (`prompt.ts:56`) says "Source types by share of retrievals". On a row whose
  `sourceMixWeight` is `'usage_rate'` it reads "Source types by share of AI use (Peec's usage rate)"; every other row
  keeps today's line, so a v1 row keeps every v1 line (`prompt.ts:32`, pinned by `v1-compat.test.ts:14-16` against
  `__fixtures__/v1-row.ts:63`) and grounding, which rebuilds the Data block on every save
  (`reports/[id]/slots/route.ts:80,98`), never calls an older row's retrieval shares a usage rate.
- **Evidence scope:** both dashboard matches are PocketGuard over a one-day window. That Peec's dashboard uses
  `usage_rate` over multi-day windows too is UNVERIFIED; §8 checks it on a multi-day project before merge. What
  `usage_rate` is exactly is UNVERIFIED (findings doc); the report uses Peec's value as given, like visibility.
- Effects, all intended: `sourceMix[].pct` (`metrics.ts:231`) is now the usage-rate share, so the "Source mix" sentence
  (`sentences.ts:186-206`) and its "Limited editorial and UGC presence" rule (`:202`, under 10% each) read the new
  shares with unchanged wording and rounding. `SENTENCES_VERSION` (`config.ts:34`) is **not** bumped: it guards
  wording and rounding, and an older row keeps its stored `sourceMix` (`contracts.ts:155`), so its sentences recompute
  as before.

## 3. Change B: whole-number labels on the donut

- **One rounding source:** each slice's label is the whole number of the same stored one-decimal `pct` the sentence
  reads (`metrics.ts:231`), rounded the way the sentence rounds it (`sentences.ts:13-17`, `Math.round`), so chart and
  sentence read the same value (the repo's rule that chart and sentence agree, `render.ts:137-140`; pinned as "final
  review M5" in `render.frame.test.ts:261`). Exact rule, one pure exported function `sliceLabel(pct)` in `charts.ts`,
  with `r = Math.round(pct)`: `r === 0` reads `<1%` (a stored slice always has a positive weight, `metrics.ts:223`);
  `r === 100 && pct < 100` reads `>99%` (the sentence prints that value with a decimal, `sentences.ts:16`, never 100);
  otherwise `${r}%`, so a stored 100.0 reads `100%`, as the sentence does. The sentence can still print one decimal
  where the chart prints a whole number: under 10% (Ryan's format) and when two values in one sentence read alike
  (`pctAll`, `sentences.ts:57-60`); both are the same stored value, rounded (D1, decided). Cost: when an exact share sits
  just under a half (18.46 stored as 18.5), the chart reads 19 where Peec, rounding the exact share, would read 18;
  accepted for a page that agrees with itself.
- `sourceDonutFigure` (`charts.ts:73-87`) takes `{ label, weight, pct }` (render passes `data.sourceMix`, which has
  all three, `render.ts:270`) and sets `textinfo: 'text'` with `text` from `sliceLabel`, instead of
  `textinfo: 'percent'`.
- Hover: `Retrievals: %{value}` (`charts.ts:82`) is no longer true for a usage-rate row (its value is a sum of rates).
  It becomes `<b>%{label}</b><br>%{text}<extra></extra>`, true for every row.
- **Phone width:** the page script redraws the donut at 900px and under (`render.ts:157-160`, `apply` in `PAGE_JS`):
  slice text `%{percent:.1%}` from 5% up, legend labels with a one-decimal half-even percent (`r1`, `:154`). It changes
  to read the figure's own `text`: slice text `%{text}` where the exact share `v/total` is 5% or more (the threshold
  as today; blank below), legend `label + ' ' + text[i]`. If the trace has no `text` array of the same length as its
  values, the script does not redraw (the desktop figure stays). `r1` and the half-even comment (`render.ts:137-140`)
  go. The hover rewrite to `%{customdata}` is unchanged. Approved pages keep the script frozen in their HTML.
- Whole numbers may not sum to 100 (Peec's own: 99 on PocketGuard).
- **Sentences are unchanged** (Ryan's format: one decimal under 10%), so a slice under 10% can read "8.4%" in a
  sentence and "8%" on the chart (the same value, rounded). Decision D1 below.
- Plotly behaviour (`textinfo: 'text'` with a `text` array, `%{text}` in a pie hover and texttemplate, a literal
  `<1%`) is UNVERIFIABLE BY READING (Plotly 3.5.0 loads from the CDN, `render.ts:330`); §8 checks it in a browser.

## 4. Change C: a same-day data warning

- New note kind `same_day_data` in `NOTE_KINDS` (`notes.ts:3-10`). It is not in `ABOUT` (`notes.ts:18`), so it shows
  under "Check these" with its own "Looks right" tick, like `requested_range`. Approve is not blocked by it (only
  `needs_validation` blocks, `editor.tsx:333`).
- Condition, in `buildSnapshotData` beside `requested_range` (`metrics.ts:184-186`): the window's last day equals the
  UTC day of the pull itself. `pullSnapshot` already receives that instant (`pull.ts:66`, `nowMs`, used for the default
  range at `:86`); `PeecPull` gains `pulledDay: todayUtc(nowMs)` (`range.ts:9`), and the check is
  `pull.window.end === pull.pulledDay`. Not `generatedAt` (`generate.ts:50-51`), a later instant that can fall on the
  next UTC day for a run crossing midnight (deadline 270s, `config.ts:35`).
- UNVERIFIED: that only the current UTC day can still change in Peec (a day just ended might too, shortly after
  midnight UTC), and that Peec's `date` is UTC (the tool's own assumption, `range.ts:1`). The note states only what the
  evidence shows: the day's data can still update.
- Text (revised after Paul's #403 review): `This report includes {fmtDay(window.end)}, and Peec can still update that
  day's data, so these numbers may change. Rerun later to pick up Peec's latest numbers{L}.` where {L} is `, or, to
  leave that day out, start a new report that ends {fmtDay(the day before)}` only when `window.start < window.end`
  (a one-day project has nothing before it). A rerun keeps the dates (`generate/route.ts:59-67`), so it can warn
  again; the advice no longer promises otherwise. The day is the window's own, as the report's Data window prints it
  (UTC, `metrics.ts:186`), not "the day it was generated", which a late-evening Eastern run would read as tomorrow.
- A rerun is a new generation, so its own check runs again (`generate/route.ts:59-67`, verified live 2026-10-19).

## 5. What does not change

- **Sent reports:** an approved row serves the HTML frozen at approval (`store.ts:77-79`; public link
  `app/snapshot/[token]/route.ts:24-26`; staff preview `reports/[id]/view/route.ts:49-50`). No sent page changes.
- **Drafts made before this ships:** their stored `sourceMix` keeps `retrieval_count` weights until a Rerun; the chart
  is drawn at render (`render.ts:270`), so they get whole-number labels on their old weights. They get no same-day note
  (notes are written at generation).
- KPIs, rank, own-site retrievals (already `retrieved_chat_count`, which matches the dashboard's domain list), gaps,
  windows, models: unchanged.
- **Rollout hazard, accepted:** stored notes are validated against `NOTE_KINDS` (`contracts.ts:144,158`, enforced in
  `store.ts:22`). A build without `same_day_data` (another branch's local server on the shared dev database, or a
  revert of this change) reads a row carrying it as unreadable, and its draft view as not found
  (`reports/[id]/view/route.ts:50`); the editor offers Rerun on an unreadable draft. Staging and production only gain
  such rows after this build deploys there. I accept this rather than split the kind into its own PR.

## 6. Edge cases

| Case | Expected |
|---|---|
| A domain row without `usage_rate`, or negative, or not a number | contract violation, the run fails with its name |
| `usage_rate` above 1 | accepted (measured up to 1.399) |
| Every `usage_rate` is 0 | empty source mix and the existing `empty_source_mix` note (`metrics.ts:232`) |
| One classification only | one slice labeled `100%`; sentence unchanged ("all … sources") |
| A slice whose stored pct rounds to 0 | label `<1%` |
| A slice whose stored pct rounds to 100 beside a positive one (99.6 and 0.4) | `>99%` and `<1%` |
| Stored 100.0 beside 0.0 (weights 99,960 and 40) | `100%` and `<1%`, as the sentence prints 100% |
| Stored 18.5 from an exact 18.46 | chart `19%`, sentence `19%` (Peec would show 18) |
| Phone width (900px and under) | slice text from the figure's `text` from 5% up; legend `Label N%` from the same text |
| Window ends before the generation day (finished pitch) | no same-day note |
| Window ends on the generation day | `same_day_data` note under Check these |
| Evening Eastern run whose data sits on the next UTC day | same UTC comparison; the note names that UTC day |
| Approved report | unchanged (frozen HTML) |
| Older draft | old weights, new labels, no same-day note |

## 7. Tests (written first)

1. Contract: a domains row without `usage_rate`, with `-0.1`, or with `"0.3"` is a violation; `1.4` passes.
2. Metrics: with `sourceMixWeight: 'usage_rate'`, slices follow `usage_rate`, not `retrieval_count` (a fixture where
   the two orders differ, PocketGuard's Competitor and Editorial).
3. `DECISIONS.sourceMixWeight` is `'usage_rate'`.
4. Donut: `sliceLabel` for 18.5 (`19%`, the sentence's rounding of the stored value; 1846 of 10000 is stored as
   18.5), 0.0 and 0.4 (`<1%`), 99.6 (`>99%`), 100.0 (`100%`, alone or beside a 0.0); the figure has `textinfo: 'text'`,
   `text` from `sliceLabel` and the new hover. The AIVx golden test
   (`charts.test.ts:21-30`) states these as deliberate differences, as it does the hover today.
5. Older-row rendering (`v1-compat.test.ts:43`) gains the donut difference as one more listed replacement; the v1
   Data block (`v1-compat.test.ts:14-16`) is unchanged.
5b. Phone: `render.frame.test.ts:245-267` change to the new rule (slice text `%{text}` from 5%, legend from `text`).
   The half-even tie test becomes moot for the legend (it reads the stored-pct label) and is replaced by one pinning
   that the phone legend equals the desktop labels.
6. Notes: `same_day_data` is a Check these item; generation on the window's last day writes it with the text above;
   one day later writes none.
7. Prompt: a row with `sourceMixWeight: 'usage_rate'` gets the new line; a row without it keeps today's.
7b. `buildSnapshotData` sets `sourceMixWeight`; `pull.pulledDay` is the UTC day of the pull's `nowMs`.
8. Every existing test passes. Fixture fallout to fix deliberately (typed `DomainRow` and the enforced contract):
   `metrics.test.ts:40-44`, `__fixtures__/sentences-live-shape.ts:15`, `contracts.test.ts:85-86,97,116,189`,
   `generate.test.ts:46` (and `:232`, whose `zero_retrievals` would become `contract_violation` without `usage_rate`),
   `pull.test.ts:43,304`, the sentences and grounding tests. Tests that assert `retrieval_count` behaviour
   (`metrics.test.ts:67-70,228-232,416`) are pinned to an explicit `sourceMixWeight: 'retrieval_count'`, and fixture
   `usage_rate` values are chosen so the two weightings give different orders where it matters.

## 8. Verification beyond tests

`make check`. In the browser on the branch (dev database):
- Generate PocketGuard: the donut against Peec's dashboard at the same time; the hover reads the share; Before you send
  shows the same-day note with a Looks right tick (if its data is still on the generation day).
- **Multi-day check before merge (decided 2026-10-19):** a project with more than one day of data (A Place for Mom
  (PITCH), Sep 20 to 21), with my dashboard screenshot of its Domain types on "All time". Pass only if all four hold:
  (1) each `usage_rate` share at one decimal (the stored `pct`, the Data block) rounds to the dashboard's whole number;
  (2) the `retrieval_count` split does **not** round to the dashboard on every slice (so the check can tell the two
  apart; if it cannot on this project, use another); (3) sum of `usage_rate` x the window's chats matches the
  dashboard's "Total retrievals"; (4) the window is the project's full data. Any failure stops the merge.
- Phone width (375px): slice text and legend read the whole-number labels.
- A slice under 0.5% renders `<1%` as text (any dev draft with one, or a figure probe in the page).
- An older dev draft still renders, with whole-number labels on its old weights.

## 9. Decisions for Thomas

- **D1, decided 2026-10-19 (keep):** the chart shows whole numbers (Ryan's yes); the sentences keep his example's format
  (one decimal under 10%, and `pctAll`'s extra decimal), so a sentence can read "8.4%" where the chart reads "8%".
- **Multi-day check, decided 2026-10-19:** the four-part pass rule in §8 (round 2 MAJOR).

## 10. Amendment, 2026-10-20: whole numbers from the exact share (my decision after the staging QA)

**Why.** §3 rounded each slice's whole number from the stored one-decimal `pct`, accepting a rare one-point difference
from Peec. On staging (2026-10-20) it happened: Peec reclassified a domain on A Place for Mom overnight, Corporate's
exact share became 24.4636%, stored 24.5, so the chart read 25% where Peec's dashboard (rounding the exact share) reads
24% (`aeo-outbound-audit-notes` `drafts/2026-10-20-staging-promotion-and-qa.md`, run 2). Matching Peec is the point of
Ryan's feedback, so the trade is reversed.

**Rule.** Every whole-number source share, on the chart and in the source-mix sentence, is `Math.round(exact)` where
`exact = weight / Σ weight × 100` over the row's stored `sourceMix` (weights are stored on every row, old and new, so
no new field). Where a value keeps one decimal (under 10%, Ryan's format, or `pctAll`'s tie rule), the decimal stays
the stored `pct` exactly as today. Which branch applies (decimal or whole) is decided on the stored `pct`, as today.
- `sliceLabel(exact)`: `r = Math.round(exact)`; `r === 0` → `<1%`; `r === 100 && exact < 100` → `>99%`; else `${r}%`.
- The source-mix sentence (`sentences.ts:186-206`) formats its shares the same way; every other sentence keeps
  `pctText` unchanged.
- Chart and sentence still never round a slice differently: both use `Math.round(exact)` for whole numbers.
- `SENTENCES_VERSION` (`config.ts:35`) becomes 2: the rounding changed, so an older row's code-written sentences are not
  compared word for word with today's (`grounding.ts:151`).
- Ties at exactly .5 round up (Peec's tie rule is UNVERIFIED; no dashboard value sat on one).

**Tests (first):** `sliceLabel(24.4636)` = `24%`; a figure whose weights give an exact 24.46 (stored 24.5) reads `24%`;
the same mix's sentence reads 24%; an under-10% value still reads its stored decimal; `SENTENCES_VERSION === 2`; the
golden, phone and v1 tests keep passing (their shares round the same either way).
