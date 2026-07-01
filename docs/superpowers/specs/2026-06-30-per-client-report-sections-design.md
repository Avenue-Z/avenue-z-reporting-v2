# Per-Client Report Sections — Versioned Parts, Promotable Template, Per-Client Freeze

**Date:** 2026-06-30 (revised 2026-07-01)
**Status:** Design approved (versioned/promotable model, DB-backed template, true visual
freeze). Ready for implementation planning.
**Author:** Paul Ramirez (with Claude Code)

---

## Problem

Report sections (`components/report-sections/*` — AEO/peec-ai, GA4, demand-overview, etc.)
are **shared, hardcoded React components**. A section's composition — which sub-charts
appear, in what order, their copy and thresholds — is baked into each section's
`index.tsx` and is identical for every client. The only things that vary per client
today are (1) the underlying data (each client's own accounts) and (2) whether a whole
section is on/off via `enabledReports` / `hiddenReports`.

There is **no way to customize the contents of a section for one client without changing
the shared code and thereby affecting every client.** Editing the AEO component to try a
new chart for one client would change it for all clients simultaneously.

> Distinct from the **configurable dashboard** (`dashboardConfig` JSONB per client), which
> is already per-client isolated. That system is out of scope here.

## Goal — a staged release pipeline for report sections

Turn coded sections into a **promotion pipeline** with per-client control:

1. **Guinea-pig first.** Iterate a change on **one** client before anyone else sees it.
2. **Promote.** Once proven, **roll the change into the template**, which then flows to
   other clients.
3. **True visual freeze.** A frozen client does **not** change — including *how each part
   looks* — until explicitly unfrozen. Not just composition: appearance.
4. **Persistent per-client modifications** at both the **part** level and the
   **whole-report** level, which survive template promotions.

Three concrete customization needs this must serve (from earlier scoping): show/hide
sub-parts per client; reorder/relabel per client; and genuinely bespoke code for one
client.

Explicitly **not** in scope: rebuilding sections as generic drag-and-drop blocks. Sections
stay coded; we add a versioning + config layer on top.

---

## Core idea: versioned, immutable parts

**A part is versioned.** A part **id + version** maps to a specific component
implementation. `visibility-chart@1` and `visibility-chart@2` are different code, and
**all live versions coexist in the codebase.**

**Published versions are immutable.** Once a version is referenced by the template or by
any frozen client snapshot ("published"), its code is **never edited** — changes go to a
new version (`v+1`). This immutability is *what makes freeze real*: a client pinned to
`visibility-chart@1` renders byte-identical output forever, because that code never
changes.

**Authoring a new version is the one irreducible code + deploy step.** Everything else —
which version is published, which client is pinned/frozen, promotion — is data.

```ts
// PartPin: a part at a specific version, in a composition
type PartPin = { id: string; version: number }
```

### Why versioning (vs. the two rejected models)

- **Config-only overrides (no versioning)** — rejected: cannot freeze *appearance*.
  Editing a shared part's code changes it for every client at once; there is no way for
  client X to be on the new chart and Y on the old.
- **Immutable-parts-by-convention (new id per change, no version field)** — rejected:
  works, but causes part-id proliferation and clumsy "new id" ceremony for every visual
  tweak; versioning is the same discipline made first-class and ergonomic.

---

## Architecture: three layers

1. **Part implementation registry (code).** Per section, `id → version → impl`. Immutable
   published versions coexist. Bespoke parts live in a *separate* registry (below).
2. **Template (DB data).** Per section, the current **published** composition: an ordered
   list of `PartPin`s + default labels/thresholds. Promotion mutates this. One row per
   section in a new `section_templates` table.
3. **Per-client config (DB data).** The existing `clients` row gains a
   `reportSectionConfig` JSONB column holding, per section: version pins, hide/order/
   relabel/threshold overrides, bespoke part refs, and the freeze snapshot.

**Why the template is DB data, not a code constant:** "roll into the template" is a
user *operation*, and freeze/pin/promote are all data operations on client rows — a DB
template makes promotion symmetric with them and lets a future UI promote without a
deploy. Authoring a new part *version* still needs a deploy (it's code); flipping which
version is published does not. Templates are **seeded** from the code defaults (all
current AEO parts at `v1`) on first migration.

---

## Data model

### New table — `section_templates`

```ts
// lib/db/schema.ts
export const sectionTemplates = pgTable('section_templates', {
  sectionSlug: text('section_slug').primaryKey(),   // 'peec-ai', 'ga4', …
  composition: jsonb('composition').$type<SectionTemplate>().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
```

### New column — `clients.reportSectionConfig`

```ts
// lib/db/schema.ts — add to the clients table (nullable)
reportSectionConfig: jsonb('report_section_config').$type<ReportSectionConfig>(),
```

### Types

```ts
// lib/report-sections/types.ts (new)
export type PartPin = { id: string; version: number }

// The published default composition for a section (one section_templates row)
export type SectionTemplate = {
  order: PartPin[]                     // ordered parts, each pinned to a version
  labels: Record<string, string>      // partId -> default label
  thresholds: Record<string, number>  // partId -> default threshold
}

// Captured at freeze time — the fully-resolved composition, READ as the base while frozen
export type SectionSnapshot = {
  order: PartPin[]                     // resolved id+version order at freeze time
  labels: Record<string, string>      // resolved labels at freeze time
  thresholds: Record<string, number>  // resolved thresholds at freeze time
}

export type SectionOverride = {
  frozen?: SectionSnapshot            // presence == this section is frozen for this client
  versions?: Record<string, number>   // partId -> pinned version (overrides template's pin)
  order?: string[]                    // reorder by part id
  hidden?: string[]                   // hidden part ids
  extraParts?: PartPin[]              // bespoke/additional parts (id + version)
  labels?: Record<string, string>     // partId -> label override
  thresholds?: Record<string, number> // partId -> threshold override
}

export type ReportSectionConfig = {
  [sectionSlug: string]: SectionOverride
}
```

**Backward compatibility:** `reportSectionConfig` is nullable; a null value or an absent
section key means "render the current template as-is" — and the template is seeded to
exactly today's composition at `v1`. So **no existing client's report changes appearance**
on rollout. No per-client backfill needed.

---

## Resolution (the testable core)

A **pure function**, independent of React and I/O:

```ts
// lib/report-sections/resolve.ts (new)
resolveSection(
  template: SectionTemplate,
  override: SectionOverride | undefined,
): ResolvedPart[]                     // ordered [{ id, version, label, threshold? }]
```

### Base selection (this is where freeze lives)

- **Frozen** (`override.frozen` present): base = the **snapshot** (`order` with pinned
  versions, `labels`, `thresholds`). Template changes and new template versions are
  ignored entirely. Because the pinned versions are immutable code, appearance is frozen.
- **Not frozen:** base = the **template** (`order` with its published version pins), then
  apply `override.versions` to swap the pinned version for named parts (the guinea-pig
  mechanism). Parts not named in `override.versions` keep the template's published version.

### Ordering algorithm (explicit — operates on the id+version pins of the base)

Given the base's pinned `order` and an `override`:

1. **Working set** = `dedupeById([...basePins, ...(override.extraParts ?? [])])` minus
   `override.hidden`. Dedupe by `id` (first occurrence's version wins unless overridden by
   `override.versions`). An id in both `extraParts` and `hidden` ends up hidden.
2. **Version resolution** per surviving id: `override.versions?.[id] ?? basePinVersion`.
   (Frozen base is not subject to `override.versions` — its versions are fixed.)
3. **Priority pass** — walk `override.order`; emit each id present in the working set
   (first occurrence only). Ids in `override.order` not in the working set (hidden,
   unknown, absent) are **ignored**, not errors.
4. **Remainder** — append working-set ids not yet emitted, in base-relative order
   (template/snapshot ids before un-ordered extras; extras in `extraParts` order).
5. **Labels/thresholds** per emitted id: `override.x?.[id] ?? base.x[id] ?? part.defaultX`.
   Overrides layer identically in frozen and non-frozen modes.

Render-time safety net: an emitted `{id, version}` absent from the (core + bespoke)
registry is **skipped**, never thrown. Write-time validation prevents this for new refs.

---

## Operations (server actions)

All permission-gated (reuse `canEditDashboard` / existing role checks), all validate via
`parseReportSectionConfig` / `parseSectionTemplate`, all bust cache (see Cache note).

- **`pinVersion(slug, section, partId, version)`** — set `override.versions[partId]`. The
  guinea-pig step: point one client at a new version while the template stays put.
- **`freezeSection(slug, section)`** — run the resolver in non-frozen mode, materialize the
  fully-resolved `{ order (id+version), labels, thresholds }` into `override.frozen`.
- **`unfreezeSection(slug, section)`** — clear `override.frozen`. Returns to live template +
  `override.versions` inheritance, retaining other diffs.
- **`promoteToTemplate(section, fromSlug, partIds[])`** — for each `partId`, read the
  source client's *resolved* pin (id+version) and label/threshold and write them into the
  `section_templates` row's `order`/`labels`/`thresholds`. Non-frozen, non-overriding
  clients then render the promoted versions; frozen clients are untouched; clients with
  their own `versions`/`order`/`hidden` overrides keep them (overrides still layer on top).
- **`saveReportSectionConfig(slug, config)`** — general write for the other override fields
  (hide/order/relabel/extraParts). The future editing UI writes through here.

### The guinea-pig flow, end to end

1. Dev authors `visibility-chart@2` (code + deploy). Template still pins `@1`; nobody sees it.
2. `pinVersion('acme','peec-ai','visibility-chart',2)` → **only** Acme (guinea pig) renders `@2`.
3. Iterate. A version is editable until it is promoted or captured in any freeze snapshot;
   after that it is immutable and further work goes to `@3`.
4. Optionally `freezeSection` any client you want to hold back on `@1`.
5. `promoteToTemplate('peec-ai','acme',['visibility-chart'])` → template pins `@2`.
   Non-frozen clients now render `@2`; frozen clients stay `@1`; Acme's explicit pin is now
   redundant (equals template) and may be cleared.

---

## Section refactor pattern (AEO first)

Refactor `components/report-sections/peec-ai/index.tsx` so `ProviderSection`'s hardcoded
`space-y-8` JSX sequence (lines ~216–300) becomes registry-driven.

**Shared context constraint:** AEO's parts are **not** independent components. Today
`ProviderSection` computes a large shared context once — `data`, `provider`, `models`,
`aiTraffic`, `clientSlug`, `dateRange`, plus derived values (`modelActive`,
`winners`/`losers`, citation-share math, filtered LLM rows). Each part reads from this.
So a **part's `render` receives that shared `ctx`**, not standalone props. Each section
defines its own `Ctx` type.

1. **Build `ctx` once** — identical computations to today, packaged into a typed `PeecCtx`.
2. **Define the versioned core registry** — every current sub-block registered at `v1`:
   ```ts
   type PartImpl<Ctx> = {
     id: string
     version: number
     defaultLabel: string
     render: (ctx: Ctx, resolved: ResolvedPart) => React.ReactNode  // resolved.label/threshold
   }
   const PEEC_PARTS: Record<string, Record<number, PartImpl<PeecCtx>>> = {
     'overview-synopsis': { 1: {…} },
     'kpi-cards':         { 1: {…} },   // heading from resolved.label
     'visibility-chart':  { 1: {…} },
     'llm-breakdown':     { 1: {…} },
     'winners-losers':    { 1: {…} },
     'brand-rankings':    { 1: {…} },
     'domains-row':       { 1: {…} },   // the top-domains + domain-types grid pair (see caveat)
     'footer':            { 1: {…} },
   }
   ```
3. **Seed the template** — the `section_templates` row for `peec-ai` = today's exact order,
   all parts at `v1`, so output is byte-for-byte identical when no override exists.
4. **Render** — merge core + bespoke registries, then
   `resolveSection(template, override).map(r => registry[r.id]?.[r.version]?.render(ctx, r))`,
   threading `resolved.label` into parts that currently hardcode a title.

**Layout caveat (decision):** `top-domains` and `domain-types` currently share a
`grid lg:grid-cols-[1fr_280px]` row. **v1 treats that grid as a single `domains-row` part**
to avoid layout regressions; splitting into two parts is a later refinement.

### Bespoke parts (separate registry)

A one-off client component must **not** live in the core `PEEC_PARTS` map — that map is
imported by the shared section and ships to every client, so a broken bespoke part could
break the shared build and bloat everyone's bundle. Instead:

- Bespoke parts live under `components/report-sections/<section>/parts/bespoke/`, are also
  **versioned**, and are collected into a **separate `BESPOKE_PARTS` registry** kept out of
  the core section's import graph (enforced by a lint/dir convention).
- At render the section merges `{ ...CORE_PARTS, ...BESPOKE_PARTS }`. The core section
  builds and renders independently of any bespoke part.
- A bespoke part appears only because a client's `override.extraParts` lists its
  `{id, version}`.

**Ceiling (stated):** bespoke parts receive the shared `ctx` only. A bespoke part needing
data *outside* what the section fetches into `ctx` has **no path in v1** — it would require
extending the shared section's fetch. Out of scope.

---

## Immutability discipline & guard

- **Rule:** a part version that is referenced by any `section_templates` row or any client
  `frozen` snapshot is **published** and must not be edited or deleted; changes go to a new
  version.
- **Guard (CI/test):** a check that every `{id, version}` referenced by the template or any
  frozen snapshot exists in the registry. This catches an accidental deletion of a
  still-referenced version before it reaches production. (Editing in place can't be fully
  linted; it's a review-enforced convention plus the parity/golden tests for `v1`.)

## Validation

`parseReportSectionConfig` and `parseSectionTemplate` (mirroring `parseDashboardConfig`)
reject at **write time** (not just render-time skip): unknown section slugs; non-string
part ids; non-integer versions; malformed snapshot; and any `{id, version}` in `order` /
`versions` / `extraParts` / template `order` that is **unknown to that section's
(core + bespoke) registry**. Because v1 editing is DB-level with no UI, a typo'd id or a
bad version must fail loudly at write time — a silent render-time drop would surface as a
mysteriously missing chart. Render-time skip remains only as defense against a version
deleted from code while still referenced by a stored snapshot.

## Cache

`revalidateTag('db', 'max')` (as the dashboard actions already do) busts all cached client
data on any write. Acceptable at v1's near-zero write volume; if section-config/template
writes become frequent, revisit toward a narrower tag. **Conscious v1 choice**, noted so it
is not mistaken for an oversight.

---

## Rendering integration

- Both report pages (`app/dashboard/[clientSlug]/reports/page.tsx`,
  `app/portal/[clientSlug]/reports/page.tsx`) already fetch the client via
  `getClientBySlug`; `reportSectionConfig` rides along on that row. The section's
  `section_templates` row is fetched via a new cached query (`getSectionTemplate(section)`),
  `React.cache`-wrapped like the other DB helpers.
- Sections **not yet refactored** ignore both the column and the template table and keep
  working unchanged.
- No change to `enabledReports` / `hiddenReports` (whole-section on/off stays as-is); this
  feature operates *within* an enabled section.

## Editing (v1 vs later)

- **v1 — data-level editing.** Version pins, freezes, promotions, and overrides are applied
  by calling the server actions from a script / Drizzle Studio / SQL, the same way clients
  are onboarded today. No new UI.
- **Later (out of scope, purely additive).** An in-app editor (toggle parts, drag-reorder,
  freeze/unfreeze button, "promote to template" button, version picker) writing through the
  same server actions.

---

## Testing

**TDD, resolver first** (pure function, no React). Base cases:

- inherit: no override → resolved order+versions === template pins; template labels applied.
- version pin: `override.versions[id]=2` swaps that part's version; others keep template's.
- hidden / reorder / relabel / threshold: as configured, layered on the base.
- extraParts: appended after template ids in `extraParts` order; deduped by id.

**Combinatorial ordering cases** (the part most easily gotten subtly wrong):

- `order` references an `extraParts` id → placed at the specified position.
- `order` references a `hidden` id → ignored (not in working set).
- `order` references an id absent from template/extras/registry → ignored, no throw.
- id in **both** `extraParts` and `hidden` → hidden wins.
- id twice in `order` → emitted once (first occurrence).
- partial `order` → listed ids first (given order), remainder base-relative.

**Freeze / promote cases** (the pipeline's guarantees):

- freeze pins version: after `freezeSection`, a later `promoteToTemplate` to a new version
  does **not** change the frozen client's resolved output.
- promote: `promoteToTemplate` updates the template pins; a non-frozen, non-overriding
  client inherits the new version; a client with its own `versions`/`hidden`/`order`
  override keeps its override; a frozen client is unaffected.
- unfreeze: returns to live template + version-override inheritance, retaining other diffs.
- immutability guard: a `{id,version}` referenced by template/snapshot but missing from the
  registry fails the guard.

**Parity test for AEO:** with no override and the seeded `v1` template, the refactored
`ProviderSection` renders the same parts in the same order as the pre-refactor component.
Assert **structural equivalence including the `domains-row` grid wrapper**
(`grid lg:grid-cols-[1fr_280px]` with `top-domains` + `domain-types` inside) — the
regression-prone spot. Guarantees the refactor is behavior-preserving for every client.

**Server action tests:** permission gate; validation rejects unknown id/version and
malformed config; `pinVersion` / `freezeSection` / `unfreezeSection` / `promoteToTemplate`
each produce the expected DB state.

---

## Incremental rollout

1. **Framework** — types; versioned registry helper; `resolveSection`; `section_templates`
   table + migration + `getSectionTemplate` query; `parseReportSectionConfig` /
   `parseSectionTemplate`; server actions (`pinVersion`, `freezeSection`,
   `unfreezeSection`, `promoteToTemplate`, `saveReportSectionConfig`); immutability guard.
   Fully unit-tested. No section component touched yet.
2. **AEO (peec-ai)** — refactor to the versioned registry; seed its `section_templates` row
   at `v1`; parity test green. First section on the pipeline.
3. **Migrate other sections opportunistically** — GA4, demand-overview, etc., one at a
   time, each behind its own parity test and seeded template row. Un-migrated sections keep
   working unchanged.
4. **(Later, additive)** In-app editor UI.

**Scope for the first implementation plan:** steps 1 and 2 (framework + AEO), DB-level
editing only.

## Out of scope

- In-app editing/promotion UI (v1 is server-action + DB level).
- Migrating sections beyond AEO.
- Any change to the configurable dashboard (`dashboardConfig`) system.
- Section-level on/off (already handled by `enabledReports` / `hiddenReports`).
- Splitting the `domains-row` grid pair into independent parts.
- Bespoke parts fetching data outside the shared section `ctx`.
- Automatic garbage-collection of unreferenced part versions (manual for now).

## Known limitations / risks

- **Part ids and version numbers are a stable API.** Snapshots and overrides reference
  parts by `{id, version}`. Renaming an id or reusing/renumbering a version orphans or
  corrupts those references. Treat both as immutable identifiers; the guard catches missing
  refs but cannot retro-fix stored ones.
- **Version sprawl.** Every published visual change adds a coexisting version; old versions
  linger until every client migrates off them. v1 relies on manual cleanup once no template
  row or snapshot references a version (checkable via the guard's inverse).
- **Label/threshold coverage is per-part.** Only parts that read `resolved.label` /
  `resolved.threshold` honor overrides; the AEO refactor must thread `resolved.label` into
  parts that currently hardcode a title.
- **Editing a not-yet-published version in place** is allowed (a version only the guinea
  pig runs). The moment it is promoted or frozen it becomes immutable — this transition is
  a discipline/review point, not a hard lock.
