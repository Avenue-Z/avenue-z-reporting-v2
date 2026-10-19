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
  the 2026-10-19 finding. `buildSnapshotData` already reads the field named there (`metrics.ts:222`), so no logic
  changes in `metrics.ts`.
- `DomainRow` (`pull.ts:19-26`) gains `usage_rate: number`.
- The domains contract (`contracts.ts:77-78`, `peec.domains_report`, enforce) gains `usage_rate: z.number().min(0)`
  (finite, non-negative; not `ratio`, because it exceeds 1). Measured 2026-10-19 on 11 pitch projects' full windows:
  16,835 of 16,835 rows carry a finite `usage_rate`, none negative, max 1.399. A missing or broken value fails the run
  with a named contract violation, like every other enforced field (no off switch, my rule).
- The Glean Data block line (`prompt.ts:56`) says "Source types by share of retrievals"; it becomes "Source types by
  share of AI use (Peec's usage rate)". Glean writes no numbers (#388); this keeps its context accurate.
- Effects, all intended: `sourceMix[].pct` (`metrics.ts:231`) is now the usage-rate share, so the "Source mix" sentence
  (`sentences.ts:186-206`) and its "Limited editorial and UGC presence" rule (`:202`, under 10% each) read the new
  shares with unchanged wording and rounding. `SENTENCES_VERSION` (`config.ts:34`) is **not** bumped: it guards
  wording and rounding, and an older row keeps its stored `sourceMix` (`contracts.ts:155`), so its sentences recompute
  as before.

## 3. Change B: whole-number labels on the donut

- `sourceDonutFigure` (`charts.ts:73-87`) labels each slice with text computed in code from the exact share,
  `weight / total`, not from the stored one-decimal `pct` (so no double rounding): `Math.round(share * 100)` then `%`; a
  slice with a positive weight that rounds to 0 reads `<1%`. The trace uses `textinfo: 'text'` and `text: [...]`
  instead of `textinfo: 'percent'`.
- Hover: `Retrievals: %{value}` (`charts.ts:82`) is no longer true (the value is a sum of rates). It becomes
  `<b>%{label}</b><br>%{text} of sources<extra></extra>`.
- Whole numbers may not sum to 100 (Peec's own: 99 on PocketGuard). Ties at exactly .5 round up; Peec's tie rule is
  UNVERIFIED (no dashboard value sat on a tie).
- **Sentences are unchanged** (Ryan's format, `sentences.ts:13-17`: one decimal under 10%), so a slice under 10% can
  read "8.4%" in a sentence and "8%" on the chart. Decision D1 below.

## 4. Change C: a same-day data warning

- New note kind `same_day_data` in `NOTE_KINDS` (`notes.ts:3-10`). It is not in `ABOUT` (`notes.ts:18`), so it shows
  under "Check these" with its own "Looks right" tick, like `requested_range`. Approve is not blocked by it (only
  `needs_validation` blocks, `editor.tsx:333`).
- Condition, in `buildSnapshotData` beside `requested_range` (`metrics.ts:184-186`): the window's last day equals the
  UTC day of `generatedAt` (`pull.window.end === generatedAt.slice(0, 10)`), both UTC as everywhere else
  (`range.ts:1,9`). No new input: `generatedAt` is already passed (`generate.ts:51`).
- Text: `This report includes {fmtDay(window.end)}, the day it was generated, and Peec can still update that day's
  data. Rerun just before sending so the numbers match Peec.`
- A rerun is a new generation, so its own check runs again (`generate/route.ts:59-67`, verified live 2026-10-19).

## 5. What does not change

- **Sent reports:** an approved row serves the HTML frozen at approval (`store.ts:77-79`; public link
  `app/snapshot/[token]/route.ts:24-26`; staff preview `reports/[id]/view/route.ts:49-50`). No sent page changes.
- **Drafts made before this ships:** their stored `sourceMix` keeps `retrieval_count` weights until a Rerun; the chart
  is drawn at render (`render.ts:270`), so they get whole-number labels on their old weights. They get no same-day note
  (notes are written at generation).
- KPIs, rank, own-site retrievals (already `retrieved_chat_count`, which matches the dashboard's domain list), gaps,
  windows, models: unchanged.

## 6. Edge cases

| Case | Expected |
|---|---|
| A domain row without `usage_rate`, or negative, or not a number | contract violation, the run fails with its name |
| `usage_rate` above 1 | accepted (measured up to 1.399) |
| Every `usage_rate` is 0 | empty source mix and the existing `empty_source_mix` note (`metrics.ts:232`) |
| One classification only | one slice labeled `100%`; sentence unchanged ("all … sources") |
| A slice under 0.5% | label `<1%` |
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
4. Donut: `text` is the whole-number share from exact weights (a case where the 1-decimal pct would round differently,
   e.g. weights giving 18.45%); `<1%` for a tiny slice; `textinfo: 'text'`; the new hover. The AIVx golden test
   (`charts.test.ts:21-30`) states these as deliberate differences, as it does the hover today.
5. Older-row rendering (`v1-compat.test.ts:43`) gains the donut difference as one more listed replacement.
6. Notes: `same_day_data` is a Check these item; generation on the window's last day writes it with the text above;
   one day later writes none.
7. Prompt: the Data block line reads the new wording.
8. Every existing test passes, with fixtures given `usage_rate` where the contract now needs it.

## 8. Verification beyond tests

`make check`. In the browser on the branch (dev database), generate PocketGuard: the donut reads 37, 19, 17, 9, 8, 4, 3,
2 against my dashboard screenshot (or today's live values), the hover reads the share, and Before you send shows the
same-day note with a Looks right tick. An older dev draft still renders.

## 9. Decisions for Thomas

- **D1:** the chart shows whole numbers (Ryan's yes); the sentences keep his example's format (one decimal under 10%).
  Recommended: keep, since the format came from his example. Alternative: whole numbers in the source-mix sentence too.
