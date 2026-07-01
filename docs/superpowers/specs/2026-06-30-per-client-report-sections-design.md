# Per-Client Report Sections — Template + Override + Lock

**Date:** 2026-06-30
**Status:** Design approved (concept, data model, lock semantics); revised per spec review
(lock = composition-freeze, snapshot fields live, explicit ordering algorithm, bespoke
registry split). Ready for implementation planning.
**Author:** Paul Ramirez (with Claude Code)

---

## Problem

Report sections (`components/report-sections/*` — AEO/peec-ai, GA4, demand-overview, etc.)
are **shared, hardcoded React components**. A section's composition — which sub-charts
appear, in what order, their copy and thresholds — is baked into each section's
`index.tsx` and is identical for every client. The only things that vary per client
today are (1) the underlying data (each client's own accounts) and (2) whether a whole
section is on/off via `enabledReports` / `hiddenReports`.

There is **no way to customize the contents of a section for one client without
changing the shared code and thereby affecting every client**. Editing the AEO
component to tweak Avenue Z's AEO section would also change Renaissance's.

> Note: this is distinct from the **configurable dashboard** (`dashboardConfig` JSONB
> per client), which is already per-client isolated. That system is out of scope here.

## Goal

Make coded report sections customizable **per client**, from a **shared template**, such
that changes to client X never affect client Y. Concretely, three capabilities:

1. **Show/hide sub-parts** of a section per client (e.g. hide Winners/Losers for one client).
2. **Reorder / relabel** parts and override titles/thresholds per client.
3. **Genuinely bespoke code** — occasionally one client needs a one-off part no other
   client has.

Explicitly **not** in scope: rebuilding sections as generic drag-and-drop blocks
(the user declined "swap in configurable blocks"). Sections stay coded; we add a
customization layer on top.

## Chosen Approach — Template + per-client override layer, with per-section lock

Selected over two alternatives:

- **Fork-on-create (full copy, no inheritance)** — rejected: "based off the same
  template" would only hold at creation; template improvements never reach existing
  clients, so every client is hand-maintained forever. This is essentially today's
  seed-script approach and it doesn't scale.
- **Per-client code overrides only** — rejected: every tweak (even hide-one-chart or
  relabel) becomes bespoke code; per-client component sprawl and unmanageable template
  drift.

The chosen approach keeps the cheap changes (hide/reorder/relabel) as **config diffs**,
contains bespoke code to a single **registered part**, and keeps the shared template as
a living single source of truth.

---

## Concepts

- **Part** — a named, individually-addressable piece of a section. A part is
  `{ id, defaultLabel, render(ctx, resolvedPart) }`, where `ctx` is a shared per-render
  context (see "Shared context" below) and `resolvedPart` carries the resolved
  `label`/`threshold` for parts that use them.
  AEO decomposes into parts such as: `overview-synopsis`,
  `kpi-cards`, `visibility-chart`, `llm-breakdown`, `winners-losers`, `brand-rankings`,
  `top-domains`, `domain-types`, `footer`.
- **Part registry** — per section, a map `partId → Part`. Bespoke parts register here too,
  under client-scoped ids (e.g. `renaissance-custom-funnel`).
- **Template** — a section's default ordered part-id list + default labels, defined in
  code (versioned, single source of truth). Analogous to `NAV_SLUG_ORDER` but per-section.
- **Per-client override** — stored **diffs only** in a new DB column; absent = pure
  template inheritance.
- **Lock** — a per-client, per-section flag that freezes a section from future template
  updates until explicitly unlocked.

## Shared context (important structural constraint)

AEO's parts are **not independent components**. In `components/report-sections/peec-ai/index.tsx`,
`ProviderSection` (lines ~143–302) computes a large shared context once — `data`, `provider`,
`models`, `aiTraffic`, `clientSlug`, `dateRange`, plus derived values (`modelActive`,
`winners`/`losers`, citation-share math, filtered LLM rows) — and every sub-part reads from it.

Therefore a **part's `render` receives that shared `ctx`**, not standalone props. The
refactor extracts the JSX sequence into an ordered list of parts over a `ctx` object; it
does **not** try to make each part independently data-fetching. Each section defines its own
`ctx` type.

---

## Data model

New JSONB column on the `clients` table (`lib/db/schema.ts`):

```ts
// lib/report-sections/types.ts (new)
// Fully-resolved composition captured at lock time. All three fields are the
// merged (template + overrides) result AT lock time, and are READ as the base
// during locked resolution (see Resolution). They are not optional decoration.
export type SectionSnapshot = {
  order: string[]                     // resolved part-id order at lock time
  labels: Record<string, string>      // resolved labels at lock time
  thresholds: Record<string, number>  // resolved thresholds at lock time
}

export type SectionOverride = {
  locked?: boolean                    // freeze from template updates
  order?: string[]                    // reordered part ids (partial allowed)
  hidden?: string[]                   // hidden part ids
  labels?: Record<string, string>     // partId -> override label
  thresholds?: Record<string, number> // partId -> override threshold
  extraParts?: string[]               // bespoke/registered part ids to include
  frozen?: SectionSnapshot            // present only when locked
}

export type ReportSectionConfig = {
  [sectionSlug: string]: SectionOverride   // e.g. 'peec-ai', 'ga4'
}
```

```ts
// lib/db/schema.ts — add to clients table
reportSectionConfig: jsonb('report_section_config').$type<ReportSectionConfig>(),
```

**Backward compatibility:** the column is nullable. A null/absent value, or an absent
section key, means pure template inheritance — i.e. **identical to today's behavior**.
No existing client changes appearance until explicitly customized. No data backfill needed.

---

## Resolution (the testable core)

### What "lock" guarantees — and what it does NOT

**Lock freezes a section's _composition_, not its _appearance_.** A locked section is
frozen at a fixed **set of parts, their order, and their resolved labels/thresholds**.
It is **not** frozen against changes to the _implementation_ of those parts. If the code
for `visibility-chart` changes its rendering, copy, or math, a **locked client still gets
that change**, because the lock stores part _ids_ and config, not rendered output.

This is a deliberate choice, not an oversight:

- Implementation changes are overwhelmingly **correctness / data fixes** (e.g. the
  citation-share math, a delta-baseline fix) that you *want* to reach every client,
  including locked ones. Freezing those for a client would ship them known-wrong numbers.
- What clients actually escalate over is a report **gaining or losing a chart** or
  **reordering** unexpectedly — i.e. composition. That is exactly what lock freezes.

**Hard limitation (stated, not hidden):** there is **no true visual/pixel freeze** in this
design. That would require versioning each part's implementation (snapshotting rendered
output or pinning component versions) — a much larger effort, explicitly **out of scope**.
If a client ever contractually needs a frozen rendering, that is a separate future project.

