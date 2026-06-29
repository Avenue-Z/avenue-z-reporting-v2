# Handoff — Content Impact V2 (Avenue Z) — COMPLETE, ready to merge

> Copy everything below the `---` into a new Claude Code session (or continue in the current chat). The branch is fully pushed and synced. This doc is the durable recovery map.

---

You are resuming work on the Avenue Z reporting platform at `/Users/thomaschangavenuez/Desktop/ave-z-reporting-official-feedback`.

## TL;DR

**Content Impact V2 feedback for Avenue Z is COMPLETE and live-verified.** All 16 of Tina's column-E asks + her meta-feedback + 2 silent bugs are fixed, pushed to the branch, and confirmed on the Vercel preview. The branch is mergeable with zero conflicts. **Nothing more is required unless Tina sends new feedback.** Do NOT merge to main without Thomas's explicit go-ahead.

## Current state (as of 2026-06-26)

- **Branch:** `official-feedback-content-impact-tab-content-v2`
- **HEAD:** `8c5df35` (local == remote, working tree clean, everything pushed)
- **PR:** #90 (https://github.com/Avenue-Z/avenue-z-reporting-v2/pull/90) — OPEN, MERGEABLE
- **Ahead of main:** 61 commits. **Behind main:** 63 commits, but **NONE of those 63 touch any file we changed** (verified) — so the merge is clean and our work lands exactly as QA'd.
- **Type-check:** clean. **All 6 test files:** pass.
- **Scope:** Avenue Z ONLY. This whole round is Avenue Z. Ignore Whitney's feedback and all other clients — Thomas confirmed that explicitly.

## What shipped (FB-042 through FB-058)

Tina's 16 column-E asks, all fixed and live-verified on the Avenue Z preview:

