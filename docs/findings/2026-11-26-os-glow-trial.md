# Finding: where the Organic Social glow can live (scratch trial, 2026-11-26)

**Question:** can the artifact's glow show behind an Organic Social kit tab without touching `body`, covering content, or
printing?

**Tried** on the local app (dev database, `notes-test` Instagram, November = kit), by injecting markup and styles with a
script. No code changed.

**What blocks the obvious way:** the app shell wraps the page in `div.flex.h-screen.bg-black` (opaque) above `body`, and
nothing between the tab and `html` traps fixed positioning (no transform, filter, backdrop, contain or z-index; measured).
A fixed element at `z-index: -1` paints under that black div and never shows.

**Option A, an isolated tab wrapper with a fixed glow inside (works, rejected):** the glow shows bottom right, under the
cards and the sticky header. But `isolation: isolate` on the tab wrapper puts everything in the tab into one layer, so a
popover in the tab (a chart note card) could no longer rise above the sticky report header (`z-30`).

**Option B, the glow on `main` while a kit tab is on the page (works, chosen):** a rule
`main:has(<kit tab marker>) { background: <the artifact's two gradients>, #000; background-attachment: fixed }` paints
the same glow at the same place with no layering change. Measured: `main` gets the three layers with fixed attachment, and
the tab wrapper stays `isolation: auto`.
- The export page has no `main` (`app/export/[clientSlug]/[section]/page.tsx:70`), so it can't print.
- `main` exists in the dashboard and portal layouts (`app/dashboard/layout.tsx:25`, `app/portal/[clientSlug]/layout.tsx:37`).
- Precedent for switching `main` by what's inside it: `app/tools/layout.tsx:27` (`has-[[data-aeo-editor]]`).
- Open for the build: the rule must sit in the kit's CSS module and still count as a local selector for CSS Modules; the
  build proves it compiles.
