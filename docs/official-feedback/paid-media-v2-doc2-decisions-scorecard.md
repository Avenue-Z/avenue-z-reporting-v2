# Golden Scorecard — Document 2: "Decisions for Approval — Paid Media"

> **Purpose.** A direct 1:1 map of every piece of content in the source document
> and every comment attached to it, including answers written **inline in the body**
> rather than as comments. This is the anti-drift reference for the Paid Media v2
> overhaul. Nothing is summarized, condensed, or paraphrased.
>
> **Status:** Document 2 of 2. Document 1 is
> [`paid-media-v2-doc1-questions-scorecard.md`](./paid-media-v2-doc1-questions-scorecard.md).
> The two are blended only after both are individually confirmed accurate.

## Provenance

| Field | Value |
|---|---|
| Live source | Google Doc `1WNa3zDAkFss3Cx5EYBrfENJnYfOZOX-PfWqdbVLXyMQ`, **tab 3 of 6** |
| **Tab name** | **`Decisions for Approval`** (the tab label in the Google Docs sidebar) |
| Document title (H1) | Decisions for Approval — Paid Media |
| HTML export cross-check | `Paid Media Reporting Dashboard v2 (1)/PaidMediaReportingDashboardv2.html`, exported 2026-07-30 09:37 |
| Captured | 2026-07-30 |
| Branch | `feat/paid-media-v2-feedback` |
| Body elements mapped | 89 (D2-B01 … D2-B89) |
| Decision items | 11 numbered + 1 "Questions for Amir and Greg" section (2 questions) |
| Comment threads | **15 threads + 8 replies = 23 units** |
| Inline body answers | **5** (all from Amir, written in blue in the body, not as comments) |
| Resolved comments | 0 |

### Verification performed

| Check | Method | Result |
|---|---|---|
| Body vs live doc | Element-by-element diff of HTML export against the Drive API export of tab 3 | **Identical.** Only difference was the next section's heading bleeding past the slice boundary. |
| Comments vs live doc | Drive API `comments.list`, pulled twice | **15 threads, 8 replies, 0 resolved, 0 deleted** |
| HTML comment count | 24 markers `[a]`…`[x]` | **Over-reports by one.** See the export-artifact note below. |

> ### Export artifact: the HTML shows 24 comments, the document has 23
>
> The HTML export renders **24** comment units. The live document has **23**
> (15 threads + 8 replies). The extra one is `[r]`.
>
> **Cause.** The line `→ OK to total as a plain sum, pending that check?` appears
> **twice** in the document, once in item 9 (D2-B67) and once as a stray line in
> item 10 (D2-B74). Only **one** comment thread exists on it in the live document
> (`AAACDnrOCDE`, anchor `kix.75y42ym4xn2i`, Tina Fleming, 2026-07-23T14:06:56).
> The exporter attached a marker at **both** occurrences of the identical text and
> emitted the comment body twice, as `[p]` and `[r]`. Their text is byte-identical,
> including the assignee line.
>
> **Consequence.** `[p]` and `[r]` are **the same comment**. Do not count them
> twice, and do not treat `[r]` as a second unanswered question. The API is the
> authority on comment counts whenever anchor text repeats in a document.

## How to read this file

- **Verbatim** columns reproduce source text **exactly**, including typos
  (`You can kept this as is`, `just asking or there to be a total`) and the
  authors' own punctuation. Typos are **never** corrected in the 1:1 map.
- **Em dashes, arrows and the ⚠️ marker** inside quoted source text are preserved
  because fidelity is the point of this file. Our own prose avoids them.
- Answers arrive by **two different routes** and both are captured:
  **(a) comments** in the sidebar, **(b) inline blue text in the body** prefixed
  `Amir:`. Route is recorded on every answer.
- Sections marked **NOT SOURCE** are our analysis, fenced so they can never be
  mistaken for a requirement.

### Voice legend

| Voice | Signal | Role |
|---|---|---|
| **Doc** | Black body text | The proposal author (Tina Fleming, per comment authorship) |
| **Amir Eldick** | Blue body text prefixed `Amir:` (`#0000ff` / `#4a86e8`) | Paid Search owner |
| **Tina Fleming** | Comment thread openers | Author, routing questions to owners |
| **Dianna Gatto** | Comment replies | Head of Paid Media |
| **Gregory Huepler** | Comment replies | Paid Social owner |

---

# Part 1 — Body content, 1:1

Structural elements (horizontal rules, blank paragraphs) are numbered so the map
accounts for all 89 elements with no gaps.

## Header

| ID | Type | Voice | Verbatim |
|---|---|---|---|
| D2-B01 | H1 | Doc | Decisions for Approval &mdash; Paid Media |
| D2-B02 | Paragraph | Doc | **If you disagree with any item, or it's not what you expected, flag it now.** Anything marked &#9888;&#65039; is a choice you might not expect. <br>*(first sentence bold in source)* |
| D2-B03 | Horizontal rule | — | *(divider)* |
| D2-B04 | Paragraph (empty) | — | *(blank)* |

## Item 1 — Meta sends us no lead data at all

