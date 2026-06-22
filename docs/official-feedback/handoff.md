# Handoff Prompt — Post-Compaction Resume (PR Influence tab, mid-batch)

Copy everything below the `---` line into the new Claude Code session. It is self-contained and gives the new session everything it needs to continue exactly where this one left off.

---

You are picking up an in-flight session on the `avenue-z-reporting-v2` repo. Working directory: `/Users/thomaschangavenuez/Desktop/ave-z-reporting-official-feedback`. The prior chat was compacted in the middle of processing Tina's PR Influence tab feedback. **PR Influence work is in flight on branch `official-feedback-pr-influence-tab`, PR [#52](https://github.com/Avenue-Z/avenue-z-reporting-v2/pull/52), still draft.**

## CRITICAL — sandbox rule (re-confirmed by Thomas this session)

**Universal design / layout / UX changes are fine to apply to all clients.** That's already shipped to main and Renaissance / iPullRank / Shopify / etc. see the new AEO design with their own per-client data.

**Hardcoded Avenue Z content MUST be sandbox-gated to Avenue Z only.** Other clients see nothing in those slots. The slug is `'avenue-z'` (matches the URL slug used in `/dashboard/avenue-z/reports?...`).

There are exactly two sandboxed components today:

- `components/report-sections/peec-ai/winners-losers-cards.tsx` — gate at top with `const SANDBOX_CLIENT_SLUG = 'avenue-z'` and `if (clientSlug !== SANDBOX_CLIENT_SLUG) return null`.
- `components/report-sections/peec-ai/sentiment-insights.tsx` — same gate pattern.

If Tina sends another static-content ask, gate it the same way from day 1. Pass `clientSlug` down from the parent (the parent already has it in scope).

## Read these files in order before responding to me

1. `CLAUDE.md` — project conventions (Next.js 15 App Router, Drizzle/Neon, NextAuth v5, Glean-only LLM rule, etc.).
2. `docs/official-feedback/status.md` — branch state, PR mapping, per-tab workflow.
3. `docs/official-feedback/feedback-log.md` — FB-001 through FB-011 decision logs.
4. `docs/official-feedback/changelog.md` — terse SHA lookup.
5. `~/.claude/projects/-Users-thomaschangavenuez-Desktop-ave-z-reporting-official-feedback/memory/MEMORY.md` — persisted rules, especially the Glean-only LLM rule.

## First moves — do these IMMEDIATELY before any other work

1. **Read all 5 files above in order.**

2. **Confirm to me you read them** by quoting one specific decision from each of FB-005 (the Gemini bug fix), FB-009 (the synopsis ADD + KPI strip REMOVE), and FB-011 (Sentiment Insights placement correction).

3. **Verify lockstep with origin** with this exact command:
   ```
   git branch --show-current && \
   git fetch origin && \
   echo "local  $(git rev-parse HEAD)" && \
   echo "remote $(git rev-parse origin/official-feedback-pr-influence-tab)" && \
   git status --short && \
   gh pr view 52 --json state,isDraft,headRefOid --jq '{state, draft: .isDraft, head_sha: .headRefOid}'
   ```
   Expected: both SHAs identical, working tree clean, PR #52 state OPEN and draft true, PR head SHA matches local HEAD.

4. **Sanity-check the FB sandbox gates are intact**:
   ```
   grep -nE "SANDBOX_CLIENT_SLUG" components/report-sections/peec-ai/winners-losers-cards.tsx components/report-sections/peec-ai/sentiment-insights.tsx
   ```
   Expected: 4 hits (2 in each file).

5. Then say: **"Ready. Paste Tina's next PR Influence ask, or tell me what to do next."**

## Working rules — non-negotiable

These are the rules Thomas confirmed this session. Do not deviate.

1. **One user message = one FB group.** Multiple changes in one message become sub-items (`FB-NNN-a`, `b`, `c`). All sub-items in a group ship as ONE combined commit. FB IDs continue sequentially across branches — **next ID is FB-012**.

2. **Iterations on prior FB items get a new FB ID** (e.g. FB-011 was a placement correction for FB-010). Never reopen old FB IDs; keep the audit trail linear. Note lineage in the decision log.

3. **Avenue Z sandbox rule.** Layout / design / UX changes go to all clients. Hardcoded Avenue Z data must be gated to `clientSlug === 'avenue-z'` with the component returning `null` for any other client.

4. **Truth-grounded data only.** No proxies, no derivations that ship wrong numbers. If a metric is not computable, the card shows `--` with an honest tooltip. Never invent a value.

