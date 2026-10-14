# AEO Outbound editor: use the whole screen (issue #396)

Status: draft for review, 2026-10-14. Branch `fix/aeo-outbound-editor-space` off `dev` `b964970e`. Every line reference
below was read on that commit in this session.

## 1. Problem, measured

On a wide screen the report editor (`/tools/new-business/[reportId]`) leaves black space on both sides of the report
and a strip below it. Measured on staging (`e4b337bf`), signed in, my draft `7df0986d`, viewport 1920×1080, sidebar
expanded:

| Box | x | y | width | height |
|---|---|---|---|---|
| `main` | 256 | 0 | 1664 | 1080 |
| content wrapper | 448 | 0 | 1280 | 1039 |
| sticky toolbar | 448 | 0 | 1280 | 51 |
| report frame | 480 | 67 | 1216 | 940 |
| Before you send panel | 1312 | 67 | 384 | 336 |

- Black at the sides: 224px left of the frame (480 − 256) and 224px right (1920 − 1696).
- Black below: 73px (1080 − 67 − 940).
- The panel covers 384 of the frame's 1216px, 32% of the report's width.

## 2. Root cause, from the code

1. **Width.** Every tools page renders inside one wrapper capped at 1280px: `mx-auto max-w-7xl px-8 py-8`
   (`app/tools/layout.tsx:23`). The editor is a child of it, so the frame can never be wider than 1280 − 64 = 1216px.
   Below a 1536px viewport (256px sidebar + 1280px) the cap does not bite; above it, the rest is black.
2. **Height.** The frame and its loading box have a fixed height, `calc(100vh - 140px)`
   (`components/aeo-outbound/editor.tsx:516`, `:517`). What actually sits above the frame is the sticky toolbar
   (`editor.tsx:448`: `py-3`, a border, `mb-4`, pulled up by `-mt-8`) and, below it, the wrapper's `py-8` bottom padding
   (32px). At 1920×1080 the toolbar is 51px, so the space used is 51 + 16 + 32 = 99px, not 140: 41px of the strip is the
   guess being wrong and 32px is the padding. The toolbar is not a fixed height either: it wraps on a narrow window
   (`flex-wrap`, `editor.tsx:449`, `:464`) and grows a line for the edit banner (`:495`) and the locked message (`:496`),
   so no constant can be right.

## 3. What the report itself does with more room (why widening is safe)

- The report inside the frame is fluid: `.main { margin-left: var(--sidebar-w); flex: 1; max-width: calc(100vw -
  var(--sidebar-w)) }` with `--sidebar-w: 240px`, and one breakpoint at 900px that hides the report's own sidebar
  (`lib/aeo-outbound/aivx/css.ts`; `@media (max-width: 900px)` is the only media query in it). Paragraph text keeps its
  own reading width (`.section-intro { max-width: 720px }`, same file), so extra width goes to charts and tables, not to
  longer lines.
- The prospect sees the same HTML at their full browser width: the public link serves the report document itself
  (`app/snapshot/[token]/route.ts:26`). A full-width editor previews the report the way the recipient sees it.

## 4. Behavior after the change

### 4.1 Width (editor page only)
- On `/tools/new-business/[reportId]`, while the editor is rendered, the content wrapper has no width cap. It keeps its
  32px side padding (`px-8`), so the frame is `main` width − 64px (1600px at 1920 with the sidebar expanded).
- Every other tools page keeps the 1280px cap exactly as today: the hub (`/tools/new-business`), Settings, `/tools`,
  `/tools/reporting`, `/tools/[teamSlug]`, and the editor route's own refusals (`NoAccess`, `SnapshotNotFound`,
  `app/tools/new-business/[reportId]/page.tsx:21-22,31`), which render without the editor.
- Mechanism: the editor's root element carries a marker attribute `data-aeo-editor`; the wrapper in
  `app/tools/layout.tsx:23` adds Tailwind's `has-[[data-aeo-editor]]:` variant (CSS `:has()`) to drop `max-w-7xl` and
  shrink the bottom padding (4.2). No other page renders the marker. The repo already uses `has-[...]`
  (`components/ui/button.tsx:24`) on Tailwind 4 (`package.json:79`). A browser without `:has()` keeps today's layout.
- The marker is on the editor in every status (generating, failed, unreadable, draft, live, revoked), so the toolbar
  never changes width when a generating row becomes a draft.
