# AEO Outbound: Competitive Visibility before Cited Sources (design)

Status: draft for review, 2026-10-21. Code cited at dev `5fedaa52`, read this session.

## 1. What Ryan asked (round 3, verbatim)

"Competitive Visibility page and Category Data page (to be renamed to Cited Sources) are going to be switched, so
Competitive Vis page will go before it."

A fresh-eyes review (2026-10-21) found this was parked behind my question 1 although it does not depend on it: Q1 asks
how the bullets read, while the order and the name are already decided. I decided to build it now, in its own PR, with
Ryan's casing ("Cited Sources", "Competitive Visibility"). The bullet regroup ("Confirming the cleared up renaming ...
will give the tool more direction") still waits on Q1 and is not here.

## 2. How it works today

**Order.** The menu lists `#category-data` as 02 and `#competitive-visibility` as 03 (`render.ts:238-239`). The page
writes the sections in the same order, each with a fixed number prefix (`render.ts:265-280`: `fixed('02 / ')`,
`fixed('03 / ')`). `#category-data` holds the `competitive_bullets` box (`:269`) and the Domain Types donut (`chart_1_title`, `:270`);
`#competitive-visibility` holds the `sources_bullets` box (`:277`) and the visibility bars (`chart_2_title`, `:278`). The titles are `t1 = p.section_1_title` and `t2 = p.section_2_title` (`render.ts:222-223`).

**Titles.** A new row's page words come from `pageDefaults` (`slots.ts:76-78`, called at `generate.ts:101`), which
takes `section_1_title` and `section_2_title` from the generation settings. Those are the saved settings row, or, with
no row, `SETTINGS_DEFAULTS.sectionTitles` (`settings.ts:16`), which reads `DECISIONS.sectionTitles`
(`config.ts:5`, `['Category data', 'Competitive visibility']`). `PAGE_WORDS_V1.section_1_title` and `section_2_title`
also read `DECISIONS.sectionTitles` (`config.ts:75-76`); they fill rows from before v1.1 (`slots.ts:83`), pinned by
`v1-compat.test.ts:76` (the v1.0 final page, byte for byte). Admins edit the titles in Settings (`settings-form.tsx:100`,
`:104`, labels `FIRST_SECTION` and `SECOND_SECTION`, `messages.ts:136-137`).

**Labels.** The editor and Before you send name the fields "First section title", "Second section title", "First chart
title", "Second chart title" (`labels.ts:11-13`). A bullet's label uses `titles[0]` for `competitive_bullets` and
`titles[1]` for `sources_bullets` (`labels.ts:26`), so it already follows the box, not the position.

**Scroll highlight.** AIVx's scroll spy picks the last `.section[id]` whose top is at or above 120px
(`aivx/js.ts:2`, "Active nav state on scroll"). It walks the sections in DOM order and keeps the last one high enough,
so it follows the page as long as DOM order is visual order, which O1 keeps. `render.frame.test.ts:323-370` exercises it.

**Unverified.** Whether staging and production have a saved settings row, and which titles it holds: `.env.local` has no
`DATABASE_URL`, so I could not read either database.

## 3. The changes

**O1. New rows put Competitive Visibility first.** A new optional stored slot marker, `section_order:
'visibility_first'` (`Slots` in `slots.ts`, `STORED_SLOTS` in `contracts.ts`, a loose object, so older builds keep
reading the row), set by `generate.ts` on every new row next to `pageDefaults` (`:101`). With the marker:
- the menu lists `#competitive-visibility` as 02, then `#category-data` as 03;
- the page writes `#competitive-visibility` (prefix "02 / ") before `#category-data` (prefix "03 / ");
- each section keeps its own id, title slot, bullet box, chart and CSS; only the order and the two numbers move;
- every menu item after the two data items (Opportunities and Methodology, numbered as #411 sets them) stays after both, whichever comes second.
  #411 appends its Opportunities link to the end of the `#competitive-visibility` menu line (its `render.ts:256`,
  `${oppsNav}`), so the merge must attach it after the pair, not to that line (review round 1, MAJOR 1).
Without the marker the page is byte-identical to today, so drafts in flight and rows from before v1.1 keep their order.
Approved reports are frozen HTML and never change.

**O2. The names.** `DECISIONS.sectionTitles` becomes `['Cited Sources', 'Competitive Visibility']` (`config.ts:5`), so
`SETTINGS_DEFAULTS` and a new row take them where no settings row is saved. `PAGE_WORDS_V1.section_1_title` and
`section_2_title` become the literals `'Category data'` and `'Competitive visibility'`, so rows from before v1.1 and
`v1-compat` do not change. The `config.ts:4` comment says what each title is.

**O3. Where a settings row is saved** (staging and production, unverified), it wins over the default, so the names
change there only when an admin edits Section titles in Settings. That is a settings change on a live environment: I do
it, or ask for it, after merge, never from code. The PR states the exact values: first "Cited Sources", second
"Competitive Visibility".

**O4. Labels follow the content, not the position.** `section_1_title` "Sources section title", `section_2_title`
"Visibility section title", `chart_1_title` "Domain types chart title", `chart_2_title` "Visibility chart title"
(`labels.ts:11-13`); `FIRST_SECTION` "Sources section title" and `SECOND_SECTION` "Visibility section title"
(`messages.ts:136-137`). They are right for old and new rows alike, since a key never changes its section.