A **pure function**, independent of React:

```ts
// lib/report-sections/resolve.ts (new)
resolveSection(
  template: SectionTemplate,          // { order: string[], labels, thresholds }
  override: SectionOverride | undefined,
): ResolvedPart[]                     // ordered [{ id, label, threshold? }]
```

### Base selection

Resolution is one algorithm with a single branch on **which base** it starts from:

- **Unlocked (or no override):** base = the **live template** (`order`, `labels`,
  `thresholds`). New template parts flow in automatically.
- **Locked:** base = the **frozen snapshot** (`override.frozen.order` / `.labels` /
  `.thresholds`). New template parts do **not** appear. The snapshot's label/threshold
  maps are read here — they are the base, not dead fields.

### Ordering algorithm (explicit)

Given `base.order` (from the selected base) and an `override`:

1. **Working set** = `dedupe([...base.order, ...(override.extraParts ?? [])])` minus
   `override.hidden`. (Extras are added; hidden removed. An id in both `extraParts` and
   `hidden` ends up hidden.)
2. **Priority pass** — walk `override.order` in sequence; for each id that is in the
   working set, emit it (first occurrence only). Ids in `override.order` that are **not**
   in the working set (hidden, unknown, or never present) are **ignored**, not errors.
3. **Remainder** — append working-set ids not yet emitted, in `base.order`-relative order
   (extras that had no `order` entry come after template ids, in `extraParts` order).
4. **Labels/thresholds** — for each emitted id, resolved value =
   `override.labels?.[id] ?? base.labels[id] ?? part.defaultLabel` (same shape for
   thresholds). Overrides layer on the base identically in both locked and unlocked modes.

Render-time safety net: an emitted id absent from the (core + bespoke) registry is
**skipped**, never thrown. Write-time validation (below) prevents this for typos.

### Lock / unlock

- **Lock action:** run the resolver in unlocked mode to get the current resolved
  composition, materialize it into `override.frozen` as
  `{ order, labels, thresholds }` (fully resolved), set `locked: true`. Persist via the
  server action.
- **Unlock action:** clear `override.frozen`, set `locked: false`. Section returns to live
  template inheritance, retaining any `hidden` / `order` / `labels` / `thresholds` diffs.
- Editing a **locked** section still works: `hidden` / `order` / `labels` overrides layer
  on the frozen base exactly as they do on the template base.
- **Granularity:** per client, per section. Renaissance's `peec-ai` can be locked while
  Renaissance's `ga4` keeps inheriting.

