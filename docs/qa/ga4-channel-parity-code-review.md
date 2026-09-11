# Code Review Record — `ga4-channel-ordering` (PR #210)

**Feature under review:** PR #210 — Web Analytics channel parity with Overview, targeting `dev`.
**Diff range reviewed:** `7b51dc5..9b17514` (merge base with `dev` through branch head), 5 files, +107/−6. No unrelated code is in scope.
**Reviewers:** Paul (rounds 1–2), Thomas (author of `326c7c8`, and reviewer of the round-2 fixes).
**This document changes no code.**

Both commits touch only `components/report-sections/ga4/`. There are no `lib/` changes, so no other section can be affected.

Files in scope:

| File | Change |
|---|---|
| `components/report-sections/ga4/index.tsx` | `orderBys` on three channel queries; compare `limit` 10→25; share denominator |
| `components/report-sections/ga4/channel-tabs-chart.tsx` | `hasPrior` distinguishes absent from observed-zero |
| `components/report-sections/ga4/channel-share.ts` | new — `channelShareDenominator()` |
| `components/report-sections/ga4/channel-share.test.ts` | new — 3 tests |
| `components/report-sections/ga4/channel-tabs-chart.test.tsx` | new — 2 tests |

---

## §1 How it works

The Web Analytics (`ga4`) section and the Overview (`executive-overview`) section run the **same** GA4 channel query and, before this PR, could show different numbers for the same client and window. This PR closes three distinct causes of that divergence. Everything below comes from the GA4 Data API via `ga4Query` (`lib/ga4/client.ts`); there is no second source and no blending.

### 1.1 Which queries got ordered, and why it matters

`limit` without `orderBys` does **not** mean "top N" in the GA4 Data API — it means "any N". `326c7c8` adds `orderBys: [{ metric: { metricName: 'sessions' }, desc: true }]` to exactly three queries in the section's `Promise.all`:

| Line | Dimensions | Limit | Role |
|---|---|---|---|
| 144 | `sessionDefaultChannelGroup` | 10 | main channel-group chart |
| 160 | `sessionDefaultChannelGroup` | 25 | compare period, for deltas |
| 222 | `sessionDefaultChannelGroup, sessionSource, sessionMedium` | 150 | source/medium hover drilldown |

The plumbing spreads `orderBys` only when provided, so the change is strictly additive — the other eleven `limit`-bearing queries in the same `Promise.all` are untouched and behave exactly as before. This is the same mechanism already merged on the Overview side via PR #207.

### 1.2 Where the share percentage comes from

Each channel's share is `channelSessions / channelTotal`, and `channelTotal` is the number that changed.

**Before:** the sum of the rows the channel query returned. Those rows are capped at `limit: 10`, so any traffic outside the top ten made every percentage a share *of the returned rows*, not of total traffic.

**Now:** `channelShareDenominator(channelRes.rows, t.sessions)` (`channel-share.ts`), where `t.sessions` is the untruncated period total from the page's **undimensioned** totals query — the same query that feeds the page's own Sessions KPI, on the same `mainIso` range, already in scope and previously unused. The rule is `trueTotal != null && trueTotal > 0 ? trueTotal : rowSum`, so a failed totals query falls back to the old behavior rather than dividing by zero. This mirrors `buildChannelData` in `executive-overview/reshape.ts` exactly, which is what makes the two pages agree.

### 1.3 Absent from the compare period vs. genuinely zero

The hover panel shows each channel's prior-period sessions. `compareMap[name] ?? 0` could not tell two very different situations apart:

- the channel was **absent from the compare response** — it ranked outside that query's returned rows
- the channel was **observed at zero** prior sessions

Both rendered as a confident `Prior period 0`. Ordering the compare query without widening it made this worse, not better: truncation became *deterministic*, so a channel inside the current top 10 that ranked 11th last period was now reliably cut. Two changes fix it — the compare fetch widens to `limit: 25` (channel groups are a small, bounded dimension, so this costs nothing), and the chart uses `row.name in compareMap` to distinguish the cases. Absent renders `—` with no delta; a real observed zero still renders `0`.

