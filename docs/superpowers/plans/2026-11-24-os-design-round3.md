# Organic Social design overhaul, round 3: implementation plan

**Goal.** Finish decision (d) of the approved round 2 plan (`docs/superpowers/plans/2026-11-23-os-design-phase1.md:91-93`):
the controls the artifact has no equivalent for keep how they work and take only the kit's pill and button styles. Plus
three small fixes from my 2026-11-24 side-by-side against the approved artifact (line spacing, the graph grid, the empty
Insights box). **Those three are additions beyond what Paul approved in round 2, and the PR names them as such.**

**One PR**, off `dev` (3edb02d7), standalone. Every line cited below was read on `dev` on 2026-11-24.

## Global constraints

- **Behind the kit look only, never per client.** Every change is keyed on a signal only a kit part version sets. With
  no kit look the markup is byte-identical to today, so every client still on the old versions (Renaissance included,
  on every tab, and every month before a client's `designFrom`, option B) draws exactly as today.
- **Behaviour unchanged.** Same handlers, same server actions, same disabled rules, same `no-print`, same accessible
  names. Only class names change, plus `aria-pressed` on the channel toggles under the kit (see Task 2).
- **Social Listening and AEO Informed's own blocks untouched.** Both share `design/kit.module.css`
  (`social-listening/section.tsx:91,122`, `aeo-informed/section.tsx:89`). New classes are added to the stylesheet; no
  existing rule changes. Social Listening is measured before and after on the local app (Task 6); if anything on it
  moves, I stop and tell Thomas. The Insights and Recommendations boxes on the AEO Informed tab are not AEO Informed's
  own: they are the shared boxes (view key `organic-social:aeo-informed`, `organic-social/index.tsx:73,82,87`), which
  already take the kit look there under commentary@2 (`lib/commentary/month.ts:6`, `commentary/index.tsx:23,29`,
  `monthly.tsx:40`; round 2, Task 11). They follow Tasks 6 and 8 as on every other Organic Social tab, and are measured
  there too.
- **Requests unchanged.** No getter, request key or server action is touched, so the lock-key pins stay green.
- **Test first.** Each task's tests are written first and watched failing. Without-the-look markup is pinned by a
  snapshot recorded on `dev` before the change.
- Gates: `tsc --noEmit`, eslint on changed files, `npm run check:rsc`, the vitest suite, and a local look in the browser
  (dev database, `notes-test`, November is the kit and September the old look) with a screenshot for Paul's Slack only.

## The kit look signal, per area

| Area | Signal today | How the controls get it |
|---|---|---|
| Trend graphs (`trends.tsx`) | `shaded` / `frameless`, set only by `asKitChart` (`parts/trends-kit.tsx:23,26`) and documented as the kit look (`components/charts/line-chart.tsx:68-71`) | `ChannelTrendChart` reads `shaded` as the kit look (`const controlLook = shaded ? 'kit' : undefined`) and passes `look` down to its controls. No new prop on the chart. |
| YTD notes (`ytd-notes-panel.tsx`) | none; `kitYtd` leaves the panel as it is (`parts/ytd-kit.tsx:25-26`) | `kitYtd` clones the `YtdNotesPanel` element with `look: 'kit'` (it already clones `LineChart` that way, `:34`). |
| Post cards | `look="kit"` (`post-card.tsx:120-125`, `influencer-card.tsx:25-30`) | The cards pass `look` on to `DesignationToggle` (`post-card.tsx:147`, `influencer-card.tsx:51`). |
| Insights box | `look="kit"` (`commentary/commentary-panel.tsx:92`) | Already there. |

`shaded` is checked by grep today: its only setters are `trends-kit.tsx:23,26` and `ytd-kit.tsx:34`. A test pins that
`ChannelTrendChart` without `shaded` renders today's markup, so a non-kit caller can never get kit controls.

## Kit classes used (`design/kit.module.css`, read on `dev`)

- `.pill` (`:39-41`): 999px radius, 1px `var(--active)` border, no fill, 6px 14px, 12px/700, muted, fg on hover;
  pressed state on `aria-pressed="true"`.
- `.tbtn` (`:183-185`): 8px radius, 1px border at 14% white, 4% fill, 5px 10px, 12px/700, fg; `:disabled` at 0.5.
- `.addAnalysis` (`:166-167`): the artifact's dashed "+ Add analysis" button, used with `.tbtn`; already used by Social
  Listening (`social-listening/analysis.tsx:102`). Its `!important` makes it win over `.tbtn` whatever order the
  stylesheets load in.
- New, added by this PR (nothing existing changes): `.tight` (Task 6), `.field` (Task 3).

## Task 1: one place for the control classes

`components/report-sections/organic-social/control-look.ts`, a plain module (no `'use client'`, like `chart-look.ts`,
so server and client modules can both import it). Exports:
- `type ControlLook = 'kit' | undefined`
- `noteButton(look)`: `PILL` (`pill.ts:4`) or `kit.tbtn`.
- `cardButton(look)`: `CARD_PILL` (`pill.ts:5`) or `` `no-print whitespace-nowrap ${kit.tbtn}` `` (the no-wrap stays:
  the floating card clipped its buttons before, `annotation-callouts.tsx:129-131`).
- `field(look, old)`: `old` or `` `${kit.field} …` `` keeping each field's own size classes.

Tests: each returns today's exact string without the look, and the kit class with it.

## Task 2: graph controls (`trends.tsx`)

- Channel toggles (`:166-182`): with the look, `className={kit.pill}` and `aria-pressed={on}` (today they have no
  `aria-pressed`, and `.pill` draws its on state from it; an accessibility gain too). The colour dot span stays as is.
- Annotations toggle (`:186-202`): `kit.pill`; it already has `aria-pressed`.
- Add annotation (`:205-212`): `` `no-print ${kit.pill}` ``; keeps `aria-expanded`.
- Passes `look` to `NoteForm` (`:216`), `AnnotationCallouts` (`:227`) and `CalloutCard` (`:245`).
- The export path (`ExportChannelTrendChart`, `:259-288`) has no controls and is not touched.

Tests (`trends.kit-controls.test.tsx`, new): without `shaded` the markup equals the before-snapshot; with `shaded`
each control carries `kit.pill`, the channel toggles carry `aria-pressed` matching their state, a click still toggles a
channel, the annotations and the form exactly as today.

## Task 3: note buttons, card buttons, note fields

- `NoteForm` (`note-form.tsx:45`) gains `look?: 'kit'`: Save draft and Cancel (`:216-217`) use `noteButton(look)`; the
  form box (`:152`) takes `var(--border)` and `var(--subtle)`; the Day select (`:156-157`) and the text input (`:213`,
  `FIELD` at `:12`) take `field(look, …)`.
- `.field` (new): 8px radius, 1px border at 16% white, `var(--subtle)` fill, `var(--fg)` text: the artifact's form
  field colours and border (its `.pform input` and `.edit-area`). Sizes stay the field's own.
- `AnnotationCallouts` / `AnnotationItem` / `CalloutCard` (`annotation-callouts.tsx:155,180`) gain `look`; the Hide or
  Unhide button (`:135-143`) uses `cardButton(look)`, and `NoteActions` (`:145`) gets `look`.
- `NoteActions` (`note-actions.tsx:15`) gains `look`; its four buttons (`:46-64`) use `cardButton(look)`.

Tests: before-snapshots without the look for `NoteForm`, the callout row, a floating card and `NoteActions`; with the
look, the kit classes, and Save, Cancel, Hide, Edit, Approve, Revoke and Delete still call the same actions with the
same arguments (the existing mocks in `annotation-callouts.test.tsx` and `chart-notes-ui.test.tsx`).

## Task 4: YTD notes (`ytd-notes-panel.tsx`)

- `YtdNotesPanel` (`:30`) gains `look`, passed to `EditorPanel` (`:77`): Add annotation (`:102`) uses `kit.pill` (MINOR 5), the form box (`:166`) the kit box string,
  `MonthForm` (`:132`) its buttons (`:190-191`) and fields (`:173`, `:187`, `FIELD` at `:13`), and each row's
  `NoteActions` (`:122`) gets `look`.
- `parts/ytd-kit.tsx` `kitYtd`: `if (el.type === YtdNotesPanel) return cloneElement(el, { look: 'kit' })`.

Tests: `ytd-kit.test.tsx` gains a case that the kit YTD tree hands the panel `look: 'kit'` and @2 hands it none; the
panel's before-snapshot without the look (`ytd-notes-panel.test.tsx`).

## Task 5: designation toggle

`DesignationToggle` (`designation-toggle.tsx:11`) gains `look?: 'kit'`: with it, `` `whitespace-nowrap ${kit.tbtn}` ``;
without it, today's string (`:31`) untouched. `PostCard` (`post-card.tsx:147`) and `InfluencerCard`
(`influencer-card.tsx:51`) pass `{...(look ? { look } : {})}`.

Tests: `posts-kit.test.tsx` staff case checks every designation toggle in the kit tree carries `kit.tbtn` and none in
the old tree does; a click still calls `setDesignationAction` with the same arguments.

## Task 6: line spacing (addition)

The kit's `.root` sets no line height, so kit text inherits the app's 1.5 where the artifact uses `normal` (side by
side: tiles 156 vs 148px, tile titles 18px, pills 32 vs 30px, buttons 30 vs 28px; round 2 finding 8). `.root` is also
Social Listening's and AEO Informed's, so it is **not** changed. Instead a new `.tight { line-height: normal; }` is
added next to `kit.root` on the Organic Social kit wrappers only:
- `parts/trends-kit.tsx:23,26`, `parts/ytd-kit.tsx:55`, `parts/posts-kit.tsx:47`, `parts/kpi-kit.tsx:43`
- `parts/kit-tiles.tsx:56,68,90`
- `commentary/commentary-panel.tsx:119,253` (the kit path only)

Measured on the local app before and after with `getComputedStyle`: the Insights box on the AEO Informed tab, the tile heights, a tile title's line box, a pill
and a button on November (kit), and the same on September (old look, must not move). **Social Listening** (APFM's tab,
same session): every section's height and a sample of text line boxes before and after. If any Social Listening number
moves, I stop and tell Thomas before going further. Unit test: each wrapper's class list holds `kit.tight`.

## Task 7: graph grid lines (addition)

`components/charts/line-chart.tsx:399` draws `<CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />`
for every line chart in the app. With `shaded` (the kit look; set only by the kit versions, above) it draws
`strokeDasharray="4 4"` and `stroke="rgba(255,255,255,0.08)"`, the artifact's grid and the kit's own `.gridLine`
(`kit.module.css:91`). Without `shaded`, unchanged. The PDF follows (`ExportChannelTrendChart` passes the same look).

Tests: `line-chart` test renders with and without `shaded` and reads the grid's dash and stroke; without, today's.

## Task 8: the empty Insights box (addition)

Today the kit box with no entries shows the full panel: the title, a solid cyan Add button and "No insights for
<month> yet." The artifact's empty box (`.comm.is-empty`) has no border, fill or padding, only
`<button class="tbtn add-analysis">+ Add analysis</button>`: dashed border, no fill, muted text, yellow on hover. A
client never sees it (the server already returns nothing for a client with nothing approved, `index.tsx:58`,
`monthly.tsx:42,58`).

In `CommentaryPanel`, with `look="kit"`, when the editor can edit, is not editing, there are no entries, and there is
no history to open (`!(canApprove && history.length > 0)`): render only
`<div className="mb-8 {kit.root} {kit.tight}"><button className="{kit.tbtn} {kit.addAnalysis}">+ {addText(labels)}</button></div>`,
the same button Social Listening's empty box draws (`social-listening/analysis.tsx:102`),
whose click does exactly what Add does today (`setEditing('new')`); once editing, the full panel with the editor shows
as today. Words stay the box's own ("+ Add insights", "+ Add
recommendations"). Without the look, nothing changes; the editor, saving, approval and history are untouched.

Tests (`commentary-kit.test.tsx`): kit + empty + staff renders only the dashed button; clicking it
opens the editor as today; kit + history keeps the full panel; old look unchanged
(before-snapshot).

## Out of scope (named so nobody reads it as missed)

- The month picker, AEO Informed's controls and table (N3, not approved), Social Listening (already the kit's).
- The page glow (#487), section spacing (32 vs 40px), the staff Insights frame colour, tiles per row (data).
- KPI rings keep their look (decision (d)).

## Merge plan

Standalone off `dev`. #516 (the code tidy) edits the same kit part files (`trends-kit`, `ytd-kit`, `posts-kit`,
`kpi-kit`) in other hunks; I prove both orders merge clean with `git merge-tree`, plus every open PR that merges clean
with `dev` on its own.