The resolver has no I/O and no React — unit-tested directly (see Testing).

---

## Section refactor pattern (AEO first)

Refactor `components/report-sections/peec-ai/index.tsx` so `ProviderSection`'s hardcoded
`space-y-8` JSX sequence (lines ~216–300) becomes registry-driven:

1. **Build `ctx` once** — same computations as today (`data`, derived KPIs, winners/losers,
   citation math, `modelActive`, etc.), packaged into a typed `PeecCtx`.
2. **Define the core part registry** — one entry per existing sub-block:
   ```ts
   type Part<Ctx> = {
     id: string
     defaultLabel: string
     render: (ctx: Ctx, resolved: ResolvedPart) => React.ReactNode  // resolved.label/threshold
   }
   const PEEC_PARTS: Record<string, Part<PeecCtx>> = {
     'overview-synopsis': { id, defaultLabel: '…', render: (ctx) => <Suspense>…</Suspense> },
     'kpi-cards':         { id, defaultLabel: 'Snapshot KPIs', render: (ctx, r) => …grid, r.label as heading… },
     'visibility-chart':  { … },
     'llm-breakdown':     { … },
     'winners-losers':    { … },
     'brand-rankings':    { … },
     'domains-row':       { … },   // the top-domains + domain-types grid pair (see caveat)
     'footer':            { … },
   }
   ```
3. **Define the template** — the default ordered id list = today's exact order, so output
   is byte-for-byte identical when no override exists.
4. **Render** — merge the core registry with the bespoke registry (below), then
   `resolveSection(template, override).map(r => registry[r.id]?.render(ctx, r))`, threading
   the resolved `label` into parts that currently hardcode a title.

**Layout caveat (decision):** `top-domains` and `domain-types` currently live in a shared
`grid lg:grid-cols-[1fr_280px]` row. **v1 treats that grid as a single `domains-row`
part** to avoid layout regressions; splitting into two independent parts is a later
refinement. The part list stays honest about this granularity.

### Bespoke parts

A one-off client component must **not** live in the core `PEEC_PARTS` map — that map is
imported by the shared section and ships to every client, so a broken bespoke part could
break the shared build and one client's code would bloat everyone's bundle. Instead:

- Bespoke parts live under `components/report-sections/<section>/parts/bespoke/` and are
  collected into a **separate `BESPOKE_PARTS` registry** keyed by part id.
- At render, the section merges `{ ...CORE_PARTS, ...BESPOKE_PARTS }`. The core registry's
  import graph does **not** reference bespoke files (enforced by a lint/dir convention), so
  the core section can build and render independently of any bespoke part.
- A bespoke part appears only because a client's `override.extraParts` lists its id.

```ts
// components/report-sections/peec-ai/parts/bespoke/renaissance-custom-funnel.tsx
export const renaissanceCustomFunnel: Part<PeecCtx> = { id: 'renaissance-custom-funnel', … }
// collected into BESPOKE_PARTS; merged at render only.
```

**Ceiling (stated):** bespoke parts receive the shared `PeecCtx` only. A bespoke part that
needs data *outside* what the section already fetches into `ctx` has **no path in v1** —
it would require extending the section's fetch/ctx, which is a code change to the shared
section. Genuinely independent data-fetching per bespoke part is out of scope.

Unknown part ids (e.g. a bespoke id removed from code but still in a locked snapshot) are
**skipped gracefully** at render — never throw. Write-time validation catches typos up front.

---

## Rendering integration

- Both report pages (`app/dashboard/[clientSlug]/reports/page.tsx` and
  `app/portal/[clientSlug]/reports/page.tsx`) already fetch the client via
  `getClientBySlug`. The new `reportSectionConfig` rides along on that row — no new query.
- The section component reads `client.reportSectionConfig?.['peec-ai']` and resolves.
  Sections **not yet refactored** ignore the column entirely and keep working unchanged.
- No change to `enabledReports` / `hiddenReports` (whole-section on/off stays as-is);
  this feature operates *within* an enabled section.

## Editing (v1 vs later)

- **v1 — data-level editing.** Overrides are edited via the DB (Drizzle Studio / Neon SQL),
  the same way clients are onboarded today. No new UI. This keeps scope contained and gets
  the capability shipped.
- **Later (out of scope).** An in-app editor (toggle parts, drag to reorder, lock/unlock
  button) writing through a `saveReportSectionConfig` server action. The server action and
  validation are built in v1 anyway (below), so the UI is purely additive.

## Server action + validation

- `saveReportSectionConfig(slug, config)` in `app/actions/` — permission-gated
  (reuse `canEditDashboard` / the existing role checks), validates via a
  `parseReportSectionConfig` (mirroring `parseDashboardConfig`), writes the column, and
  busts cache (`revalidateTag('db', 'max')`).
