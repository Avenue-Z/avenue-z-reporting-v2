# Handoff — Paid Media v2

> **This is a mid-build engineering handoff, not a final delivery handoff.** The
> team's Handoff Agreement template assumes a finished deliverable. This transfers
> ownership of work in progress, so "Current state" and "Known notes" carry the weight.

## Project

| | |
|---|---|
| **Project** | Paid Media v2 (Overview subpage + Paid Search / Meta fixes) |
| **Handoff date** | 2026-07-30 |
| **Handing off** | Thomas Chang |
| **Receiving owner** | Paul |
| **Reason** | Bandwidth. Thomas is split across Screaming Frog, TikTok slides and newsjacking. |
| **Status at handoff** | Requirements captured and verified. 1 of 6 requirements built. 1 blocker outstanding. |

## What is being handed off

Requirements capture, the merged build plan, and the first shipped fix. **Three open
PRs**, all draft, all targeting `dev`.

| PR | What | State |
|---|---|---|
| [#164](https://github.com/Avenue-Z/avenue-z-reporting-v2/pull/164) | 1,296-line technical design | Paul reviewed off GitHub. **No review artifact on the PR.** Unchanged since Jul 22. |
| [#175](https://github.com/Avenue-Z/avenue-z-reporting-v2/pull/175) | Two source-doc scorecards, merged work list, review request | Paul reviewed, 8 findings, **all addressed and replied to** |
| [#180](https://github.com/Avenue-Z/avenue-z-reporting-v2/pull/180) | Req 4: Meta Cost / LPV fix | **Needs code review.** Gates green. |

## Handoff scope

**Included:** all six requirements, both source-doc tabs (Q&A, Decisions for
Approval), the merged work list, and Req 4 as shipped code.

**Not included:** the other four tabs of the Google Doc (PRD, Technical Feedback,
Stakeholder QA, Handoff Agreement). Other clients. Renaissance is the only client with
all three channels configured, so everything here is built and QA'd against one client.

## Final links

| | |
|---|---|
| Source doc | [Google Doc](https://docs.google.com/document/d/1WNa3zDAkFss3Cx5EYBrfENJnYfOZOX-PfWqdbVLXyMQ/edit) — tabs **Q&A** and **Decisions for Approval** |
| Technical design | `docs/superpowers/specs/2026-07-22-paid-media-v2-design.md` **on branch `ave-z-reporting-paid-media-v2`**, not on `dev` |
| Scorecard, Q&A tab | [`paid-media-v2-doc1-questions-scorecard.md`](./paid-media-v2-doc1-questions-scorecard.md) |
| Scorecard, Decisions tab | [`paid-media-v2-doc2-decisions-scorecard.md`](./paid-media-v2-doc2-decisions-scorecard.md) |
| Merged work list | [`paid-media-v2-merged-worklist.md`](./paid-media-v2-merged-worklist.md) |
| Review request | [`paid-media-v2-review-request.md`](./paid-media-v2-review-request.md) |

## Current state

**Ready for:** continued development. Nothing is client-facing yet beyond the Req 4 fix,
which corrects an existing defect rather than adding surface.

| Bucket | Count |
|---|---|
| **BLOCKED** | **1** |
| **CONFIRM** (has an obvious default, build and flag) | 7 |
| **READY to build** | 17 |
| Built | 1 (Req 4, PR #180) |
| Already resolved | 1 (Req 6, LinkedIn de-auth, fixed Jul 22) |

**Verification already done, so you do not have to redo it.** Both scorecards are 1:1
against the live doc, checked through the Drive API with a read-only service account:
Q&A 52/52 body elements and 9/9 comment units; Decisions 57/57 and 23/23, plus 5 inline
answers that live in the body rather than the comments. Every author confirmed. Zero
resolved comments hiding anything.

## Known notes

### The one real blocker

**Where does "Leads" come from?** Greg said use the platform lead event (Jul 21).
Dianna said leads should come from **HubSpot**, not the ad platforms (Jul 30). Never
reconciled. It blocks Leads and Cost per lead, which are 2 of the 4 Overview metrics.

Verified cost if it goes HubSpot's way: **Renaissance has no HubSpot connection at all**
(`scripts/seed.ts:78`, `hubspotTokenEnvVar: null`), and **no paid-channel attribution
exists for any client**. That is client onboarding plus a new attribution model, not a
field swap.

**Needs Dianna. This is the single thing worth chasing first.**

### Seven items with an obvious default

None of these stop work. Each has a defensible default; build it and flag the assumption
in the PR.

| Item | Default to build | Confirm with |
|---|---|---|
| Commentary scope | No box on the new Overview only | Dianna |
| Region total scope | Total everything | Amir |
| DMA de-duplication | Plain sum (Amir approved it) | Amir |
| Keyword empty-state trigger | Per-keyword, matching the requirement | Amir |
| Keyword display cap | Top 10 (Amir said 10; code caps at 50) | Amir |
| Cents scope | Paid Media only, not product-wide | Dianna |
| Blended Clicks layout | Meta excluded from the blend, shown per-channel | **Paul** |

### One open engineering decision, yours

**`#164 D11`:** the rollup cannot reuse `getPaidSearchKpis` / `getMetaKpis` /
`getLinkedInKpis`. They return rounded values and consume prior-period absolutes
internally, so blended deltas cannot be derived from them. Either the rollup calls the
query wrappers and pure transforms directly, or each channel exports a raw-totals
accessor. Blocks Req 1 alongside the leads question.

### Limitations worth knowing

- **No Supermetrics key in the local environment.** The one-time comparison of Meta's
  `cost_per_landing_page_view` against a computed `cost / landing_page_views` could not
  be run. Rounding is fixed either way; the source question is separable.
- **Two monitoring gaps** surfaced by Req 6 and not addressed: the health sweep never
  probes the Meta or LinkedIn subpages, and **its coverage silently changes when Overview
  takes `id: null`**. The Connections page hardcodes all three paid channels to
  `NOT_CONFIGURED`.
- **The Google Doc tab label is not a stable identifier.** It was renamed and reverted on
  Jul 30. Anchor on the H1 inside the tab, which has never moved.

## Suggested first four moves

1. **Chase Dianna on the leads source.** It is the only true blocker and it is upstream
   of the largest requirement.
2. **Decide the PR situation.** Three open PRs is a lot of surface. Thomas's suggestion:
   merge #175 to `dev` since it is reviewed and its findings are addressed, leaving #180
   as the only code PR in flight.
3. **Review #180.** One-line-per-site fix, written test-first, all gates green.
4. **Answer `#164 D11`** so Req 1 is unblocked the moment the leads question lands.

Build order after that, from the design doc's own sequencing: Req 5 (formatting), Req 3
(keyword filter), Req 2 (table totals), Req 1 (Overview, largest by far).

## Ownership after handoff

| | |
|---|---|
| **Technical owner** | Paul |
| **Business owner** | Dianna (head of Paid Media) |
| **Channel owners** | Amir (Paid Search), Greg (Paid Social) |
| **Stakeholder** | Tina |
| **Future changes** | New requests through the normal branch flow: feature → dev → staging → main |

## Agreement

- The agreed scope for this handoff is **partially complete**: requirements captured and
  verified, 1 of 6 requirements built.
- The current state is documented above and in the merged work list.
- Open items and limitations are listed rather than resolved, deliberately.
- Ownership after handoff is Paul, technical.

## Sign-off

**Handing off:** Thomas Chang · 2026-07-30
**Receiving:** Paul · _pending_
**Status:** Accepted with follow-up items / _pending_
