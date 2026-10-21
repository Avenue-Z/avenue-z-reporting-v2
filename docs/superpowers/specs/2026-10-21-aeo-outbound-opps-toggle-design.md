# AEO Outbound: turn the Opportunities page on or off (design)

Status: draft for review, 2026-10-21. Code cited at dev `5fedaa52`, read this session.

## 1. What Ryan asked (round 3, verbatim)

"Inquire about toggle on/off the Opportunities page. Allowing sales person reviewing before sending to include this
page, or toggle off, depending on if they like the findings generated."

Decided with Thomas (2026-10-21): every report starts with the page on; when it is off, Methodology moves up to 04;
"Why it matters" stays. Nothing else is in scope: the pillars rework is a separate PR.

## 2. How the page works today

- **Render.** `renderSnapshotHtml` (`lib/aeo-outbound/render.ts:173`) always writes menu item 04
  (`render.ts:240`, `#opportunities`, mirror of `page.opps_label`) and the section `#opportunities`
  (`render.ts:287-297`: label "04 / " + `page.opps_label`, title `page.opps_title`, a table of `page.opps_col_1..3`
  and `opportunities.0..2.*`, footnote `page.opps_takeaway`). Methodology is "05" twice: menu (`render.ts:241`) and
  section label (`render.ts:299`). "Why it matters" is its own section without an id (`render.ts:281-286`).
- **Modes.** One renderer for draft (the editor frame), preview and final (`render.ts:14`, `:174`). Approve renders
  final from the stored slots and freezes it (`app/actions/aeo-outbound.ts:61-66`); the view route serves that frozen
  HTML forever (`view/route.ts:52-55`) and re-renders drafts on every open (`view/route.ts:61`).
- **Stored slots.** `Slots` (`slots.ts:21-37`) has no page-level switch. The stored contract is
  `STORED_SLOTS = z.looseObject({...})` (`contracts.ts:168-176`): unknown top-level keys pass; `page` is a strict
  `partialRecord` over `PAGE_KEYS` (`contracts.ts:175`), so a new key must not go under `page`.
- **Saving.** The editor's one `SaveQueue` PATCHes `/api/aeo-outbound/reports/[id]/slots`
  (`editor.tsx:209-215`). Text saves go through `applySlotPatch` and only take non-empty text (`slots.ts:59-61`). A
  structural save (`isStructuralPath`, `slots.ts:50-51`; today only `competitive_bullets|sources_bullets` add/remove)
  goes through `applyStructure` (`slots.ts:115-132`); the route returns the new slots on a structural 200
  (`slots/route.ts:62`, `:81`, `:105`) and the editor reloads the frame (`editor.tsx:221-226`). The queue sends a
  structural item only once no text edit is pending (`save-queue.ts:151`), and on success drops queued edits whose path
  starts with the structural path's first segment plus "." (`save-queue.ts:166-171`).
- **Approve gate.** `needsValidationPaths` (`slots.ts:146`) reads `slotEntries` (`slots.ts:135-143`), which lists
  every opportunities path and every page word, so a hidden "Needs validation" would block Approve
  (`app/actions/aeo-outbound.ts:62`) and the editor's Approve (`editor.tsx:333`; server count from
  `app/tools/new-business/[reportId]/page.tsx:56`).
- **Grounding.** `groundingFlags` checks every `slotEntries` entry (`grounding.ts:191-252`) and counts the old brand
  name over every entry (`grounding.ts:253-255`). It already skips text the page never shows: the context box with no
  competitors (`:194`) and the Powered by line (`:197`).
- **Labels.** `fieldLabel` names a path for save errors and the panel (`labels.ts:22-39`).

## 3. The changes

**S1. A stored switch.** `Slots` gains optional `opportunities_page?: 'shown' | 'hidden'`, top level. Absent means
shown, so every existing row reads as today. `FullSlots` carries it as `opportunities_page: 'shown' | 'hidden'`, filled
`'shown'` by `withDefaults` (`slots.ts:81-84`). `STORED_SLOTS` declares it
`opportunities_page: z.enum(['shown', 'hidden']).optional()`. No migration: it lives in the `slots` JSON.