- `lockSection(slug, sectionSlug)` / `unlockSection(slug, sectionSlug)` thin wrappers that
  compute/clear the snapshot and call the save action.
- **Validation rejects at write time** (not just render-time skip): unknown section slugs;
  non-string part ids; malformed snapshot; and **part ids unknown to that section's
  (core + bespoke) registry** in `order` / `hidden` / `extraParts`. Because v1 editing is
  DB-level with no UI, a typo'd id must fail loudly at write time — a silent render-time
  drop would surface as a mysteriously missing chart someone has to debug. Bespoke ids are
  recognized because they are present in `BESPOKE_PARTS`; an id matching no registry entry
  is rejected. (The render-time skip remains only as a defense against a part later deleted
  from code while still referenced in a stored snapshot.)
- **Cache granularity (conscious v1 choice):** `revalidateTag('db', 'max')` busts all
  cached client data, not just this client/section. That is acceptable at v1's near-zero
  write volume; if section-config writes become frequent, revisit toward a narrower tag.

---

## Testing

**TDD, resolver first** (pure function, no React). Base cases:

- inherit: no override → resolved order === template order, template labels applied.
- hidden: hidden id removed; others intact.
- reorder: partial `order` respected; unlisted parts keep template-relative order.
- relabel/threshold: overrides applied over base defaults.
- extraParts: appended after template ids in `extraParts` order; duplicates deduped.
- locked-freeze: after lock, a new id added to the template does **not** appear.
- unlock: returns to live inheritance, retaining other diffs.

**Combinatorial ordering cases** (the part most easily gotten subtly wrong):

- `order` references an `extraParts` id → that extra is placed at the specified position.
- `order` references a `hidden` id → ignored (the id is not in the working set).
- `order` references an id absent from template, extras, and registry → ignored, no throw.
- id present in **both** `extraParts` and `hidden` → hidden wins (absent from output).
- id appearing twice in `order` → emitted once (first occurrence).
- `order` lists only some working-set ids → listed ones first (in given order), remainder
  in base-relative order (template ids before un-ordered extras).
- locked + override edits: `hidden`/`order`/`labels` layer on the **frozen** base, and a
  new template part still does not appear.

**Parity test for AEO:** with no override, the refactored `ProviderSection` renders the
same parts in the same order as the pre-refactor component. Assert **structural
equivalence including the `domains-row` grid wrapper** (`grid lg:grid-cols-[1fr_280px]`
with `top-domains` + `domain-types` inside) — that shared grid is the regression-prone
spot. Snapshot/golden or explicit structural assertion. This guarantees the refactor is
behavior-preserving for every existing client.

**Server action tests:** permission gate; validation rejects malformed config;
lock writes a snapshot; unlock clears it.

---

## Incremental rollout

1. **Framework** — types, `resolveSection`, registry helper, validation, server action +
   lock/unlock. Fully unit-tested. No section touched yet.
2. **AEO (peec-ai)** — refactor to registry-driven; parity test green. First section with
   the capability.
3. **Migrate other sections opportunistically** — GA4, demand-overview, etc., one at a
   time, each behind its own parity test. Un-migrated sections keep working unchanged.
4. **(Later, additive)** In-app editor UI.

**Scope for the first implementation plan:** steps 1 and 2 only (framework + AEO).

## Out of scope

- In-app editing UI (v1 is DB-level).
- Migrating sections beyond AEO.
- Any change to the configurable dashboard (`dashboardConfig`) system.
- Section-level on/off (already handled by `enabledReports`/`hiddenReports`).
- Splitting the `domains-row` grid pair into independent parts.

## Known limitations / risks

- **Lock freezes composition, not appearance** — see the callout under Resolution. This is
  the single most important expectations point: a locked client still receives changes to a
  part's *implementation* (copy/math/rendering). No pixel-freeze in this design. Stated
  loudly so it is never discovered by a surprised client.
- **Part ids are stable identifiers.** A locked snapshot and stored overrides reference
  parts by string id. Renaming a part id in code orphans those references (graceful skip at
  render; write-time validation blocks *new* bad ids but cannot retro-fix stored ones).
  Treat part ids as an API — don't rename casually; if you must, migrate stored configs.
- **Label/threshold coverage is per-part.** Only parts that actually read
  `resolved.label`/`resolved.threshold` honor overrides. The AEO refactor must thread the
  resolved `label` into each part that currently hardcodes a title; parts with no
  configurable label simply ignore it.
- **Bespoke data ceiling** — bespoke parts see only the shared `ctx` (see Bespoke parts).