Not touched: section ids and every CSS rule naming them, the bullets and their boxes (Q1), chart titles and charts,
`PAGE_KEYS`, `SENTENCES_VERSION`, AIVx files, the headline and Opportunities sections.

## 4. Who sees it

New reports: Competitive Visibility at 02, Cited Sources at 03, Ryan's names (where Settings holds them). Drafts in
flight: unchanged until rerun (a rerun is a new generation, `generate/route.ts:59-91`, and gets the marker). Approved
reports: unchanged. Until Q1 ships, the Cited Sources page still shows today's first box ("Category position", "Present
in the source ecosystem", "Source-use signal"); that is what Q1 regroups.

## 5. Edge cases

| Case | Behaviour |
|---|---|
| Row with the marker | 02 Competitive Visibility, 03 Cited Sources, in menu and page |
| Row without the marker (any older row) | Byte-identical to today |
| Row from before v1.1 | Byte-identical; titles from the frozen `PAGE_WORDS_V1` literals |
| Marker with any other value | Refused by `STORED_SLOTS` (`z.literal`, as unmerged #412 does for its marker); see §8 r1-3 for what refusal does |
| Salesperson edits a section title | Saved on that row as today; the order does not change |
| Settings row saved with old titles | New rows still say "Category data"; order still swaps (O3) |
| Scroll highlight on a marker row | Follows position, as today; pinned by a frame test |
| Opportunities toggle (#411) or pillars (#412) on the same row | Order of 02 and 03 independent of both; the Opportunities link (shown or hidden) always follows 03 (O1). Pinned by a marker-row test of the full menu sequence, page shown (01, 02 `#competitive-visibility`, 03 `#category-data`, 04 `#opportunities`, 05 `#methodology`) and page hidden (04 Methodology right after 03); this PR tests the shown sequence (dev has no toggle), and whichever of this PR and #411 merges second adds the hidden case (review round 2, my decision 2026-10-21) |

## 6. Tests (written first)

| File | Proves |
|---|---|
| `render.test.ts` | Marker row: the full menu sequence in order, 01 `#headline`, 02 `#competitive-visibility`, 03 `#category-data`, 04 `#opportunities`, 05 `#methodology`, each with its number; section order by index; each id keeps its own bullet box and chart; "02 / " on Competitive Visibility. No-marker row: today's order (existing `:93-97` unchanged) |
| `v1-compat.test.ts` | Unchanged and passing |
| `render.frame.test.ts` | Marker row: on scroll, with tops in the marker row's page order, the highlight follows that order (§8 r1-5: a click activates by href, so it proves nothing about order) |
| `contracts.test.ts` | `section_order` accepts `'visibility_first'`, rejects another value, absent is fine |
| `generate.test.ts` | A generated row carries the marker |
| `slots.test.ts` | A text edit (`applySlotPatch`) and a bullet add and remove (`applyStructure`) on a marker row, read through `withDefaults`, keep `section_order`; a row without it gains none (review round 1, MAJOR 2: every save takes this path, `app/api/aeo-outbound/reports/[id]/slots/route.ts:76`, `:89`, `:101`) |
| `config.test.ts` | `DECISIONS.sectionTitles` is Ryan's names; `PAGE_WORDS_V1` titles stay the v1.0 words |
| `settings.test.ts` | `SETTINGS_DEFAULTS.sectionTitles` follows `DECISIONS` |
| `labels.test.ts`, settings form test | The four content labels |

## 7. Overlaps

#411 and #412 also edit `render.ts` near the menu (for #411, the Opportunities link: see O1), `slots.ts` (`Slots`), `contracts.ts` (`STORED_SLOTS`) and
`generate.ts:101-102` (pillars sets its marker there). Each is an addition beside another; whichever merges second keeps
both. #413 edits `pageDefaults`, not touched here.

## 8. Review round 1: minors carried to the plan

- r1-3: a `section_order` value this build does not know makes the row unreadable (`store.ts:22`, `app/tools/new-business/[reportId]/page.tsx:34`, 409 on
  save, `slots/route.ts:71-73`), as for any contract failure. Accepted: one value exists, written only by code.
- r1-4: on marker rows Before you send, Needs validation and Approve's first highlighted item keep storage order
  (`slots.ts:137`, `:146`, `editor.tsx:350`), so a Cited Sources bullet is listed before a Competitive Visibility one;
  Settings keeps Sources first (`settings-form.tsx:100`, `:104`). Accepted; the labels name the section (O4).
- r1-5: the frame test uses a marker row whose stubbed tops follow its DOM order (Competitive Visibility above Cited
  Sources) and expects `#competitive-visibility` active on scroll; a click test alone proves nothing about order.
- r1-6: the render tests assert marker order in final, draft and preview; in draft, the editable menu copies list
  `page.section_2_title` before `page.section_1_title` (counterpart of `render.test.ts:222`).
- r1-8: "Competitive Visibility" recased on my decision (Ryan's casing, 2026-10-21); the PR says so.
- r1-9: more overlaps: #412 changes `fieldLabel`'s signature in `labels.ts`; #411 edits `messages.ts` and
  `render.frame.test.ts`.
- r1-10: the `slots.ts:1-2` comment ("first data section ... second") is reworded by content, as `config.ts:4` is.