**S2. Two structural paths.** `opportunities_page.hide` and `opportunities_page.show` join `isStructuralPath`.
`applyStructure` sets the switch to `'hidden'` or `'shown'`; the value must still be non-empty text (`"structure"`, as
today). Setting it to the state it already has is a 200 with unchanged slots. The first segment `opportunities_page`
is no prefix of any text path (text paths start `opportunities.`), so the queue's prefix cleanup
(`save-queue.ts:166-171`) drops nothing else.

**S3. The control.** In the editor toolbar (`role="toolbar"`, `editor.tsx:483`), right before Approve, for a draft
that is readable (the same condition as Approve, `editor.tsx:495`), a button whose text is "Opportunities page: on"
when shown and "Opportunities page: off" when hidden (no `aria-pressed`: the text carries the state). It is hidden while
a rerun's checklist replaces the toolbar (`editor.tsx:482`), as every toolbar button is.
- **Click.** Re-checks `queueRef.current?.state.structuring` and returns if set (as the frame path does,
  `editor.tsx:280`), posts `{type:'mode',edit:false}` to the frame, then calls `queueRef.current.structure(path)` with
  the opposite path (`editor.tsx:281-282`). It works in Preview and in Edit mode.
- **Disabled** whenever Approve is disabled for saving or busy: `busySaving || busy` (`editor.tsx:334-335`). That
  covers no queue yet, an unsaved or in-flight edit (`dirty` from the frame's first keystroke, `render.ts:59`), an
  outstanding refused field (`dirty` includes `bad`, `save-queue.ts:68`), a stopped queue and a structural item. So a
  text edit always lands before the toggle, and a refused opportunity cell must be fixed before the page can be hidden
  (review round 1, M1). Its `title` is Approve's (`approveTitle`, `editor.tsx:339-342`).
- **State.** A new prop `opportunitiesHidden` (`page.tsx` passes `full?.opportunities_page === 'hidden'`) seeds it.
  It is re-seeded in the same `sync` block as notes and titles, under the same `older` guard (`editor.tsx:124-131`),
  so a refresh after another tab's change shows the stored state (M3). After a 200 on either path the editor sets it
  from the path, and the existing structural branch reloads the frame (`editor.tsx:221-226`). A 400 or 409 leaves it
  unchanged.

**S4. Render.** When `opportunities_page === 'hidden'`, in every mode:
- menu item 04 (`render.ts:240`) and the `#opportunities` section (`render.ts:287-297`) are not written;
- Methodology's number reads "04" in the menu (`render.ts:241`) and "04 / " in its section label (`render.ts:299`);
- everything else is byte-identical, "Why it matters" included.
When shown, the page is byte-identical to today. What the editor shows is what Approve freezes: hidden in draft,
preview and final alike.

**S5. Hidden text is not checked.** `slotEntries` leaves out, when hidden, every `opportunities.N.*` path and
`page.opps_label`, `page.opps_title`, `page.opps_col_1`, `page.opps_col_2`, `page.opps_col_3`,
`page.opps_takeaway`. So a hidden "Needs validation" no longer blocks Approve, grounding flags nothing it cannot see,
and the brand-name count ignores the hidden table. The stored text is kept, so turning the page back on shows exactly
what was there. Every save, the toggle included, recomputes notes and needsValidation (`slots/route.ts:98`, `:105`),
so the panel and Approve follow at once.

**S6. (Removed, review round 1, M4.)** A refused structural item never enters `bad` (`save-queue.ts:180-184`), so no
label for these paths is ever shown; none is added.

## 4. Copies, reruns, generation

- **Edit a copy** copies the slots JSON (`store.ts:167-172`), so the copy keeps the switch.
- **Rerun** builds new slots from generation (`validateGeneratedSlots`, `slots.ts:162-201`), which never sets the key:
  the page starts on.
- **Generation** is unchanged: Glean still writes three opportunities (`contracts.ts:109`), whether or not the page is
  later turned off.

## 5. Who sees it

- **Drafts:** a draft that never toggles renders byte-identical to today.
- **Approved and sent reports:** unchanged forever (frozen HTML).
- **Rollout hazard:** a build without this change reads a row with the key, ignores it and shows the section. That
  matters only while two builds share one database; each environment gets this build when its branch does.

## 6. Edge cases

| Case | Behaviour |
|---|---|
| Old row, no key | Shown; byte-identical render |
| Hide, then show | Original text and order intact |
| Hide while a text edit is unsaved or refused | The button is disabled until the edit is saved or fixed (S3) |
| Two clicks quickly | The second is ignored while the first is structuring |
| Hide on a row whose opportunities hold "Needs validation" | Approve unblocks; turning back on blocks again |
| Hide, then Approve | The frozen page has no Opportunities section and Methodology is 04 |
| Edit a copy of a hidden report | The copy starts hidden |
| Rerun of a hidden report | Starts shown |
| Two tabs: the second tab toggles | 409 stale (`slots/route.ts:92-95`); its queue stops with "This snapshot changed. Reload." (`save-queue.ts:193-195`); after reload the button shows the stored state |
| Same-state path with a current revision (button state stale) | 200, slots unchanged, revision +1, button set from the path |
| A stored value other than the two words | The row breaks `STORED_SLOTS` and reads unreadable (`store.ts:21-24`), as any malformed slot does today; nothing writes one |

## 7. Tests (written first)

| File | Proves |
|---|---|
| `slots.test.ts` | `withDefaults` fills `'shown'`; `isStructuralPath` accepts both new paths and still rejects `opportunities.hide`; `applyStructure` hides, shows, repeats as a no-op, rejects empty value; `slotEntries` and `needsValidationPaths` leave out the eight kinds of hidden path only when hidden |
| `contracts.test.ts` | `STORED_SLOTS` accepts no key, `'shown'`, `'hidden'`; rejects any other value |
| `render.test.ts` | Hidden: no `#opportunities`, no `href="#opportunities"`, Methodology "04" in menu and label, in draft, preview and final; shown: unchanged output; "Why it matters" present both ways |
| `v1-compat.test.ts` | Unchanged and passing: a version 1 row renders as before |
| `grounding.test.ts` | A hidden opportunity with an unchecked number gives no flag; shown, it does |
| `slots/route.test.ts` | A toggle PATCH returns 200 with slots and the recomputed needsValidation; a stale revision is 409 as for bullets |
| `labels.test.ts` | Every `slotEntries` path still has a label, shown and hidden |
| `editor.test.tsx` | The button shows the state from the prop, sends the opposite path, is disabled while saving, dirty, refused, stopped or structuring, ignores a second click before re-render, flips after a 200 and not after a 400 or 409, re-seeds on newer props and not on older ones, and is absent on a sent or unreadable report |
| `app/actions/aeo-outbound.test.ts` | Approve of a hidden report whose opportunities say "Needs validation" succeeds, and its HTML has no Opportunities section |

## 8. Not touched

The prompt, the reply contract, generation, the opportunities' shape, `PAGE_KEYS`, settings, the hub, the share and
snapshot routes, AIVx files, the charts.

## 9. Minor findings carried to the plan (review round 1)

- m5: generation and every save store `'shown'` explicitly via `withDefaults` (`generate.ts:101`, `slots/route.ts:101`);
  only rows untouched since before this build lack the key. Same outcome as §4 says.
- m6: PR previews point at the dev Neon project (`ENGINEERS.md:501`), so dev, staging and previews can share a
  database; an old build keeps the key on save (`slots.ts:82-83`) but renders and approves the section. QA only on
  builds that carry this change.
- m7: covered in S3 (label, placement, disabled, double click).
- m8: the hidden paths are exactly `opportunities.{0,1,2}.{signal,opportunity,workstream}` and `page.opps_label`,
  `page.opps_title`, `page.opps_col_1`, `page.opps_col_2`, `page.opps_col_3`, `page.opps_takeaway`.
- m9: hidden variants of `render.test.ts:207` (fixed marks `['01','02','03','04','02 / ','03 / ','04 / ', date]`),
  `:216` (every slot path equals `slotEntries`, both states), `:218` and `:222` (no `page.opps_label` mirror; three menu
  copies).
- m10: `render.frame.test.ts` bootSpy on a hidden page (04 Methodology is the only active link at the bottom; header
  clone and AIVx sort are no-ops with no `.leaderboard`), and `save-queue.test.ts`: an `opportunities_page.*` 200
  keeps `opportunities.*` pending, dirty and bad entries.
- m11: "Looks right" ticks are keyed `kind|path|text` (`before-you-send.tsx:15`) and are kept across hide and show; the
  `brand_changed` note's text embeds its count (`grounding.ts:253-255`), so its tick resets when hiding changes the count.
