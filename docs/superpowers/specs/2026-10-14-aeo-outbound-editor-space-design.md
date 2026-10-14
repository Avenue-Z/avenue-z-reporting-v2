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
  never changes width when a generating row becomes a draft. The status cards (`cardCls`, `components/aeo-outbound/ui.ts:2`)
  are full-width blocks and stretch with it.

### 4.2 Height
- The frame and its loading box fill the screen under the toolbar, with a 16px gap above (the toolbar's existing
  `mb-4`) and a 16px gap below (the wrapper's bottom padding on the editor page, `pb-4` instead of `pb-8`):
  `height = max(320px, 100vh − T − 32px)`, where T is the toolbar's rendered height, rounded up to a whole pixel.
  `100vh` matches the shell, which is `h-screen` (`app/tools/layout.tsx:18`).
- T is measured from the toolbar element on mount and kept current with a `ResizeObserver`, so wrapping, the edit
  banner and the locked message are all accounted for. Nothing else ever sits between the toolbar and the frame: the
  view error line and the frame never show together (`editor.tsx:164-165,176-177,516-517`), and the status cards render
  only when the report does not (`showsReport`, `editor.tsx:152`).
- Before T is known (server render, the first client render) or where `ResizeObserver` does not exist, the height is
  today's `calc(100vh - 140px)`. The measurement runs in a layout effect, so in a browser the corrected height applies
  before the first paint of the client render.
- The 320px floor keeps the frame usable when a very short window or a heavily wrapped toolbar would leave almost
  nothing; the page then scrolls under the sticky toolbar, as it does today.
- Draft at any size: toolbar + 16 + frame + 16 = the screen, so the page does not scroll and nothing is black below.
- Live or revoked: the Opens list (`editor.tsx:533`, `mt-4`) is below the frame, as today. The toolbar stays sticky
  across it, as today.

### 4.3 Unchanged, deliberately
- The Before you send panel (`components/aeo-outbound/before-you-send.tsx:57`, `absolute right-0 top-0 max-h-full w-96`)
  and its Show button (`editor.tsx:527`): same position and width. The wider frame gives the report more room beside it;
  the panel can now be taller because `max-h-full` follows the taller frame.
- The frame's sandbox, `srcDoc`, `key` per load, messages, save queue, scroll restore: untouched. A resize of the frame
  never reloads it.
- Print (`app/globals.css:288`, which already forces full width), the dashboard and portal shells: untouched.

## 5. Out of scope (filed or noted, not changed here)
- Phone width: the staff sidebar is always 256px or 56px wide with no breakpoint (`components/layout/sidebar.tsx:173-174`),
  which leaves about 120px for any tools page on a 375px phone. That is the whole app's shell, not this editor. Noted for
  a separate issue.
- The Before you send panel covering the report's right edge (it can be minimized). A layout change of its own.

## 6. Edge cases

| Case | Expected |
|---|---|
| 1920×1080, sidebar expanded | frame 1600 wide, 16px from the toolbar, 16px from the bottom; no page scroll |
| 1920×1080, sidebar collapsed (56px) | frame = 1920 − 56 − 64 = 1800 wide |
| 1440×900 laptop | frame 1440 − 256 − 64 = 1120 wide (today 1120 too: the cap did not bite); bottom strip gone |
| Edit mode (banner shows) | T grows by the banner line; the frame shrinks by the same; no scroll |
| Locked message for 3s | same as the banner, then back |
| Rerun running | the checklist replaces the action bar; T follows whatever renders |
| Narrow window, toolbar wraps | T follows; floor 320px |
| Window resized | frame follows (100vh in CSS; T by the observer) |
| Live report with opens | frame fills the screen; Opens below; toolbar stays sticky while scrolling |
| Generating / failed / unreadable | no frame; the card is full width |
| Hub, Settings, other tools pages | 1280px cap, unchanged |
| No `ResizeObserver` (jsdom) | today's 140px rule |
| No `:has()` support | today's width; height fix still applies |

## 7. Tests (written first)
1. `frameHeight(T)` (pure): `null` → `calc(100vh - 140px)`; `51` → `max(320px, calc(100vh - 83px))`; `50.4` → rounds up
   to 51 → `calc(100vh - 83px)`.
2. Editor: the root element carries `data-aeo-editor` in draft, live, generating and failed.
3. Editor: with a stubbed `ResizeObserver` and a toolbar height of 51, the frame's and the loading box's `style.height`
   are `max(320px, calc(100vh - 83px))`; when the observer reports 75 (banner), it becomes `calc(100vh - 107px)`.
4. Editor: without `ResizeObserver`, the frame's height is `calc(100vh - 140px)` (today's).
5. Tools layout: the content wrapper keeps `max-w-7xl` and carries `has-[[data-aeo-editor]]:max-w-none` and
   `has-[[data-aeo-editor]]:pb-4`.
6. Every existing editor, hub, settings and page test passes unchanged.

## 8. Verification beyond tests
- `make check` (typecheck, test, check:rsc, build). The built CSS contains the `:has([data-aeo-editor])` rules.
- In a browser on the branch, dev database (guarded runner), measured with the same script as §1: a draft and a live
  report at 1920×1080, 1440×900 and 1280×800, sidebar expanded and collapsed, panel open and minimized, edit mode on;
  the hub and Settings still 1280 wide. A screenshot of the draft at 1920×1080, before and after.