5. **No em-dashes in any copy you write.** Use periods or commas. Hard rule.

6. **Glean Chat API for ALL LLM inference.** No Vertex/Gemini, OpenAI, Anthropic direct. Canonical helper is `gleanChat()` in `lib/glean.ts`. Required env (already set in Vercel): `GLEAN_INSTANCE=avenuez`, `GLEAN_API_TOKEN` (user token — see token-type note below), `GLEAN_ACT_AS` (optional / unused for user tokens).

7. **User-token Glean caveat.** The configured `GLEAN_API_TOKEN` is a Glean USER token, not a GLOBAL token. User tokens REJECT the `X-Scio-Actas` header with HTTP 400. `gleanChat()` was patched in commit `f6b0534` to make ActAs opt-in only; callers that don't pass `options.actAs` skip the header. **If you write a new Glean caller, don't pass `actAs` unless you have a global token.** The `meeting-brief` route at `app/api/glean/meeting-brief/route.ts:48` still hardcodes `bill.hoerr@avenuez.com` and will hit the same 400; out of scope for AEO work but flag it if you touch that file.

8. **Universal across clients by construction (with the sandbox exception).** Edit shared components / data layers; never per-client conditionals EXCEPT for the Avenue Z sandbox gate.

9. **Every FB item gets a full decision log** in `feedback-log.md`: verbatim ask, what was unambiguous, what was inferred (with why), what was out of scope, files touched, scope of impact, verification, open risks. So Paul (or future-Thomas) can pick it up cold.

10. **Show receipts.** Every "done" claim has a file:line ref, a commit SHA, or a verification command output.

11. **PR Influence tab ONLY for this branch.** Scope is `components/report-sections/peec-ai/pr-influence.tsx`, `pr-influence-tables.tsx`, `pr-influence-synopsis.tsx`, `sentiment-insights.tsx`, and the supporting `lib/peec/pr-influence-synopsis.ts` / `lib/peec/url-citations.ts`. If feedback crosses into Overview / Content Impact / Technical Performance, flag it and STOP — that goes on a different branch. Exception: shared files (`lib/peec/client.ts`, `lib/peec/models.ts`, `lib/glean.ts`, `section-header.tsx`) are OK to touch; call out the cross-tab impact in the decision log.

12. **Tina is direct. Treat her words as authoritative intent, not suggestion.** Do not soften, "improve on," or reinterpret her asks. If you think she's wrong, say so explicitly to Thomas — never override silently.

13. **Make decisions, do not pepper Thomas with questions.** When ambiguous, pick the most defensible interpretation, document why in the decision log, and ship. The one exception: when the choice would ship wrong data or genuinely different visual outcomes, present a tight A-or-B and ask.

## State at handoff (locked-in lockstep)