| ID | Type | Voice | Verbatim | Anchors |
|---|---|---|---|---|
| D2-B05 | H3 | Doc | &#9888;&#65039; 1. Meta sends us no lead data at all | |
| D2-B06 | Paragraph | Doc | Of the four agreed metrics, Meta only reports Spend and Clicks. It sends no lead or conversion data, and nothing records which Meta action should count as a lead, so "use the leads event" isn't a matter of picking the right one &mdash; there isn't one connected. For contrast, Paid Search counts eight configured lead actions and LinkedIn counts only native lead-form submissions. | |
| D2-B07 | Paragraph | Doc | There's no default here: the Overview can't show Leads or Cost per lead for Meta until it's answered. The one fact that unblocks it sits at the end of this doc. | |
| D2-B08 | Paragraph (ask, bold) | Doc | &rarr; **Confirm we hold Meta's Leads and Cost per lead until that's settled.** | **[a]**, **[b]** |
| D2-B09 | Horizontal rule | — | *(divider)* | |
| D2-B10 | Paragraph (empty) | — | *(blank)* | |

## Item 2 — "Clicks" means something different on Meta

| ID | Type | Voice | Verbatim | Anchors |
|---|---|---|---|---|
| D2-B11 | H3 | Doc | &#9888;&#65039; 2. "Clicks" means something different on Meta | |
| D2-B12 | Paragraph | Doc | Meta counts link clicks. Paid Search and LinkedIn count all clicks. Blended, that's one number holding two definitions, and Meta's share looks artificially low. | |
| D2-B13 | Paragraph (proposal) | Doc | We'd switch Meta to all clicks so the three match. | |
| D2-B14 | Paragraph (ask, bold) | Doc | &rarr; **Confirm &mdash; or say if you'd rather keep link clicks and label the column that way.** | **[c]**, **[d]** |
| D2-B15 | Horizontal rule | — | *(divider)* | |
| D2-B16 | Paragraph (empty) | — | *(blank)* | |

## Item 3 — Blended cost per lead can't always be shown honestly

| ID | Type | Voice | Verbatim | Anchors |
|---|---|---|---|---|
| D2-B17 | H3 | Doc | &#9888;&#65039; 3. Blended cost per lead can't always be shown honestly | |
| D2-B18 | Paragraph | Doc | Blended cost per lead is total spend divided by total leads &mdash; not an average of the three channels, which would be wrong whenever they spend at different levels. The catch is item 1: if Meta spends money but reports no leads, there's no honest denominator. Counting Meta's spend inflates the figure; dropping it understates it; showing it anyway implies a completeness we don't have. | |
| D2-B19 | Paragraph (proposal) | Doc | We'd show it as unavailable whenever a spending channel can't report its leads, rather than print a number we can't stand behind. | |
| D2-B20 | Paragraph (ask, bold) | Doc | &rarr; **Confirm &mdash; or say you'd rather we compute it only over the channels that do report leads, and label it that way.** | **[e]**, **[f]** |
| D2-B21 | Paragraph (empty) | — | *(blank)* | |
| D2-B22 | Paragraph (empty) | — | *(blank)* | |
| D2-B23 | Paragraph (empty) | — | *(blank)* | |
| D2-B24 | Horizontal rule | — | *(divider)* | |
| D2-B25 | Paragraph (empty) | — | *(blank)* | |

## Item 4 — What a total does when a channel is missing

| ID | Type | Voice | Verbatim | Anchors |
|---|---|---|---|---|
| D2-B26 | H3 | Doc | 4. What a total does when a channel is missing | |
| D2-B27 | Paragraph | Doc | Renaissance is the only client with all three channels connected, so a missing channel is the normal case, not an edge case. Your rule covers calculated metrics: if a broken figure feeds a formula, show it unavailable so it never reaches the client looking complete. That settles Cost per lead &mdash; but not Spend or Clicks. | |
| D2-B28 | Paragraph (proposal) | Doc | We'd have the totals cover the channels we do have and name the ones missing. | |
| D2-B29 | Paragraph (ask, bold) | Doc | &rarr; **Confirm &mdash; or say a missing channel should make the whole total unavailable.** | **[g]**, **[h]** |
| D2-B30 | Horizontal rule | — | *(divider)* | |
| D2-B31 | Paragraph (empty) | — | *(blank)* | |

## Item 5 — Paid Media will open on the new Overview

| ID | Type | Voice | Verbatim | Anchors |
|---|---|---|---|---|
| D2-B32 | H3 | Doc | &#9888;&#65039; 5. Paid Media will open on the new Overview | |
| D2-B33 | Paragraph | Doc | Today the Paid Media tab opens on Paid Search. With the Overview added, we'd make it the landing page, matching how the AEO and GA4 tabs already open on their own overviews. The trade-off: any existing link or bookmark that assumed "Paid Media means Paid Search" now lands on the Overview instead. | |
| D2-B34 | Paragraph (ask, bold) | Doc | &rarr; **Confirm the Overview should be the default landing.** | **[i]**, **[j]** |
| D2-B35 | Horizontal rule | — | *(divider)* | |
| D2-B36 | Paragraph (empty) | — | *(blank)* | |

