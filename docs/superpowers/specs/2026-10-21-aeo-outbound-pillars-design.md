# AEO Outbound: the Opportunities page shows the three pillars (design)

Status: draft for review, 2026-10-21. Code cited at dev `5fedaa52`, read this session.

## 1. What Ryan asked, and what is decided

Round 3: "Updating Opportunities page to follow the three pillars shown in our audit slide. Instead of half baked
recommendations and too many words, keep to three objective findings from the technical, earned, and content lens."

His answer to my question (2026-10-21, 12:29 PM), in short: the page shows insights, not recommendations; introduce
the pillars as the slide does; one line under each pillar that links this report's data to it. Earned: the share of
sources that are editorial. Content: the share coming from the brand's own site ("zero or low" is the point).
Technical: how often competitors' own sites are cited.

I decided (2026-10-21): wording matches the donut (shares of the domain mix, not "citations"); pillar name
and description only, no sample items; slide order (Earned, Content, Technical); code writes the lines. The Content
description is the slide's sentence, which the slide cuts off after "to better influence LLMs for..."; the ending "how
LLMs answer the questions buyers ask" is my wording.

## 2. How the page works today

- **Who writes it.** Glean writes exactly three `{signal, opportunity, workstream}` rows (`prompt.ts:84`;
  `GLEAN_SLOTS` `.length(3)`, `contracts.ts:109`; `validateGeneratedSlots`, `slots.ts:181-187`). Up to
  `peecOpportunityRows` of them may start "Peec recommends" (`prompt.ts:84`, the setting `settings.ts:19`, form
  `settings-form.tsx:128-134`).
- **Render.** A three-column table under the title `page.opps_title` with headers `page.opps_col_1..3` and the footnote
  `page.opps_takeaway` (`render.ts:287-297`); `PAGE_CSS` sizes it for desktop (`render.ts:123-134`).
- **Stored shape.** `STORED_SLOTS.opportunities` is required, exactly three `{signal, opportunity, workstream}`
  (`contracts.ts:172`). `page` is a strict record over `PAGE_KEYS` (`contracts.ts:175`): a new page key would make new
  rows unreadable on an older build.
- **Code sentences.** `dataSentences` (`sentences.ts:75`, type `DataSentences` `:5`) writes the context, both findings
  boxes and the methodology; generation passes them as fixed slots (`generate.ts:56-61`) and grounding checks an edited
  code sentence word for word only when `d.sentences === SENTENCES_VERSION` (`grounding.ts:150-151`, `:216`). The
  version is stored per row (`metrics.ts:295`; `SENTENCES_VERSION = 2`, `config.ts:36`).
- **Grounding.** The three opportunity fields count as Glean-written (`gleanWrote`, `grounding.ts:159-163`), so any
  digit in them is flagged as unchecked (`grounding.ts:217-223`). Generation retries only on flags Glean can fix
  (`codeSetPath`, `generate.ts:32-35`, used at `:106`).
- **The data.** `sourceMix` (`metrics.ts:233-244`) holds every domain type with its weight (Peec's usage rate,
  `config.ts:11-14`) and one-decimal `pct`. Labels: `Editorial`, `Competitor`, `You` for the brand's own domains
  (`metrics.ts:116-121`). This is the donut on the page and the source-mix bullet (`sentences.ts:200-223`), which prints
  each share with `sharePctAll` (`sentences.ts:65-74`).
- **Labels.** `fieldLabel` names opportunity paths "Opportunity N, signal" and so on (`labels.ts:34-35`); callers are
  the editor (`editor.tsx:341`, `:458`) and Before you send (`before-you-send.tsx:52`).

## 3. The changes

**P1. A layout marker.** `Slots` gains optional top-level `opportunities_layout?: 'pillars'`. Absent means today's
table. `STORED_SLOTS` declares it `z.literal('pillars').optional()`. Every report generated after this change has it;
drafts made before keep their table and their Glean rows, unchanged. Edit a copy keeps the row's layout; a Rerun is a
new generation and gets pillars. No migration.

