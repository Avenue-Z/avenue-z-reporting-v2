# Per-Client Report Sections — Template + Override + Lock

**Date:** 2026-06-30
**Status:** Design approved (concept, data model, lock semantics). Ready for implementation planning.
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
  `{ id, defaultLabel, render(ctx) }`, where `ctx` is a shared per-render context (see
  "Shared context" below). AEO decomposes into parts such as: `overview-synopsis`,
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
export type SectionSnapshot = {
  order: string[]                     // materialized resolved part-id order at lock time
  labels?: Record<string, string>
  thresholds?: Record<string, number>
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

A **pure function**, independent of React:

```ts
// lib/report-sections/resolve.ts (new)
resolveSection(
  sectionSlug: string,
  template: SectionTemplate,          // { order: string[], labels: Record<string,string> }
  override: SectionOverride | undefined,
): ResolvedPart[]                     // ordered [{ id, label, thresholds? }]
```

Rules:

- **No override / unlocked:**
  1. Start from `template.order`.
  2. Remove ids in `override.hidden`.
  3. Append ids in `override.extraParts` (deduped; unknown-to-registry ids dropped at render).
  4. Apply `override.order` (partial order: listed ids first in given order, remainder
     keep template-relative order).
  5. Apply `override.labels` / `override.thresholds` on top of template defaults.
  - Template improvements (new part ids added to `template.order`) flow in automatically.
- **Locked:** ignore `template.order`; start from `override.frozen.order` (the snapshot
  taken at lock time), then apply the same `hidden` / `order` / `labels` / `thresholds` /
  `extraParts` rules on top. New template parts do **not** appear.

### Lock / unlock

- **Lock action:** compute the current resolved order (as if unlocked), write it into
  `override.frozen`, set `locked: true`. Persist via the section-config server action.
- **Unlock action:** clear `override.frozen`, set `locked: false`. Section returns to
  live template inheritance (retaining any `hidden`/`order`/`labels` diffs).
- **Granularity:** per client, per section. Renaissance's `peec-ai` can be locked while
  Renaissance's `ga4` keeps inheriting.

The resolver has no I/O and no React — unit-tested directly (see Testing).

---

## Section refactor pattern (AEO first)

Refactor `components/report-sections/peec-ai/index.tsx` so `ProviderSection`'s hardcoded
`space-y-8` JSX sequence (lines ~216–300) becomes registry-driven:

1. **Build `ctx` once** — same computations as today (`data`, derived KPIs, winners/losers,
   citation math, `modelActive`, etc.), packaged into a typed `PeecCtx`.
2. **Define the part registry** — one entry per existing sub-block:
   ```ts
   const PEEC_PARTS: Record<string, Part<PeecCtx>> = {
     'overview-synopsis': { id, defaultLabel: '…', render: (ctx) => <Suspense>…</Suspense> },
     'kpi-cards':         { id, defaultLabel: 'Snapshot KPIs', render: (ctx) => …the KPI grid… },
     'visibility-chart':  { … },
     'llm-breakdown':     { … },
     'winners-losers':    { … },
     'brand-rankings':    { … },
     'top-domains':       { … },   // note: currently shares a grid row with domain-types
     'domain-types':      { … },
     'footer':            { … },
   }
   ```
3. **Define the template** — the default ordered id list = today's exact order, so output
   is byte-for-byte identical when no override exists.
4. **Render** — `resolveSection('peec-ai', template, override).map(p => PEEC_PARTS[p.id]?.render(ctx, p))`,
   passing the resolved `label` where a part currently hardcodes a title.

**Layout caveat:** `top-domains` and `domain-types` currently live in a shared
`grid lg:grid-cols-[1fr_280px]` row. Options: (a) treat that grid as one part
(`domains-row`) for v1 — simplest, preserves layout; or (b) make each a part and have the
renderer group adjacent grid-paired parts. **Decision: v1 uses a single `domains-row`
part** to avoid layout regressions; splitting is a later refinement. Record this so the
part list stays honest about granularity.

### Bespoke parts

A one-off client component registers as a normal part under a client-scoped id and is
referenced only in that client's `extraParts`:

```ts
// components/report-sections/peec-ai/parts/bespoke/renaissance-custom-funnel.tsx
export const renaissanceCustomFunnel: Part<PeecCtx> = { id: 'renaissance-custom-funnel', … }
// registered into PEEC_PARTS; appears only because Renaissance's override lists it in extraParts
```

Unknown part ids (e.g. a bespoke id removed from code but still in a locked snapshot) are
**skipped gracefully** at render — never throw.

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
- Validation rejects: unknown section slugs, non-string part ids, malformed snapshot.

---

## Testing

**TDD, resolver first** (pure function, no React):

- inherit: no override → resolved order === template order.
- hidden: hidden id removed; others intact.
- reorder: partial `order` respected; unlisted parts keep template-relative order.
- relabel/threshold: overrides applied over template defaults.
- extraParts: appended; duplicates deduped.
- locked-freeze: after lock, a new id added to the template does **not** appear.
- unlock: returns to live inheritance, retaining other diffs.
- unknown-id safety: id not in registry is skipped, no throw.

**Parity test for AEO:** with no override, the refactored `ProviderSection` renders the
same parts in the same order as the pre-refactor component (snapshot/golden or
structural assertion). This guarantees the refactor is behavior-preserving for every
existing client.

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

## Open questions / risks

- **Snapshot staleness on lock:** a locked snapshot references part ids by string; if a
  part id is renamed in code, the snapshot silently drops it (graceful skip). Mitigate by
  treating part ids as stable identifiers (don't rename casually).
- **Label/threshold coverage:** only parts that actually read `label`/`thresholds` from the
  resolved part honor overrides. The AEO refactor must thread the resolved `label` into
  each part that currently hardcodes a title; parts with no configurable label ignore it.