## Item 6 — The Overview commentary box has no owner

| ID | Type | Voice | Verbatim | Anchors |
|---|---|---|---|---|
| D2-B37 | H3 | Doc | 6. The Overview commentary box has no owner | |
| D2-B38 | Paragraph | Doc | Paid Search, Meta and LinkedIn each have a commentary box, owned by Amir and Greg. The Overview would be a fourth, with nobody on it. | |
| D2-B39 | Paragraph (proposal) | Doc | We'd give it no box. | |
| D2-B40 | Paragraph (ask, bold) | Doc | &rarr; **Name an owner, or confirm no box.** | **[k]**, **[l]** |
| D2-B41 | Horizontal rule | — | *(divider)* | |
| D2-B42 | Paragraph (empty) | — | *(blank)* | |

## Item 7 — Totals on every Paid Search table, or just the two you named

| ID | Type | Voice | Verbatim | Anchors |
|---|---|---|---|---|
| D2-B43 | H3 | Doc | 7. Totals on every Paid Search table, or just the two you named | |
| D2-B44 | Paragraph | Doc | The original ask was totals on Leads by Action and Region &rarr; DMA. Amir then widened it to *"all tables on the Paid Search reporting tab."* Taken literally that also adds a total to the keyword table; the campaign table already has one. | |
| D2-B45 | Paragraph (proposal) | Doc | We'd follow Amir and total every table. | |
| D2-B46 | Paragraph (ask, bold) | Doc | &rarr; **Confirm all tables &mdash; or hold it to the two originally named.** | **[m]**, **[n]** |
| **D2-B47** | **Paragraph (INLINE ANSWER, blue)** | **Amir Eldick** | Amir: If possible, please add the summary total line to all tables on the Paid Search dashboard. Thank you! <br>*(source is indented with 8 leading non-breaking spaces)* | |
| D2-B48 | Paragraph (empty) | — | *(blank; 1 of 6 consecutive)* | |
| D2-B49 | Paragraph (empty) | — | *(blank; 2 of 6 consecutive)* | |
| D2-B50 | Paragraph (empty) | — | *(blank; 3 of 6 consecutive)* | |
| D2-B51 | Paragraph (empty) | — | *(blank; 4 of 6 consecutive)* | |
| D2-B52 | Paragraph (empty) | — | *(blank; 5 of 6 consecutive)* | |
| D2-B53 | Paragraph (empty) | — | *(blank; 6 of 6 consecutive)* | |
| D2-B54 | Horizontal rule | — | *(divider)* | |
| D2-B55 | Paragraph (empty) | — | *(blank)* | |

## Item 8 — The Region total would cover only the 10 rows shown

| ID | Type | Voice | Verbatim | Anchors |
|---|---|---|---|---|
| D2-B56 | H3 | Doc | 8. The Region total would cover only the 10 rows shown | |
| D2-B57 | Paragraph | Doc | The Region &rarr; DMA table shows the top 10 regions, while the card above it shows the true count. A total underneath would sum less than the card advertises. | |
| D2-B58 | Paragraph (proposal) | Doc | The options are to total just the 10 shown, total every region, or show both &mdash; e.g. *"1,240 across top 10 of 34 regions."* We'd do the third. | |
| D2-B59 | Paragraph (ask, bold) | Doc | &rarr; **Reply: 10 shown, all regions, or both.** | **[o]** |
| D2-B60 | Paragraph (image) | Doc | *(embedded screenshot `images/image1.png`, 720 &times; 294.67 px, no alt text)* | |
| D2-B61 | Paragraph (empty, blue) | — | *(blank)* | |
| **D2-B62** | **Paragraph (INLINE ANSWER, blue)** | **Amir Eldick** | Amir: You can kept this as is - just asking or there to be a total for all fields at the bottom. Thank you | |
| D2-B63 | Horizontal rule | — | *(divider)* | |
| D2-B64 | Paragraph (empty) | — | *(blank)* | |

## Item 9 — A plain-sum total can count one lead twice

| ID | Type | Voice | Verbatim | Anchors |
|---|---|---|---|---|
| D2-B65 | H3 | Doc | &#9888;&#65039; 9. A plain-sum total can count one lead twice | |
| D2-B66 | Paragraph | Doc | Totals are plain sums. For Leads by Action that's exact. For Region &rarr; DMA it isn't guaranteed: if one lead is attributed to more than one metro area, a plain sum counts it in each, so the total can read higher than the real lead count. This was raised, assigned to Amir, and never closed. The fact that settles it is at the end of this doc; until then we'd sum plainly and check it against live data before building. | |
| D2-B67 | Paragraph (ask, bold) **+ INLINE ANSWER** | Doc **+ Amir Eldick** | &rarr; **OK to total as a plain sum, pending that check?**<br>*(line break)*<br>**Amir: Yes, okay to total as a plain sum** *(blue)* | **[p]** |
| D2-B68 | Horizontal rule | — | *(divider)* | |
| D2-B69 | Paragraph (empty) | — | *(blank)* | |

## Item 10 — The keyword table's total moves with its filter

