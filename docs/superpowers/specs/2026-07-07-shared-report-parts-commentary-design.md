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
`reportSectionConfig` opts in via `extraParts`. This makes commentary a per-client
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

## In-scope views → (sectionSlug, viewKey)

The header keys the per-client override by **section slug** but renders commentary for
the specific **view key**. The 3 AEO views share one section slug:

| View | Section component | `sectionSlug` (override key) | `viewKey` (commentary data) |
|---|---|---|---|
| AEO Overview | `peec-ai/index.tsx` | `peec-ai` | `peec-ai` |
| AEO PR Influence | `peec-ai/pr-influence.tsx` | `peec-ai` | `peec-ai:pr-influence` |
| AEO Content Impact | `peec-ai/content-impact.tsx` | `peec-ai` | `peec-ai:content-impact` |
| Paid Search | `paid-search/index.tsx` | `paid-search` | `paid-search` |
| Meta | `meta-ads/index.tsx` | `meta-ads` | `meta-ads` |
| LinkedIn | `linkedin-ads/index.tsx` | `linkedin-ads` | `linkedin-ads` |
| Organic Social | `organic-social/index.tsx` | `organic-social` | `organic-social` |

So one `reportSectionConfig['peec-ai'].extraParts=[commentary]` opts in **all three**
AEO views together (each rendering its own view's commentary), and the 4 paid/social
slugs opt in individually — 5 section-slug entries cover all 7 views.

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

### Shared-parts resolution (pure) + the runner

Split the logic so the resolution is unit-testable without a DB. Pure helper in
`components/report-sections/shared/parts/registry.ts` (or a sibling `resolve.ts`):

```ts
const EMPTY_TEMPLATE = { order: [], labels: {}, thresholds: {} } as const

/** Which shared parts render for a client's section override. Pure — no I/O.
 *  EMPTY_TEMPLATE means nothing by default; override.extraParts opts in; and
 *  order/hidden/versions apply via resolveSection. Filtered to SHARED_PARTS so a
 *  section's own body parts never appear here. */
export function resolveSharedParts(override: SectionOverride | undefined): ResolvedPart[] {
  return resolveSection(EMPTY_TEMPLATE, override).filter(
    (r) => !!lookup(SHARED_PARTS, r.id, r.version),
  )
}
```

`components/report-sections/shared/shared-parts-header.tsx` (new) — async RSC, thin
wrapper over the pure helper:

```tsx
export async function SharedPartsHeader({
  sectionSlug, viewKey, clientSlug,
}: { sectionSlug: string; viewKey: CommentaryViewKey; clientSlug: string }) {
  const client = await getClientBySlug(clientSlug)
  const resolved = resolveSharedParts(client?.reportSectionConfig?.[sectionSlug])
  if (resolved.length === 0) return null
  const ctx: SharedCtx = { slug: clientSlug, viewKey }
  return (
    <>
      {resolved.map((r) => {
        const impl = lookup(SHARED_PARTS, r.id, r.version)!   // guaranteed by resolveSharedParts
        return (
          <ReportErrorBoundary key={`${r.id}@${r.version}`} sectionName="Commentary">
            <Suspense fallback={null}>{impl.render(ctx, r)}</Suspense>
          </ReportErrorBoundary>
        )
      })}
    </>
  )
}
```

- `EMPTY_TEMPLATE` → nothing by default; the client's `override.extraParts` adds
  commentary. Reusing `resolveSection` gives shared parts order/`hidden`/version handling
  for free (`hidden:['commentary']` removes it; future shared parts, versioning).
- Filtered to `SHARED_PARTS`, so a section's body parts (in its own registry) are never
  rendered here; commentary lives *only* in `SHARED_PARTS`, so there is no double-render
  even for AEO — its body loop already skips unknown ids via `lookup ?? null`.
- Own error boundary + `Suspense` so a commentary failure can't crash the section.

### Wiring into the 7 sections

Each in-scope section component renders the header at the very top of its output:

```tsx
<SharedPartsHeader sectionSlug="meta-ads" viewKey="meta-ads" clientSlug={clientSlug} />
```

`sectionSlug`/`viewKey` are the component's own identity (a constant per component,
not a client identifier — allowed). For the 3 AEO views, `sectionSlug="peec-ai"` with
distinct `viewKey`s.