| Item | Value |
|---|---|
| Current branch | `official-feedback-pr-influence-tab` |
| Local HEAD | `6758534` |
| Remote HEAD (`origin/official-feedback-pr-influence-tab`) | `6758534` (identical) |
| Working tree | clean |
| TypeScript | clean (`npx tsc --noEmit` zero output) |
| PR | [#52](https://github.com/Avenue-Z/avenue-z-reporting-v2/pull/52) OPEN + DRAFT, head SHA `6758534`, base `main` |
| `origin/main` HEAD | `8aa61a8` (includes Paul's #55 Renaissance Paid Search merge) — this branch is rebased on top of it |

## What is already shipped (Overview tab — merged to main)

All in [PR #50](https://github.com/Avenue-Z/avenue-z-reporting-v2/pull/50) (merged):

- **FB-001** `7097a19` — Consistent `<SectionHeader>` (green Sparkles / Megaphone / etc. + question + subtitle) across all 4 AEO tabs.
- **FB-002** `ae8fc06` — AEO Overview redesign: removed PeriodRibbon pills (002a), swapped 3 KPIs to Visibility / Citation Share / AI Referral Traffic (002b, truth-grounded for both Peec + Profound), added Executive Synopsis card at top (002c, later migrated to Glean in FB-003), added `Snapshot KPIs` eyebrow (002d), moved trend chart below KPI grid (002e).
- **FB-003** `e33ed66` — Migrated Overview synopsis from Vertex Gemini to Glean Chat API. Added reusable `gleanChat()` helper in `lib/glean.ts`. Cache version bumped `v1` → `v2-glean`.
- **FB-004** `da74c23` — Vertical axis (5 percent-tick labels) on the visibility trend chart.
- **FB-005** `6142968` — Disambiguated "Google" in Model Breakdown. Discovered via live Peec API probe that Gemini data was silently bucketed into the "Google" row (channel `google-2` = `gemini-scraper`). Fix: added `model_id` to brand/domain dimensions; inverted `normalizeSource` to prefer `row.model.id` over `row.model_channel.id`. Display label map renames canonical id `'Google'` to `'Google AI Overview'`. End-to-end verified.
- **FB-006** `d9f8f70` — Biggest Winners + Biggest Losers cards on AEO Overview, static Tina-curated content. **Sandbox-gated to Avenue Z only** (PR #54 added the gate post-ship).
- **FB-007** `2077037` — Removed BrandSOVChart ("Which categories of brands earn AI share of voice?") and BrandDefinitions ("What do these brand categories mean?"). Stretched Leaderboard to full width.
- **FB-008** `c19733e` — Recolored Domain Types chart + legend with the Avenue Z brand palette (Own cyan, Corporate yellow, Competitor purple, UGC green, Editorial blue, Reference / Institutional at 60% opacity, Other white-20%). Zero `#8A8A8A` gray remains.

Plus two follow-up fixes also merged to main:

- **Glean ActAs token-type fix** `f6b0534` — `gleanChat()` no longer auto-adds `X-Scio-Actas`; opt-in via `options.actAs`. Required because the configured token is a Glean user token, which rejects the header.
- **Vis-bar 0-100 scale** PR [#53](https://github.com/Avenue-Z/avenue-z-reporting-v2/pull/53) — Model Breakdown visibility bars now use absolute 0-100 scale, not relative-to-max. Previously a 47.9% Perplexity row got a full bar.
- **FB-006 sandbox gate** PR [#54](https://github.com/Avenue-Z/avenue-z-reporting-v2/pull/54) — Winners/Losers gated to `clientSlug === 'avenue-z'`.

## What is in flight (PR Influence tab — this branch, PR #52 draft, NOT yet merged)

- **FB-009** `9edb823` — first PR Influence batch:
  - **FB-009-a (ADD)** Executive Synopsis card at top of PR Influence tab. Mirrors FB-002c/FB-003 Overview synopsis shell. Glean-backed (`gleanChat`), strict-JSON output (`{synopsis, actions}`), cached 1h per `(clientSlug, dateRange)`, graceful try/catch fallback. PR-Influence-specific data inputs (matchback, brand-absent count, top opportunity clusters) via `PRInfluenceSynopsisContext`. Model-filter-agnostic by design.
  - **FB-009-b (REMOVE)** Deleted the entire Section A KPI Strip block — the duplicate `<h3>How is AI-driven PR coverage performing?</h3>` (the FB-001 SectionHeader already renders that question as the section title) plus all 6 `<KpiCard>` instances. Pruned dead intermediate display vars and imports (`KpiCard`, `PEEC`, `GA4`, `sumByModel`).
- **FB-010** `bf13917` — Sentiment Insights section: Tina's static example (89.4% positive, 8 positive themes with 24 URLs total, 2 weaknesses with explanation paragraphs). Sandbox-gated to Avenue Z. Client component (`'use client'`) using two `Set<number>` states for accordion expansion per side. Sentiment KPI pill (brand green) in card header; two-column accordion grid below.
- **FB-011** `b4906a2` — Placement correction for FB-010. Moved `<SentimentInsights>` from between Matchback and Top Editorial Domains to directly under Executive Synopsis. New page order:
  ```
  SectionHeader -> Synopsis -> Sentiment Insights -> Matchback -> Top Editorial -> Brand-Absent -> Opportunity Matrix -> Next Pitch -> Methodology
  ```

## Files that exist on this branch (sanity check)

```
components/report-sections/peec-ai/section-header.tsx              (FB-001)
components/report-sections/peec-ai/overview-synopsis.tsx           (FB-002c)
components/report-sections/peec-ai/winners-losers-cards.tsx        (FB-006, sandboxed)
components/report-sections/peec-ai/pr-influence-synopsis.tsx       (FB-009-a)
components/report-sections/peec-ai/sentiment-insights.tsx          (FB-010, sandboxed)
components/report-sections/peec-ai/pr-influence.tsx                (FB-009 + FB-011 modifications)
components/report-sections/peec-ai/index.tsx                       (Overview shell, FB-002/007/008 modifications)
components/report-sections/peec-ai/llm-breakdown-table.tsx         (FB-005 display labels + vis-bar fix)
lib/glean.ts                                                       (gleanChat helper + ActAs fix)
lib/peec/synopsis.ts                                               (FB-002c/FB-003 Overview synopsis data layer)
lib/peec/pr-influence-synopsis.ts                                  (FB-009-a PR Influence synopsis data layer)
lib/peec/models.ts                                                 (FB-005 MODEL_DISPLAY_LABELS map)
```

## Per-tab branch workflow

| Tab | Branch | PR | State |
|---|---|---|---|
| Overview | `official-feedback-overview-tab` | [#50](https://github.com/Avenue-Z/avenue-z-reporting-v2/pull/50) | MERGED |
| Vis-bar fix | `fix/llm-visibility-bar-scale` | [#53](https://github.com/Avenue-Z/avenue-z-reporting-v2/pull/53) | MERGED |
| FB-006 sandbox | `fix/sandbox-avenue-z-static-content` | [#54](https://github.com/Avenue-Z/avenue-z-reporting-v2/pull/54) | MERGED |
| **PR Influence** | **`official-feedback-pr-influence-tab`** | **[#52](https://github.com/Avenue-Z/avenue-z-reporting-v2/pull/52)** | **OPEN + DRAFT (this branch)** |
| Content Impact | `official-feedback-content-impact-tab` | (future) | not started |
| Technical Performance | `official-feedback-technical-performance-tab` | (future) | not started |

Each new tab cuts a new branch from `main` (after the previous tab merges in), and only contains changes to that one tab's render path. FB IDs continue sequentially across all branches; next ID after FB-011 is FB-012.

## When Tina sends new feedback on PR Influence

- Becomes **FB-012** (or FB-013, FB-014, ... in sequence).
- If multiple changes in one message: sub-items `FB-012-a`, `b`, `c`. One combined commit.
- Update `docs/official-feedback/feedback-log.md` with the full decision log entry.
- Update `docs/official-feedback/changelog.md` with the one-line summary + SHA (initially `(pending)`, backfill SHA in a docs-only follow-up commit after the main commit lands).
- Commit + push to `official-feedback-pr-influence-tab`. PR #52 auto-updates.
- New Vercel preview deploys automatically. Find the preview URL via:
  ```
  gh pr view 52 --json statusCheckRollup --jq '.statusCheckRollup[] | select(.targetUrl != null) | .targetUrl'
  ```

## If Tina sends iteration feedback on a prior FB item (Overview tab)

- Out of this branch's scope. PR Influence branch only.
- Cut a new branch from `main` named `iter/fb-NNN-<short-slug>` (or similar) and ship the fix as its own small PR.
- Or wait until the PR Influence batch is done and tackle Overview iteration on a fresh Overview-iteration branch.

## Required Vercel env vars (already set, just for reference)

| Var | Value | Used by |
|---|---|---|
| `GLEAN_INSTANCE` | `avenuez` | Both synopses |
| `GLEAN_API_TOKEN` | (user token; rotate before any leak) | Both synopses |
| `GLEAN_ACT_AS` | (optional, currently unused) | — |
| `clients.domain` populated in DB | per-client | Citation Share KPI on Overview |
| `clients.ga4_property_id` populated | per-client | AI Referral Traffic KPI on Overview, AI Referral Sessions on PR Influence |

If any required var is missing, the affected card falls back gracefully ("Synopsis is temporarily unavailable", `--`, etc.) and the rest of the page renders unaffected.

## Sandbox gate quick reference

To add a new sandboxed component for Avenue Z static content:

```tsx
'use client'  // or omit for RSC
// ... imports

const SANDBOX_CLIENT_SLUG = 'avenue-z'

export function YourComponent({ clientSlug }: { clientSlug?: string }) {
  if (clientSlug !== SANDBOX_CLIENT_SLUG) return null
  // ... rest of component
}
```

Then in the parent (`pr-influence.tsx` or `index.tsx`), pass `clientSlug={clientSlug}` — the parent already has `clientSlug` in scope from its prop signature.

## Do not start any code work until Thomas confirms what to do next

After your reading + sync check + greeting, **wait for Thomas's next message**. Possible directions:

- Tina sends new PR Influence feedback → FB-012, ship on this branch
- Tina signs off on PR Influence → mark PR #52 ready for review (`gh pr ready 52`) and merge
- Tina sends iteration on Overview / Content Impact / Tech Performance → separate branch
- Tina sends Content Impact or Tech Performance batch → cut new branch from `main`

Do not pre-empt. Wait.