| ID | Type | Voice | Verbatim | Anchors |
|---|---|---|---|---|
| D2-B70 | H3 | Doc | 10. The keyword table's total moves with its filter | |
| D2-B71 | Paragraph | Doc | The keyword table is the one with the 10-click default filter. You already ruled that filter out for Leads by Action, and it doesn't touch Region &rarr; DMA &mdash; this is only about the keyword table's own total, which can reflect what's on screen or every keyword behind the filter. | |
| D2-B72 | Paragraph (proposal) | Doc | We'd have it reflect what's on screen, so it moves when the filter moves. | |
| D2-B73 | Paragraph (ask, bold) | Doc | &rarr; **Confirm &mdash; or say it should always total every keyword.** | **[q]** |
| **D2-B74** | Paragraph (**stray duplicate ask**) **+ INLINE ANSWER** | Doc **+ Amir Eldick** | &rarr; **OK to total as a plain sum, pending that check?**<br>*(line break)*<br>**Amir: The total line sum should include all keywords, but the table should just display the top 10** *(blue)* | **[r]** = duplicate render of **[p]**, see the export-artifact note |
| D2-B75 | Horizontal rule | — | *(divider)* | |
| D2-B76 | Paragraph (empty) | — | *(blank)* | |

> **D2-B74 is a stray line.** Its question text is identical to item 9's D2-B67
> and belongs to item 9, not item 10. It carries **its own distinct inline answer**
> from Amir, different from the one on D2-B67. Both answers are captured above.
> Flagged as **OPEN-D2-1**.

## Item 11 — Smaller assumptions

| ID | Type | Voice | Verbatim | Anchors |
|---|---|---|---|---|
| D2-B77 | H3 | Doc | 11. Smaller assumptions &mdash; flag any you'd expect differently | **[s]** |
| D2-B78 | Bullet | Doc | The Overview shows **Spend, Clicks, Leads, Cost per lead** in that order. CTR and Conversions dropped, per Amir and Greg. | |
| D2-B79 | Bullet | Doc | It shows **both** a combined top line and a per-channel breakdown. If both isn't possible, blended is the default, per Greg. | **[t]** |
| D2-B80 | Bullet | Doc | The keyword table opens at **10 or more clicks** and can be cleared. If nothing reaches 10 we show a message, which was Dianna's call. Amir's 50-impression fallback only if it were easier to build &mdash; and it isn't. | |
| D2-B81 | Bullet | Doc | The **Top Regions chart shows cents** (`$X,XXX.XX`) while the card above it stays in whole dollars, so the same figure appears at two precisions. Flag it if you'd expect them to match. | **[u]** |
| D2-B82 | Bullet | Doc | All of this applies to **both the internal view and the client portal.** | |
| D2-B83 | Paragraph (ask, bold) | Doc | &rarr; **Any of these not what you'd expect?** | **[v]** |
| D2-B84 | Horizontal rule | — | *(divider)* | |
| D2-B85 | Paragraph (empty) | — | *(blank)* | |

## Questions for Amir and Greg

| ID | Type | Voice | Verbatim | Anchors |
|---|---|---|---|---|
| D2-B86 | H2 | Doc | Questions for Amir and Greg | **[w]**, **[x]** |
| D2-B87 | Numbered item 1 | Doc | **Does Meta bid on any conversion action beyond Form Submissions?** If it does, which action counts as a lead, and is it the same for every client? This is what item 1 and item 3 wait on. *(Greg and Amir &mdash; Amir first flagged it: "Just depends if Meta is using any conversions actions in bidding other than Form Submissions.")* | |
| D2-B88 | Numbered item 2 | Doc | **Can one lead land in more than one DMA** in the Paid Search data? If it can, item 9's plain sum can over-count the Region &rarr; DMA total, and we'd switch to a de-duplicated count. *(Amir.)* | |
| **D2-B89** | **Numbered sub-item (INLINE ANSWER, blue italic)** | **Amir Eldick** | Amir: For the DMA reporting, if it is coming from Google Ads, it should only define one DMA per conversion, so a little confused there. | |

---

# Part 2 — Comments, 1:1 (API-verified)

**15 threads, 8 replies, 23 units. Zero resolved. Zero deleted.** Every author and
timestamp is confirmed from the Drive API, not inferred. Listed in creation order.

## T1 — anchored to D2-B34 (`kix.a6g2xgl7mjr8`)

> **Anchor:** &rarr; Confirm the Overview should be the default landing.

**[i] opener** &middot; **Tina Fleming** &middot; 2026-07-23T14:05:00Z
> Confirmed

**[j] reply** &middot; **Dianna Gatto** &middot; 2026-07-30T00:59:01Z
> Overview should be the default landing.

## T2 — anchored to D2-B40 (`kix.hn42bhte3lwm`)

> **Anchor:** &rarr; Name an owner, or confirm no box.

**[k] opener** &middot; **Tina Fleming** &middot; 2026-07-23T14:05:56Z
> Dianna is ultimately the head of Paid Media so she can be the "owner" if there's anything to put in the box

**[l] reply** &middot; **Dianna Gatto** &middot; 2026-07-30T00:59:37Z
> remove the commentary from this page

## T3 — anchored to D2-B46 (`kix.u300i96rhs3p`)

