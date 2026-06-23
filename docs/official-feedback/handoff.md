# Handoff Prompt — Post-Compaction Resume (Overview iteration incoming)

Copy everything below the `---` line into the new Claude Code session. It is self-contained and gives the new session everything it needs to continue exactly where this one left off.

---

You are picking up an in-flight session on the `avenue-z-reporting-v2` repo. Working directory: `/Users/thomaschangavenuez/Desktop/ave-z-reporting-official-feedback`. The prior chat was compacted right after the PR Influence tab batch shipped and merged to prod, and Tina just started sending iterative feedback on the Overview tab.

## Where things stand

- **PR Influence tab:** Fully shipped + merged to `main` and deployed to prod. FB-009 through FB-019 closed. See [docs/official-feedback/changelog.md](docs/official-feedback/changelog.md) for one-line SHA lookups.
- **Overview tab:** Initial batch (FB-001 through FB-008 + sandbox / vis-bar / Glean hotfixes) shipped + merged a few days ago. Tina is now QA-ing live and sending iteration feedback.
- **First Overview iteration ask received** (2026-06-22):
  > "REMOVE Chart: 'Which prompts are AI engines answering with our brand?' at the very bottom. This wasn't explicitly stated to remove in the initial doc, but it was not included in the recommended layout."
- **NEW GOVERNING PRINCIPLE confirmed by Tina** (2026-06-22):
  > "It seems like the guiding principle for this exercise is if it's not in the recommended layout, then it's gone."

The principle is now Working Rule #11 (see below). It's the lens for every future feedback batch.

## CRITICAL — Avenue Z sandbox rule (still in force)

**Universal design / layout / UX changes are fine to apply to all clients.** That's already shipped to main and Renaissance / iPullRank / Shopify / etc. see the new AEO design with their own per-client data.

**Hardcoded Avenue Z content MUST be sandbox-gated to Avenue Z only.** Other clients see nothing in those slots.

There are exactly two sandboxed components today:

- `components/report-sections/peec-ai/winners-losers-cards.tsx` — gate at top with `const SANDBOX_CLIENT_SLUG = 'avenue-z'` and `if (clientSlug !== SANDBOX_CLIENT_SLUG) return null`.
- `components/report-sections/peec-ai/sentiment-insights.tsx` — same gate pattern.

If Tina sends another static-content ask, gate it the same way from day 1. Pass `clientSlug` down from the parent.

## Read these files in order before responding to Thomas