- Accepted consequences of the full width: the action group (`ml-auto`, `editor.tsx:464`) sits at the far right, away
  from Back and the brand name; the Opens table (`w-full`, `editor.tsx:537`) and the generating, failed and unreadable
  cards (`cardCls`, `components/aeo-outbound/ui.ts:2`) stretch to the full width. Checked in the browser (§8).
- With no `:has()` support the wrapper keeps `max-w-7xl` and `pb-8` while the frame assumes `pb-4`, so the page scrolls
  16px. Accepted: every browser the team uses supports `:has()`.

### 4.2 Height
- The frame and its loading box fill the screen under the toolbar, with a 16px gap above (the toolbar's existing
  `mb-4`) and a 16px gap below (the wrapper's bottom padding on the editor page, `pb-4` instead of `pb-8`). Both get
  one constant inline style: `height: calc(100vh - var(--aeo-toolbar-h, 108px) - 32px)` and `min-height: 320px`.
  `100vh` matches the shell, which is `h-screen` (`app/tools/layout.tsx:18`).
- `--aeo-toolbar-h` is T, the sticky toolbar's border-box height (padding and border included), rounded up to a whole
  pixel and written as `<n>px`. It is read with `getBoundingClientRect().height` of the toolbar element
  (`editor.tsx:448`), never `contentRect` (which leaves out `py-3` and the border, about 25px short).
- How T is kept: a layout effect, only when `typeof ResizeObserver !== 'undefined'`, measures the toolbar once and then
  on every `ResizeObserver` callback, and writes the variable straight onto the editor's root element with
  `style.setProperty`. No React state, so no extra render, and the write lands in the same frame as the resize (a
  `ResizeObserver` callback runs after layout and before paint), so the frame never lags the toolbar. The observer is
  disconnected on unmount. The root element has no `style` prop, so React never overwrites the variable; this must stay
  true (a comment says so).
- Fallback: with no measurement (server render, no `ResizeObserver`), `var()` falls back to 108px, giving
  `calc(100vh - 140px)`, exactly today's height. The first server-rendered paint shows the loading box (the frame never
  renders on the server, `html` starts `null`, `editor.tsx:131`) at that fallback, a 57px strip below with `pb-4`; the
  layout effect corrects it at hydration, before the frame exists.
- Nothing else ever sits between the toolbar and the frame: the view error line and the frame never show together
  (`editor.tsx:164-165,176-177,516-517`), and the status cards render only when the report does not (`showsReport`,
  `editor.tsx:152`).
- The 320px floor keeps the frame usable when a very short window or a heavily wrapped toolbar would leave almost
  nothing; the page then scrolls under the sticky toolbar, as it does today.
- Accepted changes in motion: the frame now resizes when the toolbar does. Edit/Done toggles the banner line
  (`editor.tsx:495`) and a locked message shows for 3s (`:496`, `:288-292`), so the frame shrinks and grows by one line
  each time and the report's Plotly charts (`responsive: true`, `lib/aeo-outbound/charts.ts:18`) relayout. While a rerun
  runs, the progress checklist replaces the action bar inside the toolbar (`editor.tsx:463`,
  `components/aeo-outbound/progress-checklist.tsx:17-36`), so the frame is shorter for the rerun instead of the page
  scrolling. All checked in the browser (§8).
- Draft at any size: toolbar + 16 + frame + 16 = the screen, so the page does not scroll and nothing is black below.
- Live or revoked: the Opens list (`editor.tsx:533`, `mt-4`) is below the frame, as today. The toolbar stays sticky
  across it, as today.

### 4.3 Unchanged, deliberately
- The Before you send panel (`components/aeo-outbound/before-you-send.tsx:57`, `absolute right-0 top-0 max-h-full w-96`)
  and its Show button (`editor.tsx:527`): same position and width. The wider frame gives the report more room beside it;
  the panel can now be taller because `max-h-full` follows the taller frame.
- The frame's sandbox, `srcDoc`, `key` per load, messages, save queue, scroll restore: untouched. A resize of the frame
  never reloads it.
- The dashboard and portal shells: untouched. Printing the editor is out of scope (the report is printed from its own
  page, Open full size); the print rules (`app/globals.css:288-305`) are untouched.

## 5. Out of scope (filed or noted, not changed here)
- Phone width: the staff sidebar on tools pages (`TeamSidebar`, `components/layout/sidebar.tsx:77-88`) is always 256px or
  56px wide with no breakpoint (`:935`),
  which leaves about 120px for any tools page on a 375px phone. That is the whole app's shell, not this editor. Noted for
  a separate issue.