### 1.4 Why channel shares can total more than 100%

Expected, and parity-correct. Two effects pull in opposite directions:

- traffic outside the top 10 makes the true total **larger** than the old row-sum denominator → shares decrease, summing below 100%
- GA4 session counts are **not perfectly additive** across a dimension, so the dimensioned rows sum roughly 1% **higher** than the undimensioned KPI → shares increase, summing above 100%

Whichever is larger for a given client wins. On `renaissance` the second did, and channels summed to **102%** (Thomas, live probe). Dividing by the true total is the correct share-of-total semantic and is precisely what Overview already does, so this is parity, not a defect. Recorded here because a stakeholder seeing 102% will otherwise report it as a bug.

### 1.5 Deliberate non-choices

- **The `orderBys` literal is duplicated three times** rather than hoisted. Intentional while the branch was stacked on #207, so the post-merge rebase stayed trivial. Now tracked in CLAUDE.md via PR #214.
- **The other eight rankable queries were left unordered.** Same class of bug, but out of scope for a parity fix. Tracked via #214.
- **The 150-row drilldown cap was left alone.** It fills from the highest-volume channels — but identically on *both* pages, so it is not an asymmetry this PR introduced and a fix must touch both. Tracked via #214.

---

## §2 Verification method

Findings were executed, not just read.

1. **Static anchors confirmed at the stated line** for every finding — `git show` at the reviewed SHA, not the working tree, since the working tree sat on an unrelated branch throughout.
2. **The two behavioral fixes were proven by red-green**, not assumed: each test was written first and watched fail with the exact production symptom (`expected '0' to be '—'`), then watched pass. Afterwards each fix was **reverted and re-run** to confirm the test genuinely catches the bug (exit 1), then restored (exit 0). Thomas independently repeated this mutation check.
3. **The share denominator was probed against live GA4** (read-only, last 30 days, `renaissance` and `avenue-z`): channel rows return in descending session order, and each share divides by the true KPI total, matching Overview. This is also what surfaced the 102% behavior in §1.4.
4. **Lint deltas were diffed against the pristine base** rather than reported raw — the 4 `react-hooks/preserve-manual-memoization` errors in `channel-tabs-chart.tsx` are byte-identical before and after and sit on untouched `useMemo` blocks.
5. **One claim was withdrawn under verification** (finding 7 below) — the code disproved the reviewer, not the other way round.

Gates at `9b17514`: `tsc --noEmit` exit 0 · `check:rsc` pass · full suite exit 0, 670 tests · CI `test` and `rsc-boundary` green on the runner.

---

## §3 Findings

Sev: **●** correctness · **○** cleanup/convention. Status: CONFIRMED (proven in-tree) / PLAUSIBLE (code assumption confirmed, external trigger unverified) / WITHDRAWN.

**Location convention:** findings *fixed on this branch* cite where the bug was, at `326c7c8`. Findings left as *follow-ups* cite where the code lives now, at `9b17514`.

