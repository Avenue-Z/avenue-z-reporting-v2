# Shared Report Parts — Commentary as a Per-Client Part — Design

**Date:** 2026-07-07
**Status:** Approved (design); pending implementation plan
**Branch:** `feat/report-commentary` (stacked — the commentary feature evolves from
page-level to part-based before it merges)
**Related:** builds on the commentary feature (`2026-07-06-report-commentary-design.md`)
and the per-client report-sections system (`2026-06-30-per-client-report-sections-design.md`).

## Summary

Establish **shared parts** — parts any report section can render, controlled
per-client through the *existing* `reportSectionConfig` override system — and make
**commentary the first shared part**. Each in-scope report section renders a
`SharedPartsHeader` at the top; a client sees commentary on a view only where its
`reportSectionConfig` opts in via a new `sharedParts` field (keyed by view). This makes commentary a per-client
add/remove/version-able part (renaissance-only to start) and gives the platform a
generalizable mechanism: any future cross-cutting block becomes a shared part with
no schema change.

The commentary feature's data layer and rendering (`report_commentary` table,
`lib/commentary/*`, the server actions, `CommentarySection`, panel, editor) are
**reused unchanged** — only *where commentary is invoked from* moves: from
page-level route wiring to a shared part.

## Goals

- Commentary is a **per-client-controllable part** on all 7 in-scope views, governed
  by `reportSectionConfig` (renaissance opts in; other clients see nothing).
- A **generalizable shared-parts mechanism**: future cross-cutting blocks are added
  the same way, no schema change, no per-client column sprawl.
- Reuse the commentary feature wholesale; change only its invocation point.
- No new DB migration and no new `section_templates` rows for the thin approach.

## Non-goals (this spec)

- **Full decomposition of section bodies into parts** ("deep" conversion). This spec
  is the **thin** approach: each section keeps its existing monolithic body and only
  runs the parts machinery for *shared* parts at the top. Decomposing a section's body
  (e.g. Content Impact's 1,475 lines, PR Influence's 550) into versioned parts is a
  separate, later, per-section spec, prioritized on demand.
- Adding the `SharedPartsHeader` to all 29 section folders — only the 7 in-scope
  commentary views get it now. Extending to another section later is a one-line add.
- Any change to commentary's behavior, permissions, sanitization, or approval flow.
- A UI for editing `reportSectionConfig` — renaissance's opt-in is a DB data change
  (SQL), consistent with the repo's "writes go through the DB" convention.

## Context (current state)

- **Parts framework** (`lib/report-sections/`): `PartImpl<Ctx>` is a pure synchronous
  `render(ctx, resolved) => ReactNode`; `PartRegistry<Ctx> = Record<id, Record<version, PartImpl>>`;
  `resolveSection(template, override)` merges a `SectionTemplate` with a per-client
  `SectionOverride` (`{ frozen, versions, order, hidden, extraParts, labels, thresholds }`)
  into ordered `ResolvedPart[]`; `lookup(registry, id, version)` returns the impl or
  `undefined`. `REGISTRIES` (`registries.ts`) maps section slug → registry; only
  `peec-ai` is registered today.
- **Only the AEO Overview** (`peec-ai/index.tsx`) is parts-based. PR Influence,
  Content Impact, and the paid/social sections are monolithic and do not consult
  `reportSectionConfig`.
- **Commentary** currently renders page-level: `resolveCommentaryView(slug, subsection)`
  + `<CommentarySection>` wired into the 4 report route files. `CommentarySection`
  (`components/report-sections/commentary/index.tsx`) takes `{ clientSlug, viewKey }`,
  derives capabilities from `auth()`, filters entries via `visibleEntries`, and renders
  the client `CommentaryPanel`. Returns `null` for a client with nothing approved.
- **`reportSectionConfig`** is a `jsonb` column on `clients`, `Record<sectionSlug, SectionOverride>`.
  The write-path (`app/actions/report-sections.ts` + `validateSectionOverride` in
  `lib/report-sections/mutations.ts`) validates `extraParts`/version pins against the
  section's registry.

