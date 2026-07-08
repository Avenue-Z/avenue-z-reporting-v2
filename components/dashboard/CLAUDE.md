# CLAUDE.md — `components/dashboard/` (configurable dashboard UI)

This is the rendering + editing surface for the configurable dashboard. The
architecture, data model, and resolution/caching rules live with the engine:
**read [lib/dashboard/ENGINEERS.md](../../lib/dashboard/ENGINEERS.md) and
[lib/dashboard/CLAUDE.md](../../lib/dashboard/CLAUDE.md) before changing anything here.**

Orientation:

- **[render-block.tsx](./render-block.tsx) `renderBlockNode`** is the single per-kind
  dispatcher, shared by the authed page and the public `/share` view. Read-only mode
  is just `canEdit=false` — same tree, edit chrome hidden.
- **KPI tiles stream progressively** — value and delta each resolve behind their own
  `<Suspense>`. Don't collapse them into one await.
- **[add-block/](./add-block/)** holds the manual builders (one per kind) + live
  discovery-fed pickers. **[config-mutations.ts](./config-mutations.ts)** and
  **[optimistic-blocks.ts](./optimistic-blocks.ts)** build the next config; saving
  always funnels through `saveDashboardConfig` (auth + `parseDashboardConfig` gate).
- **Never trust the client** — hiding an edit control is not authorization; the
  server action re-checks `canEditDashboard`.