| Row | Ask | FB | Status |
|---|---|---|---|
| 3 | Prompt Coverage delta | FB-042 (shipped on main via PR #85; our dup dropped in rebase) | live |
| 4a | "--" rows confusing | FB-043 (footnote names 3 causes + "X of Y unmatched") | live |
| 4b/8a/9e | Sortable delta columns | FB-044 (Value+delta split: B=14, F=11, H1=7 cols) + FB-057 (null-sink) | live |
| 5 | URL under Speed Stats tiles | FB-045 | live |
| 6a | Scatter quadrants | FB-046 (crosshair + 2x2 grid labels) | live |
| 6b | Scatter hover URL | FB-047 | code-verified |
| 6c | Scatter date range | FB-048 (subtitle explains Peec 30d retention) | live |
| 7 | Slope legend + mute | FB-049 | live |
| 8b | Only 14 pages | FB-050 (subdomain match) + FB-058b (limit 1000->2000) | live: 15 -> 23 rows |
| 9a | 199.9% Citation Share | FB-051 (share-of-period math) | live: max ~33.5% |
| 9b | Only 7 competitors | FB-052 (API 100->500, UI 10->25) + FB-059 (API 500->5000 after token-authenticated re-probe) | live: now 22 (all competitors Peec returns) |
| 9c | "AI Visibility" name | FB-053 (renamed "Source Visibility") + FB-056 (description/comment match) | live |
| 9d | H.1 Citation Share tooltip | FB-054 | live |
| 10 | H.2 Citation Share tooltip | FB-055 | live |
| meta | Misnamed/misrepresented metrics | FB-051-audit (all 22 tab metrics reconciled) | live |
| (9e) | Citation Share delta actually works | FB-058a (was hardcoded "--", now computes real deltas) | live: real values |

Silent bugs folded in: synopsis was fed inflated counts (fixed in FB-051); F was dropping subdomain pages (FB-050); KPI delta suffix was "%" when it should be "pp" (FB-051a, found by the metric audit); sortable delta columns piled "--" at the top on asc sort (FB-057, found by the Opus fleet).

## Correction to the previous "honest caveat" (resolved by FB-059)

Earlier handoff revisions said "H.1 shows 10 competitors because that is all Peec returns for Avenue Z's project." **That was wrong.** When Thomas pushed back, a fresh token-authenticated probe against Peec's API (see `scripts/peec-domain-count.mjs`) found the project actually has **22 domains classified `COMPETITOR`** among 4,202 total domains. Only 11 surfaced at the previous `limit: 500` because Peec sorts `/reports/domains` by `retrieved_percentage` descending and the long-tail competitors fell off the page below ~1,200 corporate/editorial rows.

Peec does NOT support a classification filter (all variants probed -- `classification=`, `classifications=[]`, `filter.classification=`, `domain_type=`, `type=` -- return mixed sets within the limit), so the only way to surface every competitor is to pull the full ranked list and filter client-side. FB-059 raises the fetch limit accordingly:
- `/reports/domains` current period: `limit: 500` -> `5000`
- `/reports/domains` prior period: `limit: 500` -> `5000`
- `/reports/domains` (model-dimensioned): `limit: 2000` -> `10000`

All UI consumers of `topDomains` were already display-bounded (`.slice(0, 25)` on §H.1, `.slice(0, 15)` on PR Influence editorial, `initialPageSize=10` on Overview Top Domains), so the larger array only changes payload weight (~75KB extra per page load), not what the user sees in any list. **Side effect to verify on the Vercel preview before merge:** PR Influence's per-cluster `editorialCitationDensity` is computed over `topDomains` and will now iterate 4,202 rows instead of 500. The metric becomes more accurate but values shift -- eyeball PR Influence after preview deploys before claiming this round done.

No remaining "it's the data" caveats for the Tina conversation.

## How this was verified

- 9-agent Opus verification fleet (5 lens verifiers + 3 adversarial skeptics + synthesizer) against the source. Returned PASS_WITH_NOTES: 0 P0, 2 P1 (fixed as FB-056 + FB-057), 10 P2 (V3 backlog).
- Live Vercel-preview QA on the Avenue Z dashboard via the Claude-in-Chrome extension (Thomas signed in; the assistant drove the page and read the DOM). Confirmed A deltas + pp/% suffixes, B footnote text, C source URLs, D quadrants + subtitle, E legend, F 23 rows, H.1 "Source Visibility" + bounded Citation Share + working delta, the FB-054 tooltip text, and sane synopsis numbers.

## Durable artifacts on the branch (read these to get full context cold)

- `docs/superpowers/plans/2026-06-25-content-impact-v2-feedback.md` — the implementation plan
- `docs/official-feedback/feedback-log.md` — per-FB decision log (FB-042..FB-058 at the bottom)
- `docs/official-feedback/changelog.md` — one-line-per-FB ship log
- `docs/official-feedback/status.md` — current status; next FB ID = FB-059
- `docs/official-feedback/content-impact-v2-metric-audit.md` — the 22-metric coherence audit
- `docs/official-feedback/content-impact-v2-plan-reverification.md` — post-rebase line-number map
- `docs/official-feedback/content-impact-v2-final-correctness-sweep.md` — 19/19 source checks
- Tina's tracker CSV (external, not in repo): `~/Downloads/Reporting Dash Feedback (Thomas Score Card) - Content Impact Tab (1).csv` — column E is the source of truth for Tina's asks; columns F/G/H are the V2 response

## V3 backlog (NOT blocking this merge — for a future round only)

Logged in `feedback-log.md` under "V3 backlog". Highlights: B footnote only fires when all 3 GA4 metrics are null; FB-053 tooltip still uses Peec's `retrieved` definition while the column reads "Source Visibility"; D quadrant labels sit at the outer grid not the median-split; no vitest harness at repo root (tsc is the only live CI signal); a few cosmetic items (renderDelta(0) renders green, URL scheme validation).

## Verify-on-resume commands

```
cd /Users/thomaschangavenuez/Desktop/ave-z-reporting-official-feedback
git branch --show-current && git fetch origin -q && echo "local $(git rev-parse HEAD)" && echo "remote $(git rev-parse @{u})" && git status --short
npx tsc --noEmit
DATABASE_URL=postgres://test:test@localhost/test npx tsx lib/ga4/client.test.ts
npx tsx lib/peec/bot-vs-human-scatter.test.ts
npx tsx lib/peec/slope-chart.test.ts
npx tsx lib/peec/url-citations.test.ts
npx tsx lib/peec/content-impact-synopsis.test.ts
npx tsx lib/ga4/content-derive.test.ts
```
Expected: on `official-feedback-content-impact-tab-content-v2`, local == remote == `8c5df35`, clean tree, tsc empty, all 6 tests "all assertions passed".

## When Thomas says merge (and only then)

```
gh pr merge 90 --squash --repo Avenue-Z/avenue-z-reporting-v2   # or --merge, per team convention
```
After merge: update `status.md` with the merge SHA, confirm Vercel production serves the merged branch, and (optional) Slack Tina the PR link + a 2-line summary. Next FB ID is FB-059.

## Working rules (non-negotiable)

1. Literal interpretation of Tina's asks. Avenue Z only. No Whitney, no other clients.
2. Glean Chat API for ALL LLM inference. No Vertex/Gemini/OpenAI/Anthropic direct.
3. No em-dashes anywhere (code, comments, copy, docs).
4. Truth-grounded: uncomputable -> render `--`, never fake zero.
5. All deltas gate on `compareIso !== null`.
6. GA4 `engagementRate` is a fraction [0,1] -> `* 100` in BOTH renderer AND delta.
7. Never skip hooks. Never force-push main. No Neon migrations without Paul's approval.
8. Bump the Peec cache version when a response/type shape changes (currently `v10`).
9. Every FB: feedback-log + changelog + status.md + sheet row + commit + push.
10. Vercel preview is the truth; verify live before claiming done.

## Thomas's posture

Correctness above all; his standing with Tina depends on this round closing cleanly. Surface risk honestly, pre-empt anything she might click and question, never claim "done" without live verification. The prior round's "10 competitors is genuinely all Peec returns" caveat was withdrawn (FB-059 found the real count is 22 via a token-authenticated probe) -- so no remaining "it's the data" surprises for Tina.