### The async-part insight

`PartImpl.render` is pure/synchronous, but it returns a `ReactNode`. A part may return
an **async server-component element** — React resolves it as an async child. So the
commentary part is simply `render: (ctx) => <CommentarySection clientSlug={ctx.slug} viewKey={ctx.viewKey} />`,
with no change to the pure-sync contract. The async `auth()` + DB fetch lives inside
the returned RSC, wrapped in `Suspense` by the runner.

## Verification (pre-implementation, done during design)

**Async-child-in-RSC assumption — audited across all 7 host components.** All are
server components (none `'use client'`), so a part returning an async server-component
element renders correctly:

| Host component | `'use client'`? | Kind |
|---|---|---|
| `peec-ai/index.tsx` | no | async RSC |
| `peec-ai/pr-influence.tsx` | no | async RSC |
| `peec-ai/content-impact.tsx` | no | async RSC |
| `paid-search/index.tsx` | no | async RSC |
| `meta-ads/index.tsx` | no | async RSC |
| `linkedin-ads/index.tsx` | no | async RSC |
| `organic-social/index.tsx` | no | **sync** RSC (hosts an async child fine) |

Several sections have `'use client'` **children** (e.g. `paid-search/hero.tsx`,
`meta-ads/creative-table-client.tsx`, `organic-social/trends.tsx`). The header must be
placed in the section's **RSC parent** (the files above), above any client children —
never inside a client child.

**Old → new coverage — mapped, no regression.** Every one of the 7 section components
is rendered **only** from the 4 report routes (verified: no other import/render site —
no dashboard blocks, PDF export, or embeds). So part-level rendering covers exactly the
same surfaces page-level did. One case improves: page-level `resolveCommentaryView('peec-ai')`
returns non-null even on the dashboard deep-link route, which has **no** `peec-ai` case,
so today commentary could render above a 404'd section; part-level renders commentary
only where the section actually renders.

| View | Rendered on routes | Page-level today | Part-level (new) |
|---|---|---|---|
| AEO Overview | dashboard SPA, portal SPA, portal deep-link | ✅ (+ vacuous on dashboard deep-link) | ✅ same 3, no vacuous case |
| PR Influence / Content Impact | SPA routes only | ✅ | ✅ same |
| Paid Search / Meta / LinkedIn / Organic Social | all 4 routes | ✅ | ✅ same |

## In-scope views — shared parts keyed by `viewKey`

Per the per-sub-tab decision, shared-parts opt-in is keyed by **`viewKey`** (not section
slug), so the 3 AEO sub-tabs are independent. The `SharedPartsHeader` needs only
`{ viewKey, clientSlug }` and looks up `client.reportSectionConfig[viewKey]?.sharedParts`.

| View | Section component | `viewKey` (config key + commentary data key) |
|---|---|---|
| AEO Overview | `peec-ai/index.tsx` | `peec-ai` |
| AEO PR Influence | `peec-ai/pr-influence.tsx` | `peec-ai:pr-influence` |
| AEO Content Impact | `peec-ai/content-impact.tsx` | `peec-ai:content-impact` |
| Paid Search | `paid-search/index.tsx` | `paid-search` |
| Meta | `meta-ads/index.tsx` | `meta-ads` |
| LinkedIn | `linkedin-ads/index.tsx` | `linkedin-ads` |
| Organic Social | `organic-social/index.tsx` | `organic-social` |

**Keyspace note:** `reportSectionConfig` is `Record<string, SectionOverride>`. Body
composition entries are keyed by **section slug** (e.g. `peec-ai`); shared-parts opt-in
is keyed by **viewKey**. For single-view sections and AEO Overview, `viewKey == sectionSlug`,
so one entry may carry *both* body config (in its own fields) and `sharedParts` — they
never collide because they live in different fields. The AEO sub-tab keys
(`peec-ai:pr-influence`, `peec-ai:content-impact`) are viewKey-only entries that the body
system never reads (it only looks up section slug `peec-ai`). This is documented as an
intentional, additive expansion of the `reportSectionConfig` keyspace.