> **Anchor:** &rarr; Confirm all tables &mdash; or hold it to the two originally named.

**[m] opener** &middot; **Tina Fleming** &middot; 2026-07-23T14:06:23Z &middot; *Assigned to amir.eldick@avenuez.com*
> @amir.eldick@avenuez.com Your call here!
>
> _Assigned to amir.eldick@avenuez.com_

**[n] reply** &middot; **Amir Eldick** &middot; 2026-07-23T14:08:22Z
> Just commented now. Thanks

## T4 — anchored to D2-B59 (`kix.ypo4k2pt6m5c`)

> **Anchor:** &rarr; Reply: 10 shown, all regions, or both.

**[o] opener** &middot; **Tina Fleming** &middot; 2026-07-23T14:06:38Z &middot; *Assigned to amir.eldick@avenuez.com* &middot; **no replies**
> @amir.eldick@avenuez.com Your call here!
>
> _Assigned to amir.eldick@avenuez.com_

## T5 — anchored to D2-B67 (`kix.75y42ym4xn2i`)

> **Anchor:** &rarr; OK to total as a plain sum, pending that check?

**[p] opener** &middot; **Tina Fleming** &middot; 2026-07-23T14:06:56Z &middot; *Assigned to amir.eldick@avenuez.com* &middot; **no replies**
> @amir.eldick@avenuez.com Your call here!
>
> _Assigned to amir.eldick@avenuez.com_

> **`[r]` in the HTML export is this same comment rendered a second time** against
> the duplicate line D2-B74. It is not a 16th thread.

## T6 — anchored to D2-B08 (`kix.l0wrryydg5rs`)

> **Anchor:** &rarr; Confirm we hold Meta's Leads and Cost per lead until that's settled.

**[a] opener** &middot; **Tina Fleming** &middot; 2026-07-23T14:07:19Z &middot; *Assigned to greg.huepler@avenuez.com*
> @greg.huepler@avenuez.com Your call here!
>
> _Assigned to greg.huepler@avenuez.com_

**[b] reply** &middot; **Gregory Huepler** &middot; 2026-07-28T17:04:05Z
> Yes, we can hold Meta's lead and cost per lead for now. This channel is not focusing on lead generation for the time being

## T7 — anchored to D2-B14 (`kix.g9woiout3p6w`)

> **Anchor:** &rarr; Confirm &mdash; or say if you'd rather keep link clicks and label the column that way.

**[c] opener** &middot; **Tina Fleming** &middot; 2026-07-23T14:07:30Z &middot; *Assigned to dianna.gatto@avenuez.com*
> @dianna.gatto@avenuez.com Your call here!
>
> _Assigned to dianna.gatto@avenuez.com_

**[d] reply** &middot; **Dianna Gatto** &middot; 2026-07-30T00:48:17Z
> Keep link clicks and label it that way. Meta doesn't have a way to pull clicks (all) anymore

## T8 — anchored to D2-B20 (`kix.p5d88guj9ufz`)

> **Anchor:** &rarr; Confirm &mdash; or say you'd rather we compute it only over the channels that do report leads, and label it that way.

**[e] opener** &middot; **Tina Fleming** &middot; 2026-07-23T14:07:42Z &middot; *Assigned to dianna.gatto@avenuez.com*
> @dianna.gatto@avenuez.com Your call here!
>
> _Assigned to dianna.gatto@avenuez.com_

**[f] reply** &middot; **Dianna Gatto** &middot; 2026-07-30T00:55:58Z &middot; *(two paragraphs, blank line between)*
> The number of leads should come from hubspot and not from the ad platforms which would make the fact that meta has 0 leads irrelevant
>
> *(blank paragraph)*
>
> it should be spend across all platforms / hubspot leads attributed to AVZ

## T9 — anchored to D2-B29 (`kix.utqdhewumsj0`)

> **Anchor:** &rarr; Confirm &mdash; or say a missing channel should make the whole total unavailable.

**[g] opener** &middot; **Tina Fleming** &middot; 2026-07-23T14:08:02Z &middot; *Assigned to dianna.gatto@avenuez.com*
> @dianna.gatto@avenuez.com Your call here!
>
> _Assigned to dianna.gatto@avenuez.com_

**[h] reply** &middot; **Dianna Gatto** &middot; 2026-07-30T00:57:48Z
> a missing channel should make the whole total unavailable

## T10 — anchored to D2-B73 (`kix.61tb16vz4gyv`)

> **Anchor:** &rarr; Confirm &mdash; or say it should always total every keyword.

**[q] opener** &middot; **Tina Fleming** &middot; 2026-07-23T14:08:21Z &middot; *Assigned to amir.eldick@avenuez.com* &middot; **no replies**
> @amir.eldick@avenuez.com Your call here!
>
> _Assigned to amir.eldick@avenuez.com_

## T11 — anchored to D2-B77 (`kix.48iedkon60l`)

> **Anchor:** 11. Smaller assumptions &mdash; flag any you'd expect differently