## Review focus for Paul

1. The signal: `shaded` as the kit look inside `ChannelTrendChart` and `LineChart`, rather than a new prop.
2. Byte-identical without the look: the before-snapshots.
3. The three additions (Tasks 6 to 8), and the Social Listening measurement that proves Task 6 left it alone.

## Review round 1 (2026-11-24): MINOR findings, handled in the build

Both MAJORs were fixed above (the AEO Informed tab's boxes; `.addAnalysis` in place of a new class). The MINORs, each
handled while building, not by another review round:

1. Task 8's "no month" branch can never draw the kit: `kitActive(client, null)` is always false
   (`lib/organic-social/design-from.ts:27`), so `monthly.tsx:40-45` draws that panel without the look. The branch and
   its test are dropped.
2. `trends.tsx:152` already has `const look`; the control signal is named `controlLook`.
3. Citations: the `shaded` doc comment is `line-chart.tsx:68-71`; `MonthForm` starts at `ytd-notes-panel.tsx:132`.
4. Task 3 writes the exact kit class string for each element and replaces the old string rather than adding to it:
   the form boxes (`note-form.tsx:152`, `ytd-notes-panel.tsx:166`, the YTD one was missing) and the four fields
   (`note-form.tsx:157,213`, `ytd-notes-panel.tsx:173,187`), so no two utilities fight on one element.
5. Both Add annotation buttons take the same look. The YTD one (`ytd-notes-panel.tsx:102`) becomes `kit.pill` like
   the trend graph's (`trends.tsx:205-212`): both open the form, and both sit where the toggles would be.
6. Class-name tests cannot prove a rule exists (CSS modules under Vitest may return a name for any key). A stylesheet
   test, as `design/kit-svg-rule.test.ts` does, asserts `.tight { line-height: normal }` and `.field`'s declarations.
7. Task 8 records the empty staff case (no entries, can edit, no history) without the look on `dev` before the change,
   since the existing snapshots have none.

Review round 2 (changed lines only) found no BLOCKER or MAJOR. Its MINORs, also handled in the build:

8. The kit string for the note form box (`note-form.tsx:152`) keeps `no-print`; the Task 3 kit test asserts it.
9. `ytd-notes-panel.test.tsx` gains a kit-case assertion that Add annotation carries `kit.pill`.
10. The AEO Informed tab's boxes under the kit get a `commentary-kit.test.tsx` case with view key
    `organic-social:aeo-informed`; the local measurement runs there only if a dev client has that tab and the kit on.
