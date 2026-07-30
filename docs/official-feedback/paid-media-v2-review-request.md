# Review Request — Paid Media v2 requirements capture

**For:** Paul
**From:** Thomas
**Branch:** `feat/paid-media-v2-feedback` · **PR:** #175
**Date:** 2026-07-30
**Status:** No code written yet. This is a requirements-capture review, not a code review.

---

## What we need from you

Two things, in priority order:

1. **Are the two blockers below real?** We are holding the Overview build on them. If
   either is us over-thinking it, say so and we start building.
2. **Did we capture the requirements correctly?** The scorecards are meant to be the
   single source of truth for this overhaul. If they are wrong, everything downstream
   is wrong.

Push back hard. The point of this review is to catch a bad read now rather than after
we build.

---

## What has been done

There is one Google Doc with 6 tabs. Two of them define this work. We built a
verbatim scorecard for each, then verified them against the live document through
the Drive API using a read-only service account.

| Deliverable | Covers | File |
|---|---|---|
| Scorecard 1 | Tab **Q&A** — "Questions for Paid Media Tab in Reporting" | [`paid-media-v2-doc1-questions-scorecard.md`](./paid-media-v2-doc1-questions-scorecard.md) |
| Scorecard 2 | Tab **Decisions for Approval** — "Decisions for Approval — Paid Media" | [`paid-media-v2-doc2-decisions-scorecard.md`](./paid-media-v2-doc2-decisions-scorecard.md) |

### Verification, measured not asserted

| | Q&A | Decisions for Approval |
|---|---|---|
| Body elements captured | 52 / 52 | 57 / 57 |
| Distinct words captured | 359 / 359 | 489 / 489 |
| Comment threads | 4 | 15 |
| Replies | 5 | 8 |
| Comment units captured | 9 / 9 | 23 / 23 |
| Authors confirmed (not inferred) | 9 / 9 | 23 / 23 |
| In-body coloured feedback captured | 30 / 30 | 5 / 5 |
| Resolved comments hiding anything | 0 | 0 |

Document-wide, 21 comment threads exist and all 21 are accounted for: 19 on these two
tabs, 1 on the PRD tab (out of scope), 1 deleted tombstone with no content.

### Two capture traps worth knowing about

- **The HTML export is not trustworthy for comment counts.** It renders 24 comments on
  the Decisions tab; the document has 23. The line "OK to total as a plain sum" appears
  twice in the doc, and the exporter attached the same comment to both occurrences.
  The API is the authority whenever anchor text repeats.
- **Five decisions on the Decisions tab are written inline in the body in blue, not as
  comments.** They are all Amir's, covering items 7, 8, 9, 10 and Question 2. A
  comment-only read of that tab misses half the decisions.

---

## How the two documents relate

Verified against timestamps and citations, not assumed.

```
Q&A body (the asks: Req 1-4)
  -> Q&A answers ............. Jul 21   (all 9 events, same day, closed)
    -> Decisions body ........ Jul 23   (written FROM those answers)
      -> Decisions answers ... Jul 28-30  <- AUTHORITATIVE, newest input
```