## Architecture

### Shared parts registry

`components/report-sections/shared/parts/registry.ts` (new):

```ts
export type SharedCtx = { slug: string; viewKey: CommentaryViewKey }

export const commentaryPart: PartImpl<SharedCtx> = {
  id: 'commentary',
  version: 1,
  published: true,
  defaultLabel: 'Commentary',
  render: (ctx) => <CommentarySection clientSlug={ctx.slug} viewKey={ctx.viewKey} />,
}

export const SHARED_PARTS: PartRegistry<SharedCtx> = {
  commentary: { 1: commentaryPart },
}
```

### The distinct `sharedParts` field

Add one optional field to `SectionOverride` (`lib/report-sections/types.ts`) — additive,
jsonb, no migration:

```ts
export type SectionOverride = {
  frozen?: SectionSnapshot
  versions?: Record<string, number>
  order?: string[]
  hidden?: string[]
  extraParts?: PartPin[]     // section BODY parts (existing)
  sharedParts?: PartPin[]    // NEW — cross-section shared parts (commentary, …)
  labels?: Record<string, string>
  thresholds?: Record<string, number>
}
```

Keeping shared parts in their **own field** (not overloading `extraParts`) removes the
fragile "two consumers of one array, disambiguated by registry filtering" coupling the
review flagged: body resolution reads `extraParts`, shared resolution reads `sharedParts`,
and they never cross. It is also not part of freeze/snapshot semantics (snapshots capture
body composition only).