1. `CLAUDE.md` — project conventions (Next.js 15 App Router, Drizzle/Neon, NextAuth v5, Glean-only LLM rule, etc.).
2. `docs/official-feedback/status.md` — branch state, PR mapping, per-tab workflow, current FB log, working rules (including the new Rule #11).
3. `docs/official-feedback/feedback-log.md` — FB-001 through FB-019 decision logs.
4. `docs/official-feedback/changelog.md` — terse SHA lookup.
5. `docs/official-feedback/tina-scorecard.md` + `tina-scorecard.csv` — Tina-facing scorecard. Useful if Tina references "the scorecard" in her replies.
6. `~/.claude/projects/-Users-thomaschangavenuez-Desktop-ave-z-reporting-official-feedback/memory/MEMORY.md` — persisted rules, especially the Glean-only LLM rule.

## First moves — do these IMMEDIATELY before any other work

1. **Read all 6 files above in order.**

2. **Confirm to Thomas you read them** by quoting one specific decision from each of: FB-005 (the Gemini bug fix), FB-015 (Matchback removal — application of the new Rule #11 before it was articulated), and FB-018 (Tap → Click verb literal-match fix).

3. **Verify lockstep with origin** with this exact command:
   ```
   git branch --show-current && \
   git fetch origin && \
   echo "local  $(git rev-parse HEAD)" && \
   echo "remote $(git rev-parse @{u})" && \
   git status --short && \
   echo "main HEAD: $(git rev-parse origin/main)"
   ```
   Expected: local SHA = remote SHA; working tree clean.

4. **Sanity-check the sandbox gates are intact**:
   ```
   grep -nE "SANDBOX_CLIENT_SLUG" components/report-sections/peec-ai/winners-losers-cards.tsx components/report-sections/peec-ai/sentiment-insights.tsx
   ```
   Expected: 4 hits (2 in each file).

5. **Sanity-check the tracked-prompts chart is STILL THERE** (Tina has flagged it for removal but Thomas asked to wait for her full Overview pass):
   ```
   grep -nE "Which prompts are AI engines answering with our brand" components/report-sections/peec-ai/tracked-prompts-chart.tsx components/report-sections/profound-ai/tracked-prompts-chart.tsx
   ```
   Expected: 2 hits (one per file). Do not remove yet.

6. Then say: **"Ready. Paste Tina's next Overview ask, or tell me what to do next."**

## Working rules — non-negotiable

These are the rules Thomas confirmed across this workstream. Do not deviate.

1. **One user message = one FB group.** Multiple changes in one message become sub-items (`FB-NNN-a`, `b`, `c`). All sub-items in a group ship as ONE combined commit. FB IDs continue sequentially across branches — **next ID is FB-020**.

2. **Iterations on prior FB items get a new FB ID** (e.g. FB-011 was a placement correction for FB-010). Never reopen old FB IDs; keep the audit trail linear. Note lineage in the decision log.

3. **Avenue Z sandbox rule.** Layout / design / UX changes go to all clients. Hardcoded Avenue Z data must be gated to `clientSlug === 'avenue-z'` with the component returning `null` for any other client.

4. **Truth-grounded data only.** No proxies, no derivations that ship wrong numbers. If a metric is not computable, the card shows `--` with an honest tooltip. Never invent a value.

5. **No em-dashes in any copy you write.** Use periods or commas. Hard rule.

6. **Glean Chat API for ALL LLM inference.** No Vertex/Gemini, OpenAI, Anthropic direct. Canonical helper is `gleanChat()` in `lib/glean.ts`. Required env (already set in Vercel): `GLEAN_INSTANCE=avenuez`, `GLEAN_API_TOKEN` (user token — see token-type note below), `GLEAN_ACT_AS` (optional / unused for user tokens).

7. **User-token Glean caveat.** The configured `GLEAN_API_TOKEN` is a Glean USER token, not a GLOBAL token. User tokens REJECT the `X-Scio-Actas` header with HTTP 400. `gleanChat()` was patched in commit `f6b0534` to make ActAs opt-in only; callers that don't pass `options.actAs` skip the header. **If you write a new Glean caller, don't pass `actAs` unless you have a global token.**

8. **Universal across clients by construction (with the sandbox exception).** Edit shared components / data layers; never per-client conditionals EXCEPT for the Avenue Z sandbox gate.

9. **Every FB item gets a full decision log** in `feedback-log.md`: verbatim ask, what was unambiguous, what was inferred (with why), what was out of scope, files touched, scope of impact, verification, open risks.

10. **Show receipts.** Every "done" claim has a file:line ref, a commit SHA, or a verification command output.

11. **🔴 Recommended layout = full spec.** *(Added 2026-06-22, confirmed by Tina.)* When Tina sends a "Recommended layout" mockup for a tab, treat it as the COMPLETE spec, not a list of edits. Anything currently rendering on the tab that is NOT in her recommended layout gets removed by default. Applies retroactively when iterating on a tab: audit what's still rendering vs her latest layout sketch and remove what's not there. Confirmed by Tina when she said: *"It seems like the guiding principle for this exercise is if it's not in the recommended layout, then it's gone."*

12. **Tina is direct. Treat her words as authoritative intent, not suggestion.** Do not soften, "improve on," or reinterpret her asks. If you think she's wrong, say so explicitly to Thomas — never override silently.

13. **Literal text over interpretive text.** When Tina writes specific words (column labels, button copy, intro paragraphs), use her literal words even if the data underneath is framed differently. FB-017 ("Negative Themes" not "Weaknesses") and FB-018 ("Click" not "Tap") were preventable literal-match misses on FB-010 that Thomas had to round-trip.

14. **Make decisions, do not pepper Thomas with questions.** When ambiguous, pick the most defensible interpretation, document why in the decision log, and ship. The one exception: when the choice would ship wrong data or genuinely different visual outcomes, present a tight A-or-B and ask.

## What's known pending from Tina

- **Content Impact v1 run STARTING 2026-06-23.** Active branch is `official-feedback-content-impact-tab` (cut from `origin/main` 2026-06-23). Tina's feedback comes from a Google Doc this round — NOT a CSV yet. CSV gets built AFTER we ship v1, from the running tracker doc [content-impact-tracking.md](content-impact-tracking.md). Workflow: Google Doc → ship v1 → I export to scorecard CSV in A-E schema → Tina fills column D (✅/⚠️) + column E (v2 feedback) → we iterate. Next FB ID is **FB-020**.
- **Overview iteration PARKED (plan complete, IDs reclaimed).** Sweep is done — exact file:line targets in [plan-overview-iteration.md](plan-overview-iteration.md). Items use handles `item-a/b/c/d` (originally FB-020-a/b/c + FB-021; IDs reclaimed for Content Impact per Thomas 2026-06-23). Two open decisions for Thomas in the plan doc. Resume after Content Impact closes; assign fresh sequential FB IDs at that point.
- **PR Influence tab iteration** — none open right now, but Tina might come back after spot-checking the live deploy.
- **Technical Performance tab** — not started, no feedback received yet.

## State at handoff (locked-in lockstep)

| Item | Value |
|---|---|
| Current branch | `official-feedback-pr-influence-tab` (kept alive; PR Influence batch is shipped) |
| Local HEAD | `a59eef9` (see remote check above) |
| Remote HEAD (`origin/official-feedback-pr-influence-tab`) | `a59eef9` |
| Working tree | clean |
| TypeScript | clean (`npx tsc --noEmit` zero output) |
| `origin/main` HEAD | `7919044` (includes Paul's PR #57 Renaissance dashboard) |
| Branch behind main | 42 commits (none of which affect the PR Influence files — most are the PR #52 / #58 merges that originated from this branch, plus Paul's unrelated Renaissance work) |
| Branch ahead of main | 2 commits (scorecard docs: `e2b56f5` markdown + `a59eef9` CSV) + this handoff/status update batch |

## When Tina sends new feedback

- **For Overview iteration:** Cut a new branch from current `main`, named something like `iter/overview-recommended-layout` or `official-feedback-overview-iteration`. Do NOT do Overview work on `official-feedback-pr-influence-tab` — different tab scope. Apply Rule #11 retroactively while building.
- **For Content Impact:** Cut `official-feedback-content-impact-tab` from main. Treat her recommended layout as the full spec from day 1 (Rule #11).
- **For Technical Performance:** Same pattern.
- **For more PR Influence iterations:** Either keep using `official-feedback-pr-influence-tab` (still alive) or cut a small `iter/pr-influence-NN` branch — either works.

Each new feedback item becomes the next FB-NN sequentially. Update `feedback-log.md` with the full decision log, `changelog.md` with the one-line summary + SHA, `status.md` with the current state.

## Per-tab branch workflow

| Tab | Branch | PR | State |
|---|---|---|---|
| Overview (initial) | `official-feedback-overview-tab` | [#50](https://github.com/Avenue-Z/avenue-z-reporting-v2/pull/50) | MERGED |
| Vis-bar fix (Overview hotfix) | `fix/llm-visibility-bar-scale` | [#53](https://github.com/Avenue-Z/avenue-z-reporting-v2/pull/53) | MERGED |
| FB-006 sandbox (Overview hotfix) | `fix/sandbox-avenue-z-static-content` | [#54](https://github.com/Avenue-Z/avenue-z-reporting-v2/pull/54) | MERGED |
| PR Influence (initial batch) | `official-feedback-pr-influence-tab` | [#52](https://github.com/Avenue-Z/avenue-z-reporting-v2/pull/52) | MERGED |
| PR Influence (FB-019 polish) | `official-feedback-pr-influence-tab` | [#58](https://github.com/Avenue-Z/avenue-z-reporting-v2/pull/58) | MERGED |
| **Overview iteration (incoming, Tina active)** | `iter/overview-recommended-layout` (TBD, cut when batch is ready) | (future) | **PENDING — wait for Tina's full pass** |
| Content Impact | `official-feedback-content-impact-tab` | (future) | not started |
| Technical Performance | `official-feedback-technical-performance-tab` | (future) | not started |

## Required Vercel env vars (already set, just for reference)

| Var | Value | Used by |
|---|---|---|
| `GLEAN_INSTANCE` | `avenuez` | Both synopses |
| `GLEAN_API_TOKEN` | (user token; rotate before any leak) | Both synopses |
| `GLEAN_ACT_AS` | (optional, currently unused) | — |
| `clients.domain` populated in DB | per-client | Citation Share KPI on Overview |
| `clients.ga4_property_id` populated | per-client | AI Referral Traffic KPI on Overview, AI Referral Sessions on PR Influence |

If any required var is missing, the affected card falls back gracefully and the rest of the page renders unaffected.

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

Then in the parent, pass `clientSlug={clientSlug}` — the parent already has `clientSlug` in scope.

## Do not start any code work until Thomas confirms what to do next

After your reading + sync check + greeting, **wait for Thomas's next message**. Possible directions:

- Tina sends more Overview feedback → he batches it and tells you to start the iteration branch
- Tina signs off on Overview iteration → ship as one combined commit on the new branch, PR, merge
- Tina starts Content Impact or Technical Performance → cut a new branch from main, follow Rule #11 (her layout = full spec) from the start
- Thomas asks for status / verification / a scorecard update → use the existing docs (`tina-scorecard.md` / `tina-scorecard.csv`) and don't recreate them from scratch

Do not pre-empt. Wait.