**[s] opener** &middot; **Tina Fleming** &middot; 2026-07-23T14:08:54Z &middot; *Assigned to dianna.gatto@avenuez.com* &middot; **no replies**
> @dianna.gatto@avenuez.com Please review this section
>
> _Assigned to dianna.gatto@avenuez.com_

## T12 — anchored to D2-B86 (`kix.jcy11973w2b6`)

> **Anchor:** Questions for Amir and Greg

**[w] opener** &middot; **Tina Fleming** &middot; 2026-07-23T14:09:13Z &middot; *Assigned to amir.eldick@avenuez.com*
> @greg.huepler@avenuez.com @amir.eldick@avenuez.com Please review these questions.
>
> _Assigned to amir.eldick@avenuez.com_

**[x] reply** &middot; **Gregory Huepler** &middot; 2026-07-29T19:10:37Z
> Meta only bids toward the single optimization event set at the ad set level (example: On-Facebook form submit, website Lead, or a custom conversion), not all "lead" actions at once. What counts as a Lead can be different per client depending on how that event/custom conversion is defined and mapped in Events Manager.

> **Reaction recorded in the export:** "1 total reaction — Paul Ramirez reacted with 🙏 at 2026-07-29 8:46 PM UTC"

## T13 — anchored to D2-B79 (`kix.horr92ycithq`)

> **Anchor:** It shows both a combined top line and a per-channel breakdown. If both isn't possible, blended is the default, per Greg.

**[t] opener** &middot; **Dianna Gatto** &middot; 2026-07-30T01:03:16Z &middot; **no replies**
> why wouldn't both be possible?

## T14 — anchored to D2-B81 (`kix.f53ycn285rvh`)

> **Anchor:** Flag it if you'd expect them to match.

**[u] opener** &middot; **Dianna Gatto** &middot; 2026-07-30T01:04:12Z &middot; **no replies**
> they should match. Make them all with cents so it's exact

## T15 — anchored to D2-B83 (`kix.rajl8ynk2fya`)

> **Anchor:** &rarr; Any of these not what you'd expect?

**[v] opener** &middot; **Dianna Gatto** &middot; 2026-07-30T01:04:28Z &middot; **no replies**
> added comments where necessary

---

# Part 3 — Inline body answers, 1:1

Answers written **directly into the body in blue**, not as comments. All five are
Amir's. These are easy to miss because they do not appear in the comment sidebar.

| # | Element | Item | Author | Verbatim |
|---|---|---|---|---|
| IN-1 | D2-B47 | Item 7 | Amir Eldick | Amir: If possible, please add the summary total line to all tables on the Paid Search dashboard. Thank you! |
| IN-2 | D2-B62 | Item 8 | Amir Eldick | Amir: You can kept this as is - just asking or there to be a total for all fields at the bottom. Thank you |
| IN-3 | D2-B67 | Item 9 | Amir Eldick | Amir: Yes, okay to total as a plain sum |
| IN-4 | D2-B74 | Item 10 (stray line) | Amir Eldick | Amir: The total line sum should include all keywords, but the table should just display the top 10 |
| IN-5 | D2-B89 | Question 2 | Amir Eldick | Amir: For the DMA reporting, if it is coming from Google Ads, it should only define one DMA per conversion, so a little confused there. |

---

# Part 4 — Decision status scorecard

What was proposed, what was decided, by whom, and via which route.

| Item | The ask | Proposal in doc | Decision | Decided by | Route | Status |
|---|---|---|---|---|---|---|
| **1** | Hold Meta's Leads and Cost per lead | hold until settled | **Yes, hold. Meta is not focusing on lead generation for now** | Gregory Huepler | comment **[b]** | **Answered, matches proposal** |
| **2** | Meta clicks definition | switch Meta to **all clicks** | **Keep link clicks and label it that way.** Meta no longer exposes clicks (all) | Dianna Gatto | comment **[d]** | **Answered, REVERSES the proposal** |
| **3** | Blended cost per lead | show unavailable when a spending channel can't report leads | **Leads should come from HubSpot, not the ad platforms.** Formula = spend across all platforms / HubSpot leads attributed to AVZ | Dianna Gatto | comment **[f]** | **Answered, REPLACES the premise** |
| **4** | Total when a channel is missing | cover the channels we have, name the missing ones | **A missing channel should make the whole total unavailable** | Dianna Gatto | comment **[h]** | **Answered, REVERSES the proposal** |
| **5** | Overview as default landing | make Overview the landing page | **Overview should be the default landing** | Tina Fleming (opener "Confirmed"), Dianna Gatto (reply) | comments **[i]**, **[j]** | **Answered, matches proposal** |
| **6** | Commentary box owner | give it no box | **Remove the commentary from this page** | Dianna Gatto | comment **[l]** | **Answered** (see OPEN-D2-3) |
| **7** | Totals on all tables or just two | follow Amir, total every table | **Add the summary total line to all tables on the Paid Search dashboard** | Amir Eldick | **inline IN-1** | **Answered, matches proposal** |
| **8** | Region total scope | show both, e.g. "1,240 across top 10 of 34 regions" | **Keep as is, just add a total for all fields at the bottom** | Amir Eldick | **inline IN-2** | **Answered** (see OPEN-D2-4) |
| **9** | Plain sum OK | sum plainly, verify against live data | **Yes, okay to total as a plain sum** | Amir Eldick | **inline IN-3** | **Answered, matches proposal** |
| **10** | Keyword table total scope | reflect what's on screen, moves with the filter | **Total should include all keywords; table displays only the top 10** | Amir Eldick | **inline IN-4** (on the stray line D2-B74) | **Answered, REVERSES the proposal** |
| **11** | Smaller assumptions | five stated assumptions | **Two challenged** (see below), rest unchallenged | Dianna Gatto | comments **[t]**, **[u]**, **[v]** | **Partially answered** |
| **Q1** | Does Meta bid beyond Form Submissions? | — | **Meta bids toward a single optimization event set at ad-set level, not all lead actions. What counts as a Lead varies per client** | Gregory Huepler | comment **[x]** | **Answered** |
| **Q2** | Can one lead land in more than one DMA? | — | **Google Ads should define only one DMA per conversion** | Amir Eldick | **inline IN-5** | **Answered with uncertainty** ("so a little confused there") |