### Remove page-level rendering

Revert the commentary block from the 4 report route files (the `resolveCommentaryView`
+ `<CommentarySection>` insertions). `resolveCommentaryView` and `CommentarySection`
remain — `CommentarySection` is now invoked by the commentary part; `resolveCommentaryView`/
`COMMENTARY_VIEWS` still define the canonical view keys used by the parts and the data
layer.

### Validation

Extend the write-path so `extraParts: [{ id: 'commentary', version: 1 }]` on any
section's override validates. `validateSectionOverride` currently checks extra/pinned
ids against the section's registry (`REGISTRIES[section]` / `templateIds`). Include
`SHARED_PARTS` ids in the set it validates against (merge shared ids into the known-id
set for every section). This keeps the existing `saveReportSectionConfig` action able
to accept commentary opt-in without rejecting it as an unknown part.

## Per-client rollout (renaissance)

A data change only. For each of the 5 in-scope section slugs, add to renaissance's
`reportSectionConfig`:

```json
{ "extraParts": [{ "id": "commentary", "version": 1 }] }
```

Delivered as SQL (a `jsonb_set`/update on the renaissance `clients` row), handed to the
user to run — no code, no migration, no redeploy. Any other client without this entry
shows no commentary.

## Files

**Created**
- `components/report-sections/shared/parts/registry.ts` — `SharedCtx`, `commentaryPart`, `SHARED_PARTS`, `resolveSharedParts`
- `components/report-sections/shared/parts/registry.test.ts` — `resolveSharedParts` opt-in present/absent/`hidden`/unknown-id
- `components/report-sections/shared/shared-parts-header.tsx` — `SharedPartsHeader` runner (async RSC)
- (SQL snippet for renaissance opt-in — delivered to user, not committed as code)

**Modified**
- `components/report-sections/peec-ai/index.tsx`, `peec-ai/pr-influence.tsx`,
  `peec-ai/content-impact.tsx`, `paid-search/index.tsx`, `meta-ads/index.tsx`,
  `linkedin-ads/index.tsx`, `organic-social/index.tsx` — render `<SharedPartsHeader>` at top
- `app/dashboard/[clientSlug]/reports/page.tsx`, `.../reports/[reportSlug]/page.tsx`,
  `app/portal/[clientSlug]/reports/page.tsx`, `.../reports/[reportSlug]/page.tsx` — revert
  the page-level commentary block
- `lib/report-sections/mutations.ts` (`validateSectionOverride`) — accept `SHARED_PARTS` ids

**Reused unchanged**
- `report_commentary` table + migration 0017; all `lib/commentary/*`; `app/actions/commentary.ts`;
  `components/report-sections/commentary/{index,commentary-panel,commentary-editor}.tsx`.

## Testing

- **`resolveSharedParts`** (pure/unit): override with `extraParts:[commentary]` → resolves
  the commentary part; no override / empty override → `[]`; `hidden:['commentary']` → `[]`;
  an unknown shared id in `extraParts` → skipped (not in `SHARED_PARTS`).
- **Validation**: `validateSectionOverride` accepts `extraParts:[{id:'commentary',version:1}]`
  for every in-scope section; still rejects genuinely unknown ids.
- Existing commentary data-layer tests stay green (unchanged).
- Manual (env-permitting): renaissance shows commentary on all 7 views via the part;
  a client without the opt-in shows none; commentary still renders at the top.

## Decomposition note

This is spec 1 of the larger "parts for all reports" initiative and deliberately the
**thin** slice: shared-parts framework + commentary as a shared part on the 7 in-scope
views. Deep decomposition of each section's body into parts is out of scope and becomes
its own per-section spec later, prioritized on demand (Content Impact / PR Influence
first only if there's a concrete reason).