| # | Sev | Status | Location | Finding | Resolution |
|---|---|---|---|---|---|
| 1 | ● | CONFIRMED | `index.tsx:152` | Compare query ordered but still `limit: 10`, making truncation deterministic; a grown channel read "Prior period 0" | Fixed in `9b17514` — widened to 25 |
| 2 | ● | CONFIRMED | `index.tsx:351` | `channelTotal` summed limit-capped rows, so every share was share-of-top-N | Fixed in `9b17514` — true total, row-sum fallback |
| 3 | ● | CONFIRMED | `channel-tabs-chart.tsx:185` | `?? 0` conflated "absent from compare response" with "observed zero" | Fixed in `9b17514` — `in` check, renders `—` |
| 4 | ○ | CONFIRMED | `index.tsx` | No test pinned the three `orderBys` lines through the promised rebase | Fixed in `9b17514` — 5 tests added |
| 5 | ● | CONFIRMED | `index.tsx:222` | 150-row drilldown cap fills from highest-volume channels; low-volume channel can render an empty hover panel | Follow-up — affects **both** pages, not an asymmetry this PR introduced (#214) |
| 6 | ○ | CONFIRMED | `index.tsx` | Eight other rankable queries still take an arbitrary N, notably the two compare fetches driving Top Pages / Entry Pages deltas | Follow-up (#214) |
| 7 | ● | **WITHDRAWN** | `channel-tabs-chart.tsx:67` | Claimed an absent channel also rendered a fabricated growth delta | **False.** `Delta` returns `null` when `!prior`, so a truncated channel showed `Prior period 0` with no delta. The wrong number was real; the fabricated percentage was not |
| 8 | ○ | CONFIRMED | `index.tsx:144` | `orderBys` literal pasted three times; `SESSIONS_DESC_ORDER` exists on the merged Overview side | Follow-up, deliberate at the time (#214) |
| 9 | ○ | CONFIRMED | UI-wide | Channel shares can total 102% | Not a defect — see §1.4. Documented in the PR body rather than changed |
| 10 | ○ | CONFIRMED | `channel-share.test.ts:6` | Cosmetic em dash in a comment | No change. House style: 71 test files use them, including the two merged Overview files this one mirrors; `ga4/index.tsx` has 23 in the same PR |

---

## §4 Detail on the load-bearing findings

**Finding 2 — share of total.** This is the one that made the PR fail its own stated goal. `326c7c8`'s commit message says the two pages "can show different channel numbers for the same client and window," but ordering alone does not fix that: with a row-sum denominator, `ga4` computes share-of-top-N while Overview computes share-of-total, so the percentages still disagree for any client with traffic outside the top ten. The fix had to change the denominator, not just the row order. `t.sessions` was already fetched on the same range and simply unused.

**Finding 1 — deterministic truncation.** Worth stating precisely, because the ordering commit *introduced* the determinism. Before ordering, the compare query returned an arbitrary 10 rows, so a given channel's absence was luck. After ordering, absence became a rule: any channel ranked 11th or lower in the compare period is guaranteed missing. The bug was latent before and reliable after — which is why it had to be fixed in the same PR rather than deferred.

**Finding 7 — the withdrawn claim.** The first review asserted that a truncated channel rendered "Prior period 0 plus a bogus growth Delta." Reading `Delta` (`channel-tabs-chart.tsx:67`) disproves it: `if (!prior) return null`, so a zero prior renders no percentage at all. The user-visible harm was a wrong prior-period *count*, not an invented growth rate. Recorded because a review record that only lists confirmed hits is not a record of what was actually verified. The fix still gates `Delta` on `hasPrior` to match the Overview twin, which changes no rendered output.

---

## §5 Follow-ups

Tracked in `CLAUDE.md` via **PR #214** rather than left in this document, because repo issues are disabled and a point-in-time record is not a tracker.

**None of these block the ship.** All were knowingly scoped out to keep #210 reviewable at 107 lines.

*Correctness, highest value first*
- The two compare fetches on `pagePath` / `landingPage` (`limit: 25`, unordered) drive Top Pages and Entry Pages delta arrows off an arbitrary slice — the same mechanism as finding 1, different widget. **This is the highest-value remaining item.**
- The 150-row source/medium drilldown cap (finding 5). Must be fixed on both pages together or it creates the asymmetry it currently lacks.

*Cleanup*
- Hoist `SESSIONS_DESC_ORDER` into `lib/ga4/` and import it on both sides (finding 8). Nothing blocks this now that #207 has merged.
- The remaining six unordered rankable queries.

*Explicitly not follow-ups*
- The two `dimensions: ['date']` trend queries (`limit: 90`) and `dayOfWeek, hour` (`limit: 200` against 168 possible combinations) are correctly bounded and need nothing. Recorded so a future pass does not re-derive it.