### Item 11 sub-decisions

| Bullet | Assumption | Response | By | Route |
|---|---|---|---|---|
| D2-B78 | Overview shows Spend, Clicks, Leads, Cost per lead in that order | *(unchallenged)* | — | — |
| D2-B79 | Shows both; blended is the fallback default | **"why wouldn't both be possible?"** | Dianna Gatto | **[t]** |
| D2-B80 | Keyword table opens at 10+ clicks, message if none | *(unchallenged)* | — | — |
| D2-B81 | Chart shows cents, card shows whole dollars | **"they should match. Make them all with cents so it's exact"** | Dianna Gatto | **[u]** |
| D2-B82 | Applies to internal view and client portal | *(unchallenged)* | — | — |

---

# Part 5 — Open items and ambiguities

Flagged, **not resolved**.

| ID | Where | The ambiguity |
|---|---|---|
| **OPEN-D2-1** | D2-B74 | **A stray duplicated question line.** Item 10 contains a second `→ OK to total as a plain sum, pending that check?` that is verbatim item 9's question and does not belong to item 10. It carries **its own inline Amir answer that differs from item 9's**. So the same question text has two different recorded answers (IN-3 "Yes, okay to total as a plain sum" vs IN-4 "total should include all keywords, table displays top 10"). IN-4 reads as an answer to item 10's actual question (D2-B73), not to the plain-sum question. **Needs confirmation that IN-4 answers item 10.** |
| **OPEN-D2-2** | D2-B73 / comment **[q]** | Item 10's real ask has an **open comment assigned to Amir with no reply**. Amir's inline IN-4 appears to answer it, but it is attached to the wrong line, so the assigned comment reads as still outstanding. |
| **OPEN-D2-3** | D2-B40 / comments **[k]**, **[l]** | Tina proposed **Dianna as owner**; Dianna replied **"remove the commentary from this page."** "No box" and "remove the commentary" may be the same outcome or may mean removing an existing commentary feature from the whole Paid Media page. **Scope of "this page" is unclear.** |
| **OPEN-D2-4** | D2-B59 / IN-2 | The doc offers three options (10 shown / all regions / both) and proposes **both**. Amir's inline answer says **"You can kept this as is - just asking or there to be a total for all fields at the bottom"**, which does not clearly select one of the three. Comment **[o]** on this ask has **no reply**. |
| **OPEN-D2-5** | Item 3 / comment **[f]** | **The largest open item.** Dianna's answer moves the lead source from the ad platforms to **HubSpot**, with blended CPL = spend across all platforms / HubSpot leads attributed to AVZ. This is a different data source than anything in the current build and is **not reflected in items 1, 4, or 11**, which all still assume platform-reported leads. Interaction with item 1 (holding Meta leads) is undefined: if leads come from HubSpot, item 1 may be moot. |
| **OPEN-D2-6** | Item 4 / comment **[h]** vs Item 3 / comment **[f]** | Dianna says a missing channel makes **the whole total unavailable** ([h]), but also says Meta's zero leads become **irrelevant** because leads come from HubSpot ([f]). Whether "missing channel" is judged on spend, on leads, or on both is undefined. |
| **OPEN-D2-7** | D2-B79 / comment **[t]** | Dianna asks **"why wouldn't both be possible?"** with no reply. The fallback premise is challenged and unanswered. |
| **OPEN-D2-8** | Q2 / IN-5 | Amir answers that Google Ads defines one DMA per conversion but adds **"so a little confused there."** The de-duplication question underpinning item 9 is answered with stated uncertainty, not settled. |
| **OPEN-D2-9** | Comments **[o]**, **[p]**, **[q]**, **[s]** | **Four comment threads have no reply.** Three are assigned to Amir ([o], [p], [q]) and one to Dianna ([s]). Some are answered inline in the body instead, but the threads themselves were never closed, so the doc reads as more open than it is. |
| **OPEN-D2-10** | D2-B02 vs items 7–10 | The doc asks people to flag disagreement. **Amir answered four items inline in the body rather than in the comments**, which is why a comment-only reading of this document misses half the decisions. Recorded here so no future reader repeats that mistake. |

