# Handoff — Content Impact v1 SHIPPED + MERGED, ready for next round

> Copy everything below the `---` line into the new Claude Code session. Persisted on `main` as the durable recovery path.

---

You are resuming work on the `avenue-z-reporting-v2` repo at `/Users/thomaschangavenuez/Desktop/ave-z-reporting-official-feedback`.

## Current state (as of 2026-06-25)

- **Branch:** `main` at `db92aaea` (local = remote, working tree clean)
- **PR #77** (Content Impact tab v1) MERGED to `main` at `db92aaea`
- **PR #81** (Paul's separate AEO tab iterations) also merged just before #77
- **All FB-033 through FB-041 shipped** and live on production after merge

## What Content Impact tab now looks like (top → bottom)

1. SectionHeader (FB-001)
2. Executive Synopsis card (Glean, FB-033)
3. **§A Snapshot KPIs** — 4 cards: Citation Share, Prompt Coverage, AI Referral Traffic, Organic Traffic (each with delta when compare is on) — FB-034
4. **§B Watched Pages** — 9-col URL table, paginated to 10, default sort Citation Share desc, only `published` status, 5 metric deltas — FB-035
5. **§C Speed Stats** — 4 tiles + plain-English subtitle clarifying days-from-publish window — FB-036
6. **§D AI Bot Traffic vs. Human Traffic** — 4-quadrant scatter, always last-30 — FB-037
7. **§E Slope chart** — top 15 pages by abs delta, 3-toggle (AI Referral / Organic / Citation Share) — FB-038
8. **§F Fullsite Content Performance** — 6-col URL table, Page hyperlinked, 5 metric deltas — FB-039
9. **§H Competitor Analysis** SectionCard with:
   - **§H.1** ranking — Domain, AI Visibility, Citation Share, Prompt Coverage (each with delta) — FB-040
   - **§H.2** brand-absent — Domain, Article (title hyperlinked), Citation Share + delta, Competitors Mentioned — FB-041

## All 6 REMOVE items confirmed gone via grep (zero matches)

- "Which delivers more lift..."
- "Which content is decaying vs. compounding..."
- "Where is content disconnected from AI demand?"
- "Which competitor pages repeat across our target themes?"
- "Which AI systems are interacting with our content?"
- "What should the content team do next?"

## Cross-checked against Tina's Google Doc HTML export

The full HTML at `/Users/thomaschangavenuez/Downloads/AEO Intelligence Platform Feedback/AEOIntelligencePlatformFeedback.html` was parsed; all 16 Tina side comments [aa] through [ap] on the Content Impact section map 1:1 to shipped FBs. Literal title/subtitle blocks ([ac], [al], [an], [ap]) were verbatim-verified in source. **For future feedback rounds: ask Thomas to send the Google Doc HTML export instead of screenshots — every comment is in clean extractable form.**

## Closeout artifacts

- **Google Sheet:** populated columns A/B/C for 9 rows. CSV saved at `/Users/thomaschangavenuez/Downloads/Reporting Dash Feedback (Thomas Score Card) - Content Impact Tab.csv`. Removed sections NOT included in the sheet (nothing to track for those).
- **Slack to Tina:** sent confirming Content Impact done + sheet updated + awaiting her V2 review.
- **Production preview:** `https://avenue-z-reporting-v2-ap93gpj01-avenue-z-technology.vercel.app` (last preview before merge). Production now serves merged content.

## Next FB ID: FB-042

## First moves after compaction

1. **Verify lockstep:**
   ```
   git branch --show-current && git fetch origin && \
   echo "local  $(git rev-parse HEAD)" && \
   echo "remote $(git rev-parse @{u})" && \
   git status --short
   ```
   Expected: on `main`, local = remote = `db92aaea` or later, clean tree.

2. **Run tsc + 6 tests:**
   ```
   npx tsc --noEmit
   DATABASE_URL=postgres://test:test@localhost/test npx tsx lib/ga4/client.test.ts
   npx tsx lib/peec/bot-vs-human-scatter.test.ts
   npx tsx lib/peec/slope-chart.test.ts
   npx tsx lib/peec/url-citations.test.ts
   npx tsx lib/peec/content-impact-synopsis.test.ts
   npx tsx lib/ga4/content-derive.test.ts
   ```
   Expected: tsc empty; every test prints `all assertions passed` (synopsis test prints 2 lines).

3. **Reply to Thomas verbatim:**
   > Synced. On `main` at `db92aaea`. Content Impact v1 (FB-033 through FB-041) merged via PR #77. Sheet updated, Tina notified. Next FB ID FB-042. Standing by. Literal interpretation only.

4. **Wait for Thomas.** Do not scaffold proactively. If Thomas hands you HTML feedback file, parse it directly.

## Working rules (non-negotiable, same as prior branch)

1. **Literal interpretation only.** If Tina did not explicitly ask, do not change.
2. **Glean Chat API for ALL LLM inference.** `gleanChat()` in `lib/glean.ts`. No `actAs`.
3. **No em-dashes** in any new code, comment, copy, or docs. Commas, periods, or hyphens.
4. **Truth-grounded.** Uncomputable metric → render `--`. Never fake zero.
5. **Plan-first** via `superpowers:writing-plans` → `superpowers:subagent-driven-development`.
6. **One user message = one FB.** Multi-part = `FB-NNN-a/b/c`. Hotfixes share parent FB ID.
7. **Every FB:** feedback-log + changelog + status.md bump + sheet row + commit + push.
8. **Never skip hooks. Never force-push. No Neon migrations without Paul approval.**
9. **Before adding cross-cutting plumbing (compareRange, dateRange, units), grep siblings.** Lesson from FB-035 hotfix #1 (deriveCompareRange not parseDateRange) AND FB-039 hotfix (engagement rate `* 100` in BOTH renderer AND delta).
10. **GA4 `engagementRate` is a fraction [0,1].** Any consumer must `* 100` in BOTH renderer AND delta.
11. **Compare-period gating:** all deltas gate on `compareIso !== null` per FB-034 hotfix #2.
12. **FB-031 hardening pattern** for any Glean-backed prose. Validator patterns SPECIFIC.

## Tooling

- `npx tsc --noEmit` (zero output = clean)
- `npx tsx <file>.test.ts` (NOT vitest); `client.test.ts` needs `DATABASE_URL=postgres://test:test@localhost/test`
- `vercel logs <preview-url> --since 1h --expand` (authed as `thomaschang-avez`)
- `vercel ls avenue-z-reporting-v2 --yes` to list deployments
- `gh pr view <N> --repo Avenue-Z/avenue-z-reporting-v2` for PR state

## Thomas's posture

Correctness above all. QA sweeps. Receipts. No assumptions, no decisions beyond Tina's literal ask. If implied but not explicit, ASK before acting. Sheet Column F should answer Tina's question directly (paste-ready). All copy: no em-dashes, plain language.

Content Impact v1 is closed. Awaiting Tina V2 review feedback or next tab feedback (likely Technical Performance or Overview iterations).