**P2. The rows keep their shape.** A pillar row is stored in `opportunities` as `{ workstream: pillar name,
opportunity: description, signal: data line }`, so `STORED_SLOTS` (exactly three) holds and an older build can still
read a new row. Each field stays an editable slot through the existing paths (`slots.ts:46`).

**P3. Code writes the pillars.** `sentences.ts` adds `pillars(d)` and `dataSentences` returns it as `opportunities`.
`SENTENCES_VERSION` stays 2 (review round 1, M1): no existing sentence's wording or rounding changes (`config.ts:33-35`),
a bump would switch off the word-for-word check on every version-2 draft in flight (`grounding.ts:151`, `:216`), and
pillar rows are told apart by the P1 marker, not the version. Names and descriptions are constants in `config.ts`
(`PILLARS`):

| # | Name | Description |
|---|---|---|
| 0 | Earned & Affiliate Media | Quality Citations from Trusted Media Publications are a key factor in determining the credibility and authority of information. |
| 1 | Content and Creative | Publish high quality content that mimics natural language, rather than keyword stuffed blogs, to better influence how LLMs answer the questions buyers ask. |
| 2 | Technical Optimizations | Technical data structuring ensures your brand authority is optimized for AI crawlability and visibility across LLMs. |

Data lines, from `d.sourceMix`. The share of a slice prints with the source-mix bullet's rounding rule,
`sharePctAll` (`sentences.ts:65`), with `exact` its weight over the mix total. The whole is "the domain mix in this
window": the number is a usage-weighted share of the donut (`metrics.ts:233-244`), not a count of sources, and the
source-mix bullet on the same page already says "The domain mix is led by" (`sentences.ts:221`) and every code
sentence says "in this window" (`sentences.ts:144`, `:200`). (Review round 1, M3; this replaces the draft wording "of
the sources AI drew on in this snapshot".)

| Pillar | Slice | Present, share prints | Present, `pct` 0 | Absent |
|---|---|---|---|---|
| Earned | `Editorial` | "Editorial sites make up {x} of citations in this window." | "Editorial sites make up under 0.1% of citations in this window." | "Editorial sites don't appear among citations in this window." |
| Content | `ownMixWeight` (D3 (a)) | "{Brand}'s own {site makes / sites make} up {x} of citations in this window." | "... under 0.1% ..." | "{Brand}'s own {site doesn't / sites don't} appear among citations in this window." |
| Technical | `Competitor` | "Competitors' own websites make up {x} of citations in this window." | "... under 0.1% ..." | "Competitors' own websites don't appear among citations in this window." |

- **Own site counts as the first findings box counts it** (my decision D3 (a), 2026-10-21): a row is the brand's
  own when Peec classifies it OWN or its domain is an own domain or a subdomain of one (`ownRows`, `metrics.ts:215-222`).
  `buildSnapshotData` stores the sum of those rows' mix weight (`decisions.sourceMixWeight`, rows with weight above 0,
  the same filter as `metrics.ts:235-236`) as a new data field `ownMixWeight` (a number, 0 when none); the Content share
  is `ownMixWeight` over the mix total (the sum of `sourceMix` weights). So the page never denies an own site the box
  shows. It can read above the donut's "You" slice when Peec files an own subdomain under another type; accepted.
  `STORED_DATA` (`contracts.ts:146`, a loose object) declares `ownMixWeight: z.number().min(0).optional()`; older rows
  lack it and are never pillar rows. "Absent" for Content means `ownMixWeight` is 0.
- `Competitor` is the COMPETITOR class only: a roster competitor's site that Peec classifies CORPORATE is not in the
  Technical share. Once #413 merges, the gaps list includes it (roster domain match). I decided on 2026-10-21 that the
  Technical line stays the donut's Competitor slice, so the number always equals the slice on the same page.
- `{Brand}` is `d.brand`, as every code sentence names it. "sites" when `new Set(d.ownDomains.filter(Boolean)).size > 1`, else "site".
- An empty mix (`metrics.ts:245`) gives all three the line "Peec reported no source types for this window.", the
  source-mix bullet's own words (`sentences.ts:200`).