---

# Part 6 — Cross-document conflicts with Document 1 (**NOT SOURCE** — derived)

> Our analysis, not the source. Included because these two documents disagree in
> places and the build has to reconcile them. **Parts 1 to 4 win over this.**

| # | Document 1 said | Document 2 said | Conflict |
|---|---|---|---|
| X-1 | Overview metrics: Spend, Clicks, Leads, Cost per lead, CTR and Conversions dropped (D1-B12, D1-B14, D1-B26) | Same list, same order (D2-B78) | **None. Consistent.** |
| X-2 | Blended and stacked both, all three voices (D1-B16, D1-B18, D1-B19) | Both, blended as fallback (D2-B79) &mdash; then Dianna challenges the fallback ([t]) | **Consistent, but the fallback is now questioned.** |
| X-3 | Req 2 named **two** tables (D1-B31); Amir widened to all tables (D1-B37), logged as OPEN-5 | Item 7 confirms **all tables** (IN-1) | **Doc 1's OPEN-5 is resolved by Doc 2: all tables.** |
| X-4 | Total Leads math left open, plain sum vs de-duplicated (D1-B34), logged as OPEN-2 | Item 9 confirms **plain sum** (IN-3), and Q2 says Google Ads defines one DMA per conversion (IN-5) | **Doc 1's OPEN-2 is largely resolved: plain sum, with Amir's caveat.** |
| X-5 | Keyword fallback: message vs 50 impressions, unresolved (D1-B46, D1-B49), logged as OPEN-3 | Item 11 states **a message**, Dianna's call; the 50-impression fallback dropped as not easier to build (D2-B80) | **Doc 1's OPEN-3 is resolved: show a message.** |
| X-6 | Channel with no data left undefined (D1-B29, D1-B30), logged as OPEN-1 | Item 4: **a missing channel makes the whole total unavailable** ([h]) | **Doc 1's OPEN-1 is resolved.** |
| X-7 | Cost / LPV = spend ÷ landing page views (Doc 1 comment [i], Greg) | Not revisited | **Consistent.** |
| X-8 | Lead reconciliation: use the "leads" event, drop Conversions (D1-B26, Greg) | **Leads should come from HubSpot, not the ad platforms** ([f], Dianna) | **DIRECT CONFLICT.** Doc 1 settles on a platform lead event; Doc 2 moves the source to HubSpot entirely. Doc 2 is newer (2026-07-30 vs 2026-07-21) and from the head of Paid Media, but this was never reconciled in writing. **Highest-value item to settle before building.** |

---

# Part 7 — Implementation cross-reference (**NOT SOURCE** — derived)

> Where each decision lands in the current codebase on `feat/paid-media-v2-feedback`.

| Item | Current state | Files |
|---|---|---|
| 1, 3, Q1 (Meta leads) | Meta section has **no leads/conversions at all**. 12 KPIs are spend/reach/engagement only. Nothing to hold. | `lib/meta/kpis.ts` |
| 2 (Meta clicks) | Meta uses **`inline_link_clicks`** and labels it "Link Clicks". Dianna's answer means **keep as is** and carry the label into the Overview. | `lib/meta/kpis.ts:37` |
| 4 (missing channel) | No cross-channel rollup exists, so no behavior to change yet. New Overview must implement unavailable-on-missing. | new |
| 5 (default landing) | Paid Media currently opens on `google-ads` (Paid Search). Needs the new Overview slug to become the landing. | `app/portal/[clientSlug]/reports/[reportSlug]/page.tsx`, sidebars |
| 6 (commentary) | Each Paid Media tab renders `SharedPartsHeader` which carries commentary. Removing it is a per-view change. | `components/report-sections/*/index.tsx`, `lib/commentary/views.ts` |
| 7 (totals all tables) | Campaign table **has** a totals row. Leads by Action has subtotals but no grand total. Region → DMA and Keywords have **none**. | `components/report-sections/paid-search/*.tsx` |
| 8 (region total) | Geo UI slices to **top 10** regions; the card shows the true count from the full array, so both numbers are already available. | `components/report-sections/paid-search/geo-section.tsx:14` |
| 9 (plain sum) | `totalLeads` already computed as a plain sum in the data layer. | `lib/paid-search/leads.ts:19` |
| 10 (keyword total) | Keyword rows capped at **top 50** by leads then cost, no filter and no total. Amir wants total over **all** keywords with a limited display. | `lib/paid-search/keywords.ts:29` |
| 11 / D2-B81 (cents) | Geo chart and KPI cards both use `usd()`. Dianna wants **cents everywhere**, so the shared formatter is the lever. | `lib/supermetrics/format.ts` |

---

## Change log

| Date | Change |
|---|---|
| 2026-07-30 | Created from the live Google Doc (tab 3) with the 2026-07-30 09:37 HTML export as cross-check. 89 body elements, 15 comment threads + 8 replies, 5 inline body answers, 11 decision items + 2 questions, 10 open items, 8 cross-document conflicts. Identified and documented the HTML export artifact that renders comment `[p]` twice as `[p]` and `[r]`. Awaiting accuracy confirmation. |