The Decisions doc cites Q&A outcomes verbatim in seven places ("CTR and Conversions
dropped, per Amir and Greg", "which was Dianna's call", "blended is the default, per
Greg", and so on). So: **Q&A defines what was asked and how the team wants it to
behave. Decisions defines how we would build it.**

**Proposed merge rule: chronological precedence, latest dated answer wins.**

Two consequences we want you to sanity-check:

1. **The Decisions doc body is not the decision.** Its body was written Jul 23; the
   answers landed Jul 28-30 and reversed three of its own proposals (items 2, 4, 10).
   Reading that body as settled truth would build the wrong thing three times.
2. **Decisions is not purely downstream.** Items 2, 5, 6, 8 and 10 are net-new
   questions that appear nowhere in the Q&A. They surfaced only from getting into the
   build.

---

## The blockers

We think these two genuinely block the Overview (Req 1). Both land on Dianna.

### Blocker 1 — Where does "Leads" come from?

| | |
|---|---|
| **Conflict** | Greg, Jul 21 (Q&A): use the ad platform's lead event, drop Conversions. Dianna, Jul 30 (Decisions): *"The number of leads should come from hubspot and not from the ad platforms... it should be spend across all platforms / hubspot leads attributed to AVZ"* |
| **Why it blocks** | Leads and Cost per lead are 2 of the 4 agreed Overview metrics. Neither can be built until this is settled. |
| **Why it is not a tweak** | Two things are missing, both verified in the repo, not assumed: <br>**(a) Renaissance has no HubSpot connection at all.** `scripts/seed.ts:77` sets `hubspotTokenEnvVar: null` for renaissance, and `hubspot-performance` is not in its `enabledReports`. Only `avenue-z` has HubSpot wired (`HUBSPOT_ACCESS_TOKEN_AVENUE_Z`). So there is no token, no config, no data path. <br>**(b) No paid-channel attribution exists for any client.** `grep` for `hubspot` across `lib/paid-search`, `lib/meta` and `lib/linkedin` returns **zero** matches, and `lib/hubspot` contains no attribution logic (`client.ts`, `rate-limit.ts` only). "Leads attributed to AVZ" is a model that does not exist anywhere in the codebase yet. |
| **Size** | This is a client onboarding step **plus** a new attribution model, not a config change. It is the difference between "point the metric at a different field" and "build a new data source and decide how a HubSpot lead gets credited to a paid channel." |
| **Knock-on** | If leads come from HubSpot, it also undercuts Decisions item 1 ("hold Meta's Leads") and item 3 (blended CPL), both of which assume platform-reported leads. Req 1's whole metric set depends on it. |

### Blocker 2 — Does blended Clicks sum two different definitions?

| | |
|---|---|
| **The situation** | Dianna, Jul 30: keep Meta on link clicks and label the column that way, because Meta no longer exposes clicks (all). That is fine on Meta's own tab. |
| **Why it blocks** | The Overview shows **one combined Clicks number**. Following her answer, it would add Meta's link clicks to Paid Search and LinkedIn's all clicks. A label does not fix a sum of two different things. Clicks is another of the 4 agreed metrics. |
| **What we need** | A call: sum anyway with a footnote, or show Clicks per channel only and drop it from the blended line. |
| **Note** | Nobody has addressed this. The Decisions doc raised the definition mismatch (item 2) and proposed switching Meta to all clicks; Dianna's answer removed that option without covering what the blended number then does. |

---

## What we are deliberately NOT treating as blockers

Listed so you can overrule us.

| # | Item | Our call |
|---|---|---|
| 1 | *"why wouldn't both be possible?"* (Dianna, Jul 30, unanswered) | Not a blocker. Both blended and per-channel **is** possible. The doc only listed blended as a fallback. We answer her and move on. |
| 2 | *"remove the commentary from this page"* (Dianna, Jul 30) | Ambiguous: no box on the new Overview only, or strip commentary across all of Paid Media. Small either way, so we build the narrow reading and confirm. |
| 3 | Amir on the Region total: *"You can kept this as is - just asking or there to be a total for all fields at the bottom"* | He did not pick from the three options offered. Reads as "total everything." One word of confirmation, not a blocker. |
| 4 | Amir on DMA de-duplication: *"it should only define one DMA per conversion, so a little confused there"* | Answered with hedging. He separately approved a plain sum, so we build the plain sum and verify against live data. |
| 5 | Decisions body reversed 3 times by its own comments | Not a contradiction. That is the review working. Only a risk if someone builds from the body. |
| 6 | Duplicated question line in item 10 | Cosmetic. Amir's answer there fits item 10's real question. Confirm and move on. |

---

## Questions specifically for you

1. **Is Blocker 1 as big as we think?** We found Renaissance has no HubSpot connection
   at all and no paid-channel attribution exists anywhere in the repo. Is there
   something outside this codebase (a Sheet, a Supermetrics HubSpot connector, an
   existing attribution report) that would make this cheaper than it looks?
2. **Is Blocker 2 a real problem or are we being precious?** A footnoted sum may be
   perfectly acceptable for a client-facing rollup.
3. **Is chronological precedence the right merge rule** for reconciling the two docs,
   or would you weight by role instead (channel owner wins on their own channel)?
4. **Anything in the "not blockers" list you would promote to a blocker?**
5. **Traceability gap:** on the PRD tab Tina wrote *"Requirements were entered directly
   into Asana for this one."* So the root requirements may live in Asana rather than
   this doc. Do you have visibility there, and should we be tracing to it?

---

## How to verify this yourself

The scorecards are meant to be checkable, not trusted.

- Each body element has a stable ID (`D1-B07`, `D2-B67`) with its verbatim text, so any
  claim can be traced to a specific line of the source document.
- Each comment carries its confirmed author, timestamp, and the exact text it anchors to.
- Sections marked **NOT SOURCE** are our analysis and are fenced off from the 1:1 map.
- Open items are flagged as open rather than resolved. We did not interpret anything
  the documents left ambiguous.
- Verbatim means verbatim, including the source's typos. They are not errors in the
  capture.