**Keyspace doc comment (review #1).** Because a `reportSectionConfig` key may now be a
section slug (body config), a viewKey (shared parts), or both, add a doc comment on the
`ReportSectionConfig` type stating this, so a future engineer doesn't treat a viewKey-only
key like `peec-ai:pr-influence` as an orphan and "clean it up." `REGISTRIES[key]` returning
nothing for such a key is expected — the body system only looks up section slugs.

### Shared-parts resolution (pure) + the runner

Pure helper in `components/report-sections/shared/parts/registry.ts` — no `resolveSection`
needed, just filter the `sharedParts` pins to those that exist in `SHARED_PARTS`:

```ts
/** Which shared parts render for a client's view. Pure — no I/O. Array order is
 *  render order; an id/version not in SHARED_PARTS is dropped. */
export function resolveSharedParts(sharedParts: PartPin[] | undefined): ResolvedPart[] {
  return (sharedParts ?? [])
    .map((pin) => {
      const impl = lookup(SHARED_PARTS, pin.id, pin.version)
      return impl ? { id: pin.id, version: pin.version, label: impl.defaultLabel } : null
    })
    .filter((r): r is ResolvedPart => r !== null)
}
```

- **`ResolvedPart` shape (review #4).** `ResolvedPart` is `{ id; version; label; threshold? }`
  — `threshold` is optional. The shared path builds `{ id, version, label }`, which is a
  complete, honest value: a shared part like commentary genuinely has no threshold, so the
  field is *absent*, not stubbed. No partial-that-happens-to-typecheck.
- **Stale pins (review #2).** A pin whose id/version is no longer in `SHARED_PARTS` (e.g. a
  shared part retired while a client's jsonb still pins it) is silently dropped at render —
  intended runtime behavior. There is no stale-pin warning anywhere and none is expected;
  the write-path validation is where bad pins are surfaced.

`components/report-sections/shared/shared-parts-header.tsx` (new) — async RSC, thin
wrapper; keyed by `viewKey`:

```tsx
export async function SharedPartsHeader({
  viewKey, clientSlug,
}: { viewKey: CommentaryViewKey; clientSlug: string }) {
  const client = await getClientBySlug(clientSlug)               // React.cache-memoized (see below)
  const resolved = resolveSharedParts(client?.reportSectionConfig?.[viewKey]?.sharedParts)
  if (resolved.length === 0) return null
  const ctx: SharedCtx = { slug: clientSlug, viewKey }
  return (
    <>
      {resolved.map((r) => {
        const impl = lookup(SHARED_PARTS, r.id, r.version)
        if (!impl) return null                                   // defensive skip, not a crash
        return (
          <ReportErrorBoundary key={`${r.id}@${r.version}`} sectionName={`Commentary (${r.id})`}>
            <Suspense fallback={null}>{impl.render(ctx, r)}</Suspense>
          </ReportErrorBoundary>
        )
      })}
    </>
  )
}
```

- Opt-in only: a client with no `sharedParts` under that `viewKey` renders nothing.
- `getClientBySlug` is `React.cache`-wrapped in `lib/db/queries.ts` (and persistently
  `cached('db', …)`), so N headers across one report render dedupe to a single client
  fetch — no added query cost.
- Defensive `if (!impl) return null` rather than a `!` assertion — the resolve invariant
  lives in another file, so the runner degrades gracefully if it ever breaks.
- Error-boundary name is keyed off the part id, so a second shared part won't mislabel
  failures.
- Body parts are wholly unaffected: they live in each section's own registry and read
  `extraParts`, never `sharedParts`.

### Wiring into the 7 sections

Each in-scope section component renders the header at the very top of its **RSC parent**
(above any `'use client'` children — see Verification):

```tsx
<SharedPartsHeader viewKey="meta-ads" clientSlug={clientSlug} />
```

`viewKey` is the component's own identity (a constant per component — not a client
identifier, so it doesn't violate the no-hardcoded-client rule). The 3 AEO components
pass their distinct viewKeys (`peec-ai`, `peec-ai:pr-influence`, `peec-ai:content-impact`).

### Remove page-level rendering

Revert the commentary block from the 4 report route files (the `resolveCommentaryView`
+ `<CommentarySection>` insertions). `resolveCommentaryView` and `CommentarySection`
remain — `CommentarySection` is now invoked by the commentary part; `resolveCommentaryView`/
`COMMENTARY_VIEWS` still define the canonical view keys used by the parts and the data
layer.

### Validation

Extend `validateSectionOverride` to validate the **new `sharedParts` field** against the
`SHARED_PARTS` registry — a separate check from the existing `extraParts`/version-pin
validation against the section's body registry. The two id-spaces stay distinct (no
merging shared ids into body known-ids), so a typo'd body-part id still fails as unknown
and a `sharedParts` id is validated only against `SHARED_PARTS`. This keeps the existing
`saveReportSectionConfig` action able to accept a commentary opt-in.

**viewKey-only keys are legal (review #1).** `validateSectionOverride` must NOT reject a
`reportSectionConfig` entry whose key has no matching body registry (e.g.
`peec-ai:pr-influence`) — such entries are viewKey-only shared-part opt-ins. Body-part
validation for a key only applies when that key is a known section slug; the `sharedParts`
check applies to every key regardless.

## Per-client rollout (renaissance)

A data change, keyed by **viewKey** (per-sub-tab). Renaissance's `reportSectionConfig`
gets, under each of the **7 in-scope view keys**, `{ "sharedParts": [{ "id": "commentary", "version": 1 }] }`:

```
peec-ai · peec-ai:pr-influence · peec-ai:content-impact ·
paid-search · meta-ads · linkedin-ads · organic-social
```

Any of the 7 can be omitted to leave that sub-tab without commentary (per-sub-tab control).

**Reproducible, not a hand-off.** Committed as a tracked data-migration artifact — an
idempotent script `scripts/enable-commentary-renaissance.ts` (following the existing
`scripts/seed-section-templates.ts` pattern: reads `.env.local`, merges the `sharedParts`
entries into renaissance's `reportSectionConfig` via Drizzle, `onConflict`/read-modify-write
so re-runs are safe), with the equivalent raw SQL in the script's header comment for
manual/console use. This keeps the feature gate version-controlled and reproducible
across environments, rather than a one-off SQL. Every other client (no such entry) shows
no commentary.

**All-or-nothing write + logging (review #3).** Per-sub-tab keying means 7 entries, so the
script writes **all 7 viewKeys in a single read-modify-write** (not 7 separate updates) to
avoid a half-applied state, and **logs the viewKeys it touched** (and the resulting set) so
a partial rollout is visible. A re-run is a no-op that logs the already-present set.

## Files

**Created**
- `components/report-sections/shared/parts/registry.ts` — `SharedCtx`, `commentaryPart`, `SHARED_PARTS`, `resolveSharedParts`
- `components/report-sections/shared/parts/registry.test.ts` — `resolveSharedParts` opt-in present/absent/unknown-id/order; body–shared isolation
- `components/report-sections/shared/shared-parts-header.tsx` — `SharedPartsHeader` runner (async RSC)
- `scripts/enable-commentary-renaissance.ts` — idempotent, tracked data-migration for the renaissance opt-in

**Modified**
- `lib/report-sections/types.ts` — add `sharedParts?: PartPin[]` to `SectionOverride`
- `components/report-sections/peec-ai/index.tsx`, `peec-ai/pr-influence.tsx`,
  `peec-ai/content-impact.tsx`, `paid-search/index.tsx`, `meta-ads/index.tsx`,
  `linkedin-ads/index.tsx`, `organic-social/index.tsx` — render `<SharedPartsHeader viewKey=… clientSlug=…>` at the top of the RSC parent
- `app/dashboard/[clientSlug]/reports/page.tsx`, `.../reports/[reportSlug]/page.tsx`,
  `app/portal/[clientSlug]/reports/page.tsx`, `.../reports/[reportSlug]/page.tsx` — revert
  the page-level commentary block
- `lib/report-sections/mutations.ts` (`validateSectionOverride`) — validate `sharedParts` against `SHARED_PARTS`

**Reused unchanged**
- `report_commentary` table + migration 0017; all `lib/commentary/*`; `app/actions/commentary.ts`;
  `components/report-sections/commentary/{index,commentary-panel,commentary-editor}.tsx`.

## Testing

- **`resolveSharedParts`** (pure/unit): `sharedParts:[{commentary,1}]` → resolves the
  commentary part; `undefined`/`[]` → `[]`; an unknown id/version → dropped; array order
  is preserved as render order.
- **Body–shared isolation** (pure/unit): an override with body `extraParts:[someBodyPart]`
  and no `sharedParts` → `resolveSharedParts` returns `[]` (body parts never leak into the
  shared header); and vice-versa.
- **Validation**: `validateSectionOverride` accepts `sharedParts:[{id:'commentary',version:1}]`;
  rejects a `sharedParts` id not in `SHARED_PARTS`; still validates body `extraParts` against
  the body registry independently.
- Existing commentary data-layer tests stay green (unchanged).
- Manual (env-permitting): renaissance shows commentary on all 7 views via the part;
  a client without the opt-in shows none; commentary still renders at the top.

## Decomposition note

This is spec 1 of the larger "parts for all reports" initiative and deliberately the
**thin** slice: shared-parts framework + commentary as a shared part on the 7 in-scope
views. Deep decomposition of each section's body into parts is out of scope and becomes
its own per-section spec later, prioritized on demand (Content Impact / PR Influence
first only if there's a concrete reason).

## Known tradeoffs (final review)

- **Staff visibility:** with page-level rendering removed, `SharedPartsHeader` returns
  null unless the client has a `sharedParts` opt-in, so Avenue Z staff no longer see the
  commentary editor on a *non-opted-in* client. Onboarding a client to commentary requires
  running the opt-in write first. (The spec's coverage-equivalence claim holds for
  opted-in clients.)
- **Validation permissiveness:** `parseReportSectionConfig` now accepts any key
  (viewKey-only keys use an empty body registry), so a typo'd key carrying only
  `sharedParts` validates as a silent no-op that never renders. Intentional tradeoff for
  the viewKey-only design; a future hardening could validate keys against
  `CommentaryViewKey ∪ known section slugs`.
