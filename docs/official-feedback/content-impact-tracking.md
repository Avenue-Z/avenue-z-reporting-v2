# Content Impact tab — feedback tracking

Living doc. Captures every Tina ask + what shipped, in real time. Becomes the source material for the v1 scorecard CSV we send Tina after the batch closes.

**Branch:** `official-feedback-content-impact-tab` (cut from `main` 2026-06-23)
**Source feedback:** Tina's Google Doc — pasted into this session 2026-06-23, transcribed verbatim into the "Asks queue" section below before any code is touched.
**FB ID range:** FB-020 onwards (sequential — reclaimed from the parked Overview plan per Thomas).
**Governing rule:** Working Rule #11 — Tina's recommended Content Impact layout is the FULL spec. Anything currently rendering on the tab that is not in her layout gets removed by default.

---

## Workflow (v1 → v2)

1. **Now:** Tina's Google Doc feedback is transcribed verbatim into "Asks queue" below. Each ask gets a sequential FB ID. I implement, capturing receipts in "Shipped FB log" as I go.
2. **After v1 closes:** I build `content-impact-scorecard.csv` from "Shipped FB log" in the same A-E schema as Overview (Tab / Your ask / What shipped / Accepted? / Your feedback). Thomas sends to Tina.
3. **Tina reviews CSV:** fills column D (✅ / ⚠️) and column E (v2 feedback) directly in the sheet.
4. **v2 iteration:** sweep her column E feedback like we did for Overview, plan, ship. New FB IDs.

---

## Asks queue (transcribe Tina's Google Doc here, verbatim)

> _Pending — paste Tina's Google Doc Content Impact section here when ready. One ask per row. Quote her exact words; no paraphrasing._

| Pending FB ID | Tina's verbatim ask (column B equivalent) | Notes |
|---|---|---|
| FB-020 | _(awaiting paste)_ | |
| FB-021 | _(awaiting paste)_ | |
| FB-022 | _(awaiting paste)_ | |

_(Add rows as needed. Once the queue is filled, I'll triage them into commit batches per the per-tab workflow.)_

---

## Recommended layout (paste from Tina's mockup when ready)

> _Pending — when Tina's Google Doc includes a "Recommended layout" mockup or sketch, paste/describe the section order here. This becomes the canonical full-spec for Rule #11 audits._

---

## Shipped FB log

Sequential. One row per FB item the moment it ships. Each row carries the data we'll need for the v1 scorecard CSV.

| FB ID | Tina's verbatim ask (B) | What shipped (C — one-liner ready for scorecard) | Commit SHA | File:line receipts |
|---|---|---|---|---|
| _none yet_ | | | | |

---

## Sandbox + governing rules reminder

Same rules from earlier work apply here. Specifically:

1. **Universal across clients by default.** Layout / design / UX changes apply to every client.
2. **Sandbox-gate Avenue-Z-only static content.** Pattern: `const SANDBOX_CLIENT_SLUG = 'avenue-z'` + `if (clientSlug !== SANDBOX_CLIENT_SLUG) return null` at the top of the component. Existing sandboxed components: `winners-losers-cards.tsx`, `sentiment-insights.tsx`.
3. **Recommended layout = full spec** (Rule #11). Remove anything not in her layout by default.
4. **Glean Chat API only** for any LLM inference (`gleanChat()` in `lib/glean.ts`).
5. **No em-dashes** in copy I write.
6. **Literal text** over interpretive text (Rule #13). Use Tina's exact column labels, button copy, intro paragraphs.

---

## Files in scope for this branch

Per the established per-tab workflow:

| File | Purpose |
|---|---|
| `components/report-sections/peec-ai/content-impact.tsx` | Main RSC for the Content Impact tab |
| `components/report-sections/peec-ai/content-impact-tables.tsx` | Tables module |
| `lib/peec/client.ts` | Data layer (shared — flag any cross-tab impact) |
| `lib/peec/url-citations.ts` | URL/citation helpers (shared) |

Touching shared files (`section-header.tsx`, `lib/peec/client.ts`, `lib/peec/models.ts`, `lib/glean.ts`) is OK — call out the cross-tab impact in the per-FB decision log.

---

## CSV export prep

When the v1 batch closes, the scorecard CSV gets built from "Shipped FB log" above. Schema (matches Overview scorecard format exactly):

```
Tab,Your ask,What shipped,Accepted?,Your feedback
Content Impact,<verbatim from column B>,<one-liner from column C>,,
...
```

Columns D and E are left empty for Tina to fill.
