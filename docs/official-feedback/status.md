# Official Feedback — Status

Snapshot of where the AEO feedback workstream is. Updated whenever a batch ships. Read this first before continuing work.

---

## Mission

Process Tina's feedback on the **Answer Engine Optimization** section of the Avenue Z reporting platform. All changes must:

1. Match Tina's literal ask. No silent reinterpretation.
2. Apply universally **for design / layout / UX changes**. New clients inherit by construction.
3. **Sandbox to Avenue Z when the content is hardcoded Avenue Z data.** Gate via `clientSlug === 'avenue-z'` and return `null` for other clients. Two sandboxed components today: Winners/Losers (FB-006) and Sentiment Insights (FB-010).
4. Use the **Glean Chat API** for any LLM inference. No Vertex/Gemini, OpenAI, Anthropic direct, etc. `gleanChat()` helper in `lib/glean.ts`. ActAs is opt-in (token is a Glean user token).
5. Avoid em-dashes and AI-tell punctuation in any copy written.
6. Be documented per item in `feedback-log.md` with verbatim ask, decisions, and risks so Paul (or future-Thomas) can pick up cold.

---

## Active branch

- **Branch:** `official-feedback-pr-influence-tab`
- **HEAD:** `41d2091`
- **PR:** [#52 — AEO PR Influence tab: official feedback (FB-009+)](https://github.com/Avenue-Z/avenue-z-reporting-v2/pull/52) — OPEN + DRAFT
- **Base:** `main` (currently `8aa61a8`)
- **Status:** mid-batch on PR Influence. FB-009 (synopsis + KPI strip removal), FB-010 (Sentiment Insights), FB-011 (Sentiment placement correction), FB-012 (reduce Top Editorial + Prompt Cluster bar chart + side-by-side + Matchback drops below + methodology block removed), FB-013 (per-cluster editorialCitationDensity fix), FB-014 (Top Editorial Opportunities retitle + redesign, Next Pitch deleted) all shipped to this branch. Awaiting Tina's next ask or her sign-off. Next FB ID is **FB-015**.

## Per-tab workflow going forward

One branch + one PR per AEO sub-tab.

| Tab | Branch | PR | State |
|---|---|---|---|
| Overview | `official-feedback-overview-tab` | [#50](https://github.com/Avenue-Z/avenue-z-reporting-v2/pull/50) | MERGED |
| Vis-bar fix (Overview hotfix) | `fix/llm-visibility-bar-scale` | [#53](https://github.com/Avenue-Z/avenue-z-reporting-v2/pull/53) | MERGED |
| FB-006 sandbox (Overview hotfix) | `fix/sandbox-avenue-z-static-content` | [#54](https://github.com/Avenue-Z/avenue-z-reporting-v2/pull/54) | MERGED |
| **PR Influence** | **`official-feedback-pr-influence-tab`** | **[#52](https://github.com/Avenue-Z/avenue-z-reporting-v2/pull/52)** | **OPEN + DRAFT** |
| Content Impact | `official-feedback-content-impact-tab` | (future) | not started |
| Technical Performance | `official-feedback-technical-performance-tab` | (future) | not started |

FB IDs continue sequentially across all branches. **Next ID is FB-015.**

---

## Shipped — FB log

| FB ID | Tab | Branch | Commit | Summary |
|---|---|---|---|---|
| **FB-001** | Overview | (merged via #50) | `7097a19` | Consistent `<SectionHeader>` across all 4 AEO tabs. |
| **FB-002** | Overview | (merged via #50) | `ae8fc06` | AEO Overview redesign batch: removed pills (a), swapped 3 KPIs (b), added Executive Synopsis (c), Snapshot KPIs eyebrow (d), reordered trend chart (e). |
| **FB-003** | Overview | (merged via #50) | `e33ed66` | Migrated Overview synopsis from Vertex Gemini to Glean Chat. Added `gleanChat()` helper. |
| **FB-004** | Overview | (merged via #50) | `da74c23` | Added vertical axis to visibility trend chart. |
| **FB-005** | Overview | (merged via #50) | `6142968` | Disambiguated "Google" in Model Breakdown. Fixed bucketing bug where Gemini was silently merged into Google. Display label `Google` → `Google AI Overview`. |
| **FB-006** | Overview | (merged via #50, sandbox fix #54) | `d9f8f70` + `d71d18c` | Biggest Winners + Biggest Losers cards, static Avenue Z content. **Sandbox-gated to `clientSlug === 'avenue-z'`.** |
| **FB-007** | Overview | (merged via #50) | `2077037` | Removed Brand Categories chart + definitions. Stretched Leaderboard to full width. |
| **FB-008** | Overview | (merged via #50) | `c19733e` | Recolored Domain Types chart + legend with Avenue Z brand palette. Zero `#8A8A8A` gray. |
| **Glean fix** | Overview | (merged via #50) | `f6b0534` | `gleanChat()` no longer auto-adds `X-Scio-Actas`. Required because the token is a Glean user token. |
| **Vis-bar fix** | Overview | (merged via #53) | `bb9ec14` | Model Breakdown visibility bar uses absolute 0-100 scale, not relative-to-max. |
| **FB-009** | PR Influence | this branch (PR #52) | `9edb823` | ADD: Executive Synopsis on PR Influence (Glean, mirrors Overview synopsis pattern). REMOVE: duplicate `<h3>` + 6-card KPI strip beneath the section header. |
| **FB-010** | PR Influence | this branch (PR #52) | `bf13917` | ADD: Sentiment Insights section with Tina's static Avenue Z content (89.4% positive, 8 themes, 2 weaknesses). Click-to-expand accordions, KPI pill. **Sandbox-gated to Avenue Z.** |
| **FB-011** | PR Influence | this branch (PR #52) | `b4906a2` | Iteration on FB-010. Moved Sentiment Insights from between Matchback and Top Editorial Domains to directly under the Executive Synopsis. |
| **FB-012** | PR Influence | this branch (PR #52) | `f1d5c5a` | Reduce Top Editorial Domains (Citation Count → Citation Share, drop Avg Citations + PR cols + legend, new subtitle, drop green-on-PR styling). Replace Prompt Cluster Opportunity 7-col table with simple horizontal bar chart (Topic × % editorial citation share). Side-by-side `lg:grid-cols-2` layout for the two reduced cards directly under Sentiment Insights. PR Placement Matchback drops below the side-by-side row (matches Tina's recommended layout). Removed the 4-weight "How is the opportunity score calculated?" methodology block (explains a number that no longer renders). |
| **FB-013** | PR Influence | this branch (PR #52) | `41d2091` | Fix pre-existing data bug surfaced by FB-012 bar chart: editorialCitationDensity was computed ONCE globally and assigned identically to every cluster, so every bar rendered at 100%. Now computed PER CLUSTER via coverage.tagNameById + tagIdsByDomain + topDomain.retrieved: `sum(retrieved across editorial-typed domains tagged with cluster) / sum(retrieved across all domains tagged with cluster) * 100`. Real ranking emerges. No render changes; same FB-012 chart, real numbers now. |
| **FB-014** | PR Influence | this branch (PR #52) | `(pending)` | Brand-Absent table retitled "Top Editorial Opportunities" with Tina's new title + subtitle. 5-column shape: Publication, Article (combined title + URL hyperlink), Competitors Mentioned, Citation Share, Delta of Citation Share. Filter: brand-not-mentioned (or no data) AND positive citation-share delta. Removed: 3 columns (Brand Mentioned, Opportunity Priority, Suggested PR Angle), footnote, isDemo prop. Deleted entire NextPitchOpportunitiesTable component + Sparkles wrapper + nextPitchRows compute (Tina REMOVE "Where should we pitch next..."). Methodology block REMOVE already shipped in FB-012. Matchback kept in place (Tina did not list it as a removal). Universal change. |

Full per-item decision logs in [feedback-log.md](feedback-log.md). One-line SHA lookup in [changelog.md](changelog.md).

---

## Working rules established across this workstream

1. **One user message = one FB group.** Multiple changes become sub-items inside the group.
2. **One commit per group.** Sub-items ship together, get reverted together if needed.
3. **Iterations on prior FB items get a new FB ID.** Audit trail stays linear. Note lineage in the decision log.
4. **No em-dashes in copy I write.** Use periods or commas.
5. **Decisions over questions.** Make the call, document why. Only ask Thomas when truly blocked (e.g. data the codebase cannot answer for me, or genuinely different visual outcomes).
6. **Show receipts.** Every claim of "done" is backed by a file:line reference, a commit SHA, or a verification output.
7. **Truth-grounded data.** No proxies, no derivations that ship wrong numbers. If a metric is not computable for a provider, the card shows `--` with an honest tooltip, never an invented value.
8. **Glean Chat API only** for any LLM inference. See `lib/glean.ts` `gleanChat()` for the canonical pattern.
9. **Universal across clients for design / layout / UX.** Per-client conditionals ONLY for the Avenue Z sandbox gate on static content.
10. **Sandbox to Avenue Z** when content is hardcoded Avenue Z data. `const SANDBOX_CLIENT_SLUG = 'avenue-z'` + `if (clientSlug !== SANDBOX_CLIENT_SLUG) return null` at the top of the component. Pass `clientSlug` down from the parent.

---

## Files added across this workstream

| Path | Purpose |
|---|---|
| `components/report-sections/peec-ai/section-header.tsx` | Canonical AEO section header (FB-001) |
| `components/report-sections/peec-ai/overview-synopsis.tsx` | Executive Synopsis RSC at top of Overview (FB-002c) |
| `components/report-sections/peec-ai/winners-losers-cards.tsx` | Biggest Winners + Biggest Losers cards (FB-006). **Sandboxed.** |
| `components/report-sections/peec-ai/pr-influence-synopsis.tsx` | Executive Synopsis RSC at top of PR Influence (FB-009-a) |
| `components/report-sections/peec-ai/sentiment-insights.tsx` | Sentiment Insights client component (FB-010 + FB-011). **Sandboxed.** |
| `lib/peec/synopsis.ts` | Glean-backed Overview synopsis generator (FB-002c, FB-003) |
| `lib/peec/pr-influence-synopsis.ts` | Glean-backed PR Influence synopsis generator (FB-009-a) |
| `docs/official-feedback/feedback-log.md` | Source of truth for every FB item with decision log |
| `docs/official-feedback/changelog.md` | Terse SHA-keyed lookup |
| `docs/official-feedback/status.md` | This file |
| `docs/official-feedback/handoff.md` | Cold-start prompt for new chats after compaction |

---

## Operational requirements (production)

These must be set in Vercel for everything to render real data:

| Var | Needed for | Value / note |
|---|---|---|
| `GLEAN_INSTANCE` | Both synopses | `avenuez` |
| `GLEAN_API_TOKEN` | Both synopses | USER token. Do NOT pass `actAs` to `gleanChat()` unless the value is swapped to a GLOBAL token. |
| `GLEAN_ACT_AS` | (optional) | Currently unused; safe to remove. |
| `clients.domain` populated in DB | Citation Share KPI (Overview) | one row per client. Without it the card shows `--`. |
| `clients.ga4_property_id` populated | AI Referral Traffic (Overview), AI Referral Sessions (PR Influence) | already true for current clients |

If any of these are missing the affected card or synopsis falls back gracefully. Other metrics on the page are unaffected.

---

## What's NOT done (deliberately out of scope or deferred)

| Item | Why deferred |
|---|---|
| Migrate `lib/bigquery/gemini.ts` (Fun Spot conversational summary) to Glean | Different feature, different code path. Separate FB item when we get to Fun Spot. |
| Refactor `app/api/glean/meeting-brief/route.ts` to use `gleanChat()` and to skip ActAs | Working endpoint, hardcodes `bill.hoerr@avenuez.com` as ActAs which will hit the user-token 400 if called. Not blocking AEO. |
| Scrub em-dashes from existing tooltips / comments / strings across the codebase | Not requested. Per-fix scrubbing applied only on lines being edited for a Tina item. |
| The `period-ribbon.tsx` component file (now unused) | Left in repo for trivial revert if Tina ever wants the pills back. |
| Live data wiring for FB-006 Winners/Losers and FB-010 Sentiment Insights | Static for now per Thomas. Avenue Z is the sandbox client; cross the bridge when other clients are ready. |
| Google AI Mode handling in `normalizeSource` | Currently lumps into the Google AI Overview bucket. No current client has it enabled. Future FB item. |

---

## Next batches

Awaiting Tina's next piece of feedback on PR Influence. When it arrives:

- It becomes **FB-012**.
- If multiple sub-asks: `FB-012-a`, `b`, `c`. One combined commit per group.
- Update this file + `feedback-log.md` + `changelog.md` on close.

If Tina signs off on PR Influence with no more changes:

- Flip PR #52 ready for review: `gh pr ready 52`
- Merge to main
- Move to Content Impact tab: cut `official-feedback-content-impact-tab` from the new main, repeat the per-tab workflow.