- No competitors tracked (`d.competitorsTracked === 0`): Technical reads "No competitors are tracked in this Peec
  project." (the context's own words for that case).
- PocketGuard's staging draft (`4e160c91`) reads Editorial 19%, own site 4.x%, Competitor 17% (its donut: 19%, 4%, 17%).

**P4. Glean no longer writes opportunities.** The prompt drops its `opportunities` line, the Peec-actions clause with it
(`prompt.ts:84`). The `opportunities` key is removed from `GLEAN_SLOTS` (`contracts.ts:109`), so the loose object
ignores whatever Glean sends there, as it ignores the boxes (review round 1, M5). `FixedSlots` gains `opportunities?` and
`validateGeneratedSlots` takes them from `fixed` when given, with no count check on the reply (the pattern of the boxes,
`slots.ts:171-176`). Generation sets `opportunities_layout: 'pillars'` on the new row (`generate.ts:101`). `codeSetPath`
counts every `opportunities.N.*` path as code-set, so a flag there never asks Glean to retry. The Data block is
unchanged (`v1-compat.test.ts:14-16` pins it).

**P5. Render.** When `opportunities_layout === 'pillars'`, the `#opportunities` section keeps its label (`04 / ` +
`page.opps_label`) and title (`page.opps_title`) and replaces the table and footnote with a grid of three cards, one
per row in order: the name (`opportunities.N.workstream`, AIVx's `.cluster-name` style), the description
(`opportunities.N.opportunity`, muted), then the data line (`opportunities.N.signal`, prominent). Three columns from
901px up, one column on phones: one-column base rules after the Methodology rules, outside the phone query, and the
three-column rule in the existing 901px block of `PAGE_CSS`. The cards reuse
AIVx's `.cluster-card` (`aivx/css.ts`); no AIVx file changes. Without the marker the section is byte-identical to
today.

**P6. Page words.** New rows' `page.opps_title` defaults to "The Pillars of AI Search" (the slide's title in its
own casing; my decision 2026-10-21, after a fresh-eyes review found the sentence case drifted from the slide), set in `pageDefaults` (`slots.ts:76-78`), never in `PAGE_WORDS_V1`. `opps_col_1..3` and `opps_takeaway` are not
shown in the pillar layout, so `slotEntries` (`slots.ts:135-143`) leaves them out for a pillar row: they are not
checked and never block Approve. No `PAGE_KEYS` change. The menu item stays "Opportunities".

**P7. Grounding.** All of it keyed on `pillarRow = full.opportunities_layout === 'pillars'`, inside `groundingFlags`
(review round 1, M4); `isCodeSentencePath` (`sentences.ts:9`) stays unchanged, so table rows are checked exactly as
today:
- `gleanWrote` (`grounding.ts:159-163`) is false for `opportunities.N.*` when `pillarRow`.
- The "Peec recommends" check (`grounding.ts:245-250`) is skipped when `pillarRow`.
- `opportunities.N.signal` is treated as a code-sentence path only when `pillarRow`: brand names are stripped before
  its domain scan (`grounding.ts:214`) and, when `sameVersion`, it is compared word for word (`:216`) with
  `pillars(d)[N].signal`, matched by index N (`peecSentence`, `:170-180`).
- The pillar sentences' numbers join `allowed` (`grounding.ts:152-156`) only when `pillarRow`.
- Names and descriptions (`.workstream`, `.opportunity`) carry no numbers; they get only the domain, date and dash checks.
- `codeSetPath` (`generate.ts:32-35`) counts `opportunities.N.*` as code-set; it is used only at generation, where every
  row is a pillar row.

**P8. Labels.** `fieldLabel(path, titles, pillars = false)`: on a pillar row "Pillar N, name", "Pillar N, description",
"Pillar N, data line". The editor gets a prop `pillars` (from `page.tsx`: `full?.opportunities_layout === 'pillars'`)
and passes it to its two calls and to Before you send.

**P9. The dead setting.** "Most opportunities from Peec recommendations" no longer affects any new report (P4). Its
select is removed from the Settings form (`settings-form.tsx:128-134`); the form still submits the stored value, so the
settings contract, the database column and older rows' `settingsUsed` are unchanged (decision D2).