- The Before you send panel covering the report's right edge (it can be minimized). A layout change of its own.

## 6. Edge cases

| Case | Expected |
|---|---|
| 1920×1080, sidebar expanded | frame 1600 wide, 16px from the toolbar, 16px from the bottom; no page scroll |
| 1920×1080, sidebar collapsed (56px) | frame = 1920 − 56 − 64 = 1800 wide |
| 1440×900, sidebar expanded | frame 1440 − 256 − 64 = 1120 wide (today 1120 too: the cap did not bite); bottom strip gone |
| 1440×900, sidebar collapsed | frame 1440 − 56 − 64 = 1320 wide (today 1216) |
| Edit mode (banner shows) | T grows by the banner line; the frame shrinks by the same; no scroll |
| Locked message for 3s | same as the banner, then back |
| Rerun running | the checklist replaces the action bar; T grows with it and the frame is shorter until it ends |
| Narrow window, toolbar wraps | T follows; floor 320px |
| Window resized | frame follows (100vh in CSS; T by the observer) |
| Live report with opens | frame fills the screen; Opens below; toolbar stays sticky while scrolling |
| Generating / failed / unreadable | no frame; the card is full width |
| Hub, Settings, other tools pages; NoAccess, SnapshotNotFound | 1280px cap, unchanged |
| No `ResizeObserver` (jsdom) | variable never set: today's 140px height |
| No `:has()` support | today's width; frame assumes `pb-4`, so a 16px scroll (accepted, §4.1) |

## 7. Tests (written first)
All in Vitest + jsdom. jsdom keeps both `calc(100vh - var(--aeo-toolbar-h, 108px) - 32px)` and a custom property set
with `style.setProperty` intact (probed against the installed jsdom 25.0.1, 2026-10-14).
1. `toolbarHeightVar(h)` (pure, `components/aeo-outbound/frame-height.ts`, with `FRAME_HEIGHT` and `FRAME_MIN_HEIGHT`):
   `51` → `51px`; `50.4` → `51px`; `0` → `0px`.
2. Editor: the root element carries `data-aeo-editor` in draft, live, revoked, generating, failed and unreadable.
3. Editor: the frame and the loading box have `style.height` = `calc(100vh - var(--aeo-toolbar-h, 108px) - 32px)` and
   `style.minHeight` = `320px`.
4. Editor: with `ResizeObserver` stubbed (the pattern in `components/charts/line-chart.test.tsx:354-358`) and the
   toolbar's `getBoundingClientRect().height` stubbed to 51, the root's `--aeo-toolbar-h` is `51px` after mount; after the
   height becomes 75 and the observer callback fires, it is `75px`; on unmount the observer is disconnected.
5. Editor: without `ResizeObserver`, the root has no `--aeo-toolbar-h` (so the fallback gives today's 140px).
6. Editor page (`app/tools/new-business/[reportId]/page.test.tsx`): `NoAccess` and `SnapshotNotFound` render no
   `[data-aeo-editor]`.
7. Tools layout (`app/tools/layout.test.tsx`, added to the `include` list in `vitest.config.ts:76-91`, which today only
   covers `app/tools/new-business/**`): with `@/auth` resolving a staff session and `Sidebar` mocked, the content wrapper
   keeps `mx-auto max-w-7xl px-8 py-8` and carries `has-[[data-aeo-editor]]:max-w-none` and
   `has-[[data-aeo-editor]]:pb-4`.
8. Every existing editor, hub, settings and page test passes unchanged.

## 8. Verification beyond tests
- `make check` (typecheck, test, check:rsc, build). The production build's CSS (`.next`, after `npm run build`; the dev
  server's CSS is not optimized and spells the rule differently) contains `:has([data-aeo-editor])` with `max-width:none`
  and the bottom padding.
- In a browser on the branch, dev database (guarded runner), measured with the same script as §1: a draft and a live
  report at 1920×1080, 1440×900 and 1280×800, sidebar expanded and collapsed, panel open and minimized; Edit/Done
  toggled (no scrollbar flash, charts settle); a locked message; browser zoom 110% and 125% (`main` must not scroll on a
  draft); the hub and Settings still 1280 wide. A screenshot of the draft at 1920×1080, before and after.
