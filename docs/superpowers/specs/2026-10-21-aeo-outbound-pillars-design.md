# AEO Outbound: the Opportunities page shows the three pillars (design)

Status: draft for review, 2026-10-21. Code cited at dev `5fedaa52`, read this session.

## 1. What Ryan asked, and what is decided

Round 3: "Updating Opportunities page to follow the three pillars shown in our audit slide. Instead of half baked
recommendations and too many words, keep to three objective findings from the technical, earned, and content lens."

His answer to my question (2026-10-21, 12:29 PM), in short: the page shows insights, not recommendations; introduce
the pillars as the slide does; one line under each pillar that links this report's data to it. Earned: the share of
sources that are editorial. Content: the share coming from the brand's own site ("zero or low" is the point).
Technical: how often competitors' own sites are cited.

Decided with Thomas (2026-10-21): wording matches the donut (shares of the domain mix, not "citations"); pillar name
and description only, no sample items; slide order (Earned, Content, Technical); code writes the lines. The Content
description is the slide's sentence, completed after "LLMs" (the slide cuts it off).

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
`SENTENCES_VERSION` becomes 3. Names and descriptions are constants in `config.ts` (`PILLARS`):

| # | Name | Description |
|---|---|---|
| 0 | Earned & Affiliate Media | Quality citations from trusted media publications are a key factor in determining the credibility and authority of information. |
| 1 | Content and Creative | Publish high quality content that mimics natural language, rather than keyword stuffed blogs, to better influence how LLMs answer the questions buyers ask. |
| 2 | Technical Optimizations | Technical data structuring ensures your brand authority is optimized for AI crawlability and visibility across LLMs. |

Data lines, from `d.sourceMix`. The share of a slice prints with `sharePctAll([{ pct, exact }])` (`sentences.ts:65`),
`exact` being its weight over the mix total, exactly as the source-mix bullet prints it. "Sources AI drew on in this
snapshot" names the donut's whole.

| Pillar | Slice | Present, share prints | Present, `pct` 0 | Absent |
|---|---|---|---|---|
| Earned | `Editorial` | "Editorial sites make up {x} of the sources AI drew on in this snapshot." | "Editorial sites make up under 0.1% of the sources AI drew on in this snapshot." | "Editorial sites don't appear among the sources AI drew on in this snapshot." |
| Content | `You` | "{Brand}'s own {site makes / sites make} up {x} of the sources AI drew on in this snapshot." | "... under 0.1% ..." | "{Brand}'s own {site doesn't / sites don't} appear among the sources AI drew on in this snapshot." |
| Technical | `Competitor` | "Competitors' own websites make up {x} of the sources AI drew on in this snapshot." | "... under 0.1% ..." | "Competitors' own websites don't appear among the sources AI drew on in this snapshot." |

- `{Brand}` is `d.brand`, as every code sentence names it. "sites" when `d.ownDomains.length > 1`, else "site".
- An empty mix (`metrics.ts:245`) gives all three the line "Peec reported no source types for this window.", the
  source-mix bullet's own words (`sentences.ts:200`).
- No competitors tracked (`d.competitorsTracked === 0`): Technical reads "No competitors are tracked in this Peec
  project." (the context's own words for that case).
- PocketGuard's staging draft (`4e160c91`) reads Editorial 19%, own site 4.x%, Competitor 17% (its donut: 19%, 4%, 17%).

**P4. Glean no longer writes opportunities.** The prompt drops its `opportunities` line, the Peec-actions clause with it
(`prompt.ts:84`). `GLEAN_SLOTS.opportunities` becomes optional. `FixedSlots` gains `opportunities?` and
`validateGeneratedSlots` takes them from `fixed` when given, with no count check on the reply (the pattern of the boxes,
`slots.ts:171-176`). Generation sets `opportunities_layout: 'pillars'` on the new row (`generate.ts:101`). `codeSetPath`
counts every `opportunities.N.*` path as code-set, so a flag there never asks Glean to retry. The Data block is
unchanged (`v1-compat.test.ts:14-16` pins it).

**P5. Render.** When `opportunities_layout === 'pillars'`, the `#opportunities` section keeps its label (`04 / ` +
`page.opps_label`) and title (`page.opps_title`) and replaces the table and footnote with a grid of three cards, one
per row in order: the name (`opportunities.N.workstream`, AIVx's `.cluster-name` style), the description
(`opportunities.N.opportunity`, muted), then the data line (`opportunities.N.signal`, prominent). Three columns from
901px up, one column on phones, rules added inside the two existing media queries of `PAGE_CSS`. The cards reuse
AIVx's `.cluster-card` (`aivx/css.ts`); no AIVx file changes. Without the marker the section is byte-identical to
today.

**P6. Page words.** New rows' `page.opps_title` defaults to "The pillars of AI search" (the slide's title, sentence
case), set in `pageDefaults` (`slots.ts:76-78`), never in `PAGE_WORDS_V1`. `opps_col_1..3` and `opps_takeaway` are not
shown in the pillar layout, so `slotEntries` (`slots.ts:135-143`) leaves them out for a pillar row: they are not
checked and never block Approve. No `PAGE_KEYS` change. The menu item stays "Opportunities".

**P7. Grounding.** On a pillar row the three opportunity fields are not Glean's (`gleanWrote` false). The data line is
a code sentence: an edited one is checked word for word against today's `pillars(d)` when the row's version is current
(as the boxes are, `grounding.ts:170-180`, `:216-239`), and every number of the pillar sentences is allowed
(`grounding.ts:152-156`). Names and descriptions carry no numbers.

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
- **Other round-3 PRs:** the toggle (#411) moves this section into a constant, and the bullets PR will also bump
  `SENTENCES_VERSION`. Whichever merges second resolves the overlap; each PR stands alone off dev.

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
| `config.test.ts` | `SENTENCES_VERSION` is 3; `PILLARS` names and descriptions verbatim |
| `slots.test.ts` | `validateGeneratedSlots` takes fixed opportunities with no reply count; `pageDefaults` sets the pillar title; `slotEntries` leaves out `opps_col_1..3` and `opps_takeaway` on a pillar row only |
| `contracts.test.ts` | `GLEAN_SLOTS` accepts a reply with no opportunities; `STORED_SLOTS` accepts the marker absent or `'pillars'` and nothing else |
| `prompt.test.ts` | The prompt asks for no opportunities and names no Peec-actions rule; the Data block is unchanged |
| `generate.test.ts` | A generated row has the marker, the three pillar rows from code, and the pillar title |
| `grounding.test.ts` | A fresh pillar row has no flags; an edited data line number is flagged against its sentence; a table row's opportunities are checked as before |
| `render.test.ts` | Pillar row: three cards in order with name, description and line as slots, no table, no footnote, every mode; table row: unchanged |
| `v1-compat.test.ts` | Passes unchanged |
| `labels.test.ts` | Pillar labels; every `slotEntries` path labeled on both layouts |
| `settings-form.test.tsx` | No Peec-rows select; a save still sends the stored value |
| `editor.test.tsx` | The `pillars` prop reaches the save-error label |

## 7. Decisions for Thomas

- **D1. Card look.** Three cards in AIVx's cluster style (gradient pillar name, muted description, white data line).
  The scratch trial renders it with PocketGuard's numbers for you, and Ryan if you want, before the plan.
- **D2. Remove the dead setting from the Settings form** (P9), or leave it showing. I'd remove it: it would do nothing.

## 8. Not touched

The Data block, the other code sentences, the boxes, the charts, the toggle, `PAGE_KEYS`, the settings contract and
database, AIVx files, the hub, the share and snapshot routes.