## 4. Who sees it

- **New reports** (generated or rerun after this ships): pillars.
- **Drafts made before:** their table, unchanged, byte for byte.
- **Approved reports:** never change (frozen HTML).
- **Rollout:** an older build reading a pillar row shows it in the old table under the old headers (name, description
  and line in the Signal, Opportunity and Workstream columns). PR previews share the dev database (`ENGINEERS.md:501`):
  QA only on builds with this change.
- **Other round-3 PRs:** the toggle (#411) moves this section into a constant. Combined with it in one PR on
  2026-10-22 (`feat/aeo-outbound-opportunities`, merge `95140bd5`); the rules are in the toggle spec §1. This PR no longer bumps `SENTENCES_VERSION`.

## 5. Edge cases

| Case | Behaviour |
|---|---|
| Editorial, own site or Competitor absent from the mix | The "don't appear" line for that pillar |
| A slice present but rounded to 0.0 | "under 0.1%" |
| Empty mix | All three lines "Peec reported no source types for this window." |
| No competitors tracked | Technical: "No competitors are tracked in this Peec project." |
| Brand with two own domains | "own sites make up" / "own sites don't appear" |
| Ryan edits a data line's number | Flagged against Peec's number in that sentence, as for the boxes |
| Ryan edits a name or description | Saved as text; no number to check |
| A row generated before this ships | Table, Glean rows, old labels and checks, unchanged |
| Glean still sends `opportunities` | Ignored, as it ignores the boxes it still sends |

## 6. Tests (written first)

| File | Proves |
|---|---|
| `sentences.test.ts` | Every row of the P3 table and the empty-mix, no-competitor and two-domain cases; shares print as the source-mix bullet prints them |
| `config.test.ts` | `SENTENCES_VERSION` still 2; `PILLARS` names and descriptions verbatim |
| `slots.test.ts` | `validateGeneratedSlots` takes fixed opportunities with no reply count; `pageDefaults` sets the pillar title; `slotEntries` leaves out `opps_col_1..3` and `opps_takeaway` on a pillar row only |
| `contracts.test.ts` | `GLEAN_SLOTS` accepts a reply with no opportunities and one with two malformed ones; `STORED_SLOTS` accepts the marker absent or `'pillars'` and nothing else |
| `prompt.test.ts` | The prompt asks for no opportunities and names no Peec-actions rule; the Data block is unchanged |
| `generate.test.ts` | A generated row has the marker, the three pillar rows from code, and the pillar title |
| `grounding.test.ts` | A fresh pillar row has no flags, a domain-shaped brand included; an edited data line number is flagged against its sentence; a pillar row skips "Peec recommends"; a table row's opportunities are checked as before, with the same allowed numbers; an own domain classified CORPORATE counts in the Content line, so it can read above the donut's You slice (D3 (a)) |
| `render.test.ts` | Pillar row: three cards in order with name, description and line as slots, no table, no footnote, every mode; table row: unchanged |
| `v1-compat.test.ts` | Passes unchanged |
| `labels.test.ts` | Pillar labels; every `slotEntries` path labeled on both layouts |
| `settings-form.test.tsx` | No Peec-rows select; a save still sends the stored value |
| `editor.test.tsx` | The `pillars` prop reaches the save-error label |

## 7. Decisions

**I decided (2026-10-21):** D2 remove the setting from the form; D3 (a); D4 the new wording; D1 after the trial.

- **D1. Card look.** Three cards in AIVx's cluster style (gradient pillar name, muted description, white data line).
  The scratch trial renders it with PocketGuard's numbers, for me and for Ryan, before the plan.
- **D2. Remove the dead setting from the Settings form** (P9), or leave it showing. I'd remove it: it would do nothing.
- **D3. What counts as the brand's own site in the Content line** (review round 2, M1). (a) Peec's OWN class or a
  domain match, as the first findings box counts it: the share is the usage weight of those rows over the mix total,
  the page never denies a site it shows elsewhere, and it can read above the donut's "You" slice when Peec misclassifies
  a subdomain. (b) The `You` slice, as the donut shows it, with a different absent line when the box shows own
  retrievals. (c) The `You` slice as drafted, accepting the rare clash. Recommended: (a).
- **D4. Wording** changed in round 1 from the draft I approved: "of the domain mix in this window" in place of
  "of the sources AI drew on in this snapshot" (P3).
  Changed again on 2026-10-22 to "of citations in this window" ("among citations" when absent), Ryan's word in his
  answer on the findings bullets (bullets spec D2). `SENTENCES_VERSION` stays 2, as P3 says: the reworded lines exist
  only on pillar rows, which the P1 marker tells apart (Paul's review; an earlier note here said 3).

## 8. Not touched

The Data block, the other code sentences, the boxes, the charts, the toggle, `PAGE_KEYS`, the settings contract and
database, AIVx files, the hub, the share and snapshot routes.

## 9. Minor findings carried to the plan (review round 1)

- m1: print the three shares in one `sharePctAll` call over the present slices, so two pillars never read alike when
  their values differ; a card may still print a whole number where the bullet prints a decimal ("19%" vs "19.4%")
  because the bullet disambiguates across its own items. Say "the bullet's rounding rule", not "exactly as".
- m2: "sites" when `new Set(d.ownDomains.filter(Boolean)).size > 1`.
- m3: empty mix wins over no competitors; no competitors tracked but a `Competitor` slice present prints the slice line.
  Test both.
- m4: "{Brand}'s" for a name ending in s ("Dickies's") as `sentences.ts:144` does today; a custom Peec class named
  "Editorial" or "You" merges into that slice as in the source-mix bullet. Accepted.
- m5: deliberate test edits: `generate.test.ts:374` (`codeSetPath('opportunities.0.signal')` becomes true),
  `render.test.ts:573`, `:577`, `:579` (the media blocks), `before-you-send.test.tsx` (pillar labels).
- m6: §4 "byte for byte" applies to the table section; the shared stylesheet gains the pillar rules on every page.
- m7: an older build that saves a pillar draft stores `unchecked_number` notes on its data lines; a new build shows them
  until the next save.
- m8: `DataSentences` is `sentences.ts:6`; `v1-compat.test.ts:14-16` pins a version-1 row's Data block only; the Data
  block keeps Peec's actions line (`prompt.ts:58`), now read by no field, to keep it unchanged; PocketGuard's exact
  stored values are unverified (read from its staging donut only).

## 10. Review round 2 (changed lines only): one MAJOR (decided as D3), minors carried to the plan

- **Open MAJOR (r2-M1):** with the `You` slice rule, an own subdomain that Peec classifies CORPORATE shows in the first
  findings box ("Blog.brand.com appears in 300 retrievals", `sentences.ts:149-151`, from `ownRows`, `metrics.ts:218-221`)
  while the Content line says the brand's own site doesn't appear. Decided as §7 D3 (a).
- r2-m1: names and descriptions fall through to the allowed-numbers check (`grounding.ts:241`) like any non-Glean field,
  plus the domain, date and dash checks.
- r2-m2: deliberate test edits also include `contracts.test.ts:159`, `:167`, `:245-246` (opportunities no longer in
  `GLEAN_SLOTS`).
- r2-m3: code sentences say "in this window" or "for this window" (`sentences.ts:144`, `:200`); the rest don't name it.
- r2-m4: the `SENTENCES_VERSION` comments (`config.ts:33-35`, `metrics.ts:66`) name `pillars(d)` too, so a later pillar
  wording change bumps the version. Superseded by Paul's review: the pillar lines are checked on any pillar row by the
  P1 marker, so the comments now say a later pillar wording change needs a check of its own.
- r2-m5: "sites" when `new Set(d.ownDomains.filter(Boolean)).size > 1` (§9 m2's rule; it replaces P3's).
- r2-m6: a roster competitor's site that Peec classifies CORPORATE is in neither the Technical share nor the gaps
  (`metrics.ts:254`) (true until #413 merges).

