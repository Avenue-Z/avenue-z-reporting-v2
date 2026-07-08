# PR Influence — Migrate onto the Versioned-Parts System

**Date:** 2026-07-08
**Status:** Design (approved, pre-implementation)
**Depends on:** `docs/superpowers/specs/2026-06-30-per-client-report-sections-design.md` (the parts framework this reuses)

---

## Problem

The peec-ai **PR Influence** tab (`components/report-sections/peec-ai/pr-influence.tsx`) is a
single hand-written RSC with a hardcoded body sequence, identical for every client. There is no
way to customize its contents per client without editing shared code.

The immediate driver: **renaissance should no longer show the "Sentiment Insights" section** in
PR Influence, while every other client keeps it. Today Sentiment Insights is inlined at
`pr-influence.tsx:523-531` and is not an addressable part, so it can only be removed globally by a
code edit.

Only the peec-ai **Overview** tab is currently on the versioned-parts system (`PEEC_PARTS` +
`PEEC_TEMPLATE`, resolved in `index.tsx`). The framework in `lib/report-sections/` is already
general; PR Influence simply has not been migrated onto it.

## Goal

Migrate the PR Influence body onto the parts system so its sub-sections become individually
addressable, versionable parts — then hide the `sentiment-insights` part for renaissance via
per-client `reportSectionConfig`. This is a **behavior-preserving refactor**: the only functional
change is renaissance hiding one part. All other clients render byte-for-byte the same sections in
the same order.

### Non-goals

- Migrating any other section/view (Content Impact, Technical Audit, or non-peec sections). Those
  are separate future sub-projects, each with its own spec + parity test.
- Splitting the Top Editorial / Prompt Cluster grid into two independently-configurable parts
  (kept as one combined part — see §4).
- Deleting the Sentiment Insights component or `lib/peec/sentiment-insights.ts`. Sentiment stays a
  real, shipping part; it is merely hidden for one client.
- An in-app editor UI for composing parts (framework roadmap item, out of scope here).

## Success criteria

1. With the **default** template and no client override, the PR Influence tab renders the same
   sections, in the same order, with the same content as today (verified by a golden snapshot;
   see §6 for the one accepted structural delta).
2. With renaissance's override applied, the `sentiment-insights` part is absent and every other
   part renders in the unchanged order.
3. `tsc --noEmit` clean; existing peec-ai tests + the new golden tests pass; the registry guard
   test passes for the new registry.
4. No other client's PR Influence output changes.

---

## Approach

**Single upfront ctx builder + pure-sync parts** — mirrors the Overview migration exactly.

Everything the RSC computes today (the `Promise.allSettled` fetch of 7 sources plus all derivation,
`pr-influence.tsx:199-492`) moves into an async `buildPrInfluenceCtx(...)` that returns a
`PrInfluenceCtx` bag. Each part is a `PartImpl<PrInfluenceCtx>` whose `render(ctx, resolved)` is a
pure synchronous function reading from that ctx. The view fetches, builds ctx, resolves the
template against the client override, and maps the resolved parts to `impl.render(...)`.

The two streaming blocks (Executive Synopsis, Sentiment Insights) keep their existing behavior: the
part's `render()` is still synchronous but returns the existing `<Suspense>` + inner async RSC
subtree with ctx-derived props. This is the same shape the `commentary` shared part already uses
(a sync `render()` returning an async RSC child), so streaming survives migration.

**Alternative considered — per-part async fetching (rejected).** Letting each part fetch its own
data would duplicate fetches and re-derivation, because PR Influence's derived values are deeply
cross-dependent (`coverage` / `urlCitations` / `editorialDomains` feed the matchback, top-editorial,
brand-absent, and synopsis blocks). It would also diverge from the established Overview pattern.

---

## Architecture

### The five body parts

Fixed chrome (rendered by the view, not part of the template): `SharedPartsHeader`
(`viewKey="peec-ai:pr-influence"`, unchanged — this is how commentary already renders) and the
`SectionHeader` title/subtitle.

Template body, default order (reproduces `pr-influence.tsx:505-550`):

| # | Part id | Renders today | Notes |
|---|---|---|---|
| 1 | `pr-synopsis` | `PRInfluenceSynopsis` | Gated by `SHOW_AI_NARRATIVE` inside the part; `<Suspense>` + async child |
| 2 | `pr-placement-matchback` | `PRPlacementMatchbackTable` | Pure render from ctx rows |
| 3 | `sentiment-insights` | `SentimentInsightsSection` | `<Suspense>` + async child. **Hidden for renaissance.** |
| 4 | `editorial-and-clusters` | `TopEditorialDomainsTable` + `PromptClusterOpportunityMatrix` | One part owning the 2-col grid (`grid lg:grid-cols-2`) |
| 5 | `brand-absent-editorial` | `BrandAbsentEditorialDomainsTable` | Pure render from ctx rows |

`SHOW_AI_NARRATIVE` gate for `pr-synopsis` lives **inside the part's render** (returns `null` when
false), preserving today's conditional with zero config.

### File layout

```
components/report-sections/peec-ai/pr-influence/
  ctx.ts                         # PrInfluenceCtx type + async buildPrInfluenceCtx()
                                 #   (moves buildMatchback, computeOpportunityRows, and all
                                 #    line 199-492 derivation out of the RSC)
  template.ts                    # PR_INFLUENCE_TEMPLATE — code fallback for the DB template row
  parts/
    registry.ts                  # PR_INFLUENCE_PARTS: id -> version -> impl
    pr-synopsis.tsx
    pr-placement-matchback.tsx
    sentiment-insights.tsx
    editorial-and-clusters.tsx
    brand-absent-editorial.tsx
    __fixtures__/pr-influence-ctx.ts   # frozen fixture ctx for golden tests
    *.golden.test.tsx                  # one per part
    __snapshots__/
```

`components/report-sections/peec-ai/pr-influence.tsx` becomes the thin view:

```
async function PRInfluenceReport({ clientSlug, dateRange, models }) {
  const config   = clientSlug ? await getClientBySlug(clientSlug) : null
  const ctx      = await buildPrInfluenceCtx({ clientSlug, dateRange, models })
  const template = (await getSectionTemplate('peec-ai:pr-influence')) ?? PR_INFLUENCE_TEMPLATE
  const override = config?.reportSectionConfig?.['peec-ai:pr-influence']
  const resolved = resolveSection(template, override)
  return (
    <div className="space-y-8">
      <SharedPartsHeader viewKey="peec-ai:pr-influence" clientSlug={clientSlug} />
      <SectionHeader icon={Megaphone} title="…" subtitle="…" />
      {resolved.map((r) => {
        const impl = lookup(PR_INFLUENCE_PARTS, r.id, r.version)
        return impl ? <div key={`${r.id}@${r.version}`}>{impl.render(ctx, r)}</div> : null
      })}
    </div>
  )
}
```

Presentational components — `pr-influence-tables.tsx`, `pr-influence-synopsis.tsx`,
`synopsis-skeleton.tsx`, `sentiment-insights-section.tsx`, `sentiment-insights.tsx` — are
**unchanged**; parts only wrap them.

### `PrInfluenceCtx`

A data bag holding everything the parts need, all computed once in `buildPrInfluenceCtx`:

- Passthrough for the streaming parts: `clientSlug`, `dateRange`.
- `pr-synopsis`: `synopsisContext` (the `PRInfluenceSynopsisContext` built at lines 468-492).
- `pr-placement-matchback`: `matchbackTableRows`, `totalPlacements`, `placementsCitedByAI`.
- `sentiment-insights`: `sentimentCitations`, `sentimentModelKey`.
- `editorial-and-clusters`: `topEditorialRows`, `opportunityTableRows`.
- `brand-absent-editorial`: `brandAbsentTableRows`, `hasEditorialDomains`.

The `models` filter is an input to `buildPrInfluenceCtx` (as it is to `buildPeecCtx`), so all
model-reactive derivation stays server-side and out of the parts.

---

## Framework wiring

- **`lib/report-sections/registries.ts`** — add `'peec-ai:pr-influence': PR_INFLUENCE_PARTS` to
  `REGISTRIES`. The viewKey already exists as a commentary `sharedParts` key; it now *also* gains a
  body registry. A single `SectionOverride` on that key legitimately carries both `sharedParts`
  (validated against `SHARED_PARTS`) and body fields `hidden`/`order`/`versions`/`extraParts`
  (validated against `PR_INFLUENCE_PARTS`). `validate.ts` already splits these, so no framework
  change is needed beyond the registry entry.
- **Template seed** — a tracked idempotent script inserts a `section_templates` row keyed
  `peec-ai:pr-influence` matching `PR_INFLUENCE_TEMPLATE`. The view falls back to the code constant
  when the row is absent, so behavior is correct before/after seeding.
- **Registry guard** — extend the existing `components/report-sections/peec-ai/guard.test.ts`
  pattern to the new registry (all template/frozen/shared pins published; no dangling refs).

---

## Per-client change (the goal)

A tracked idempotent script — mirroring `scripts/enable-commentary-renaissance.ts` — performs a
read-modify-write on renaissance's `clients.report_section_config`, merging:

```
'peec-ai:pr-influence': { ...existing, hidden: ['sentiment-insights'] }
```

It **must preserve** the existing `sharedParts: [{ id: 'commentary', version: 1 }]` already on that
key. (`lib/report-sections/mutations.ts` has `mergePreservingSharedParts` for the inverse direction;
this script preserves `sharedParts` while writing body config.) The script is idempotent: re-running
does not duplicate `hidden` entries or drop the commentary opt-in.

Result: renaissance's PR Influence renders parts 1, 2, 4, 5 (Sentiment omitted); all other clients
render all five.

---

## Parity / testing

- **Default-composition golden test** — snapshot the resolved body rendered from a frozen fixture
  ctx with the default template and no override. This is the regression guard that the migration
  reproduces today's section order and content.
- **Renaissance-override golden test** — same fixture, with `hidden: ['sentiment-insights']`
  applied → snapshot shows Sentiment absent, order otherwise intact.
- **Per-part golden tests** — one per part (matching the Overview `parts/*.golden.test.tsx`
  convention), each rendering `PR_INFLUENCE_PARTS[id][version].render(FIXTURE, resolved)`.
- **Accepted structural delta:** the parts convention wraps each part in a keyed `<div>`
  (`<div key={id@version}>…</div>`), which today's inline body does not. Under the section's
  `space-y-8` container these wrappers remain direct children, so vertical spacing and visual
  layout are identical; the wrapper `<div>`s are the single accepted difference from the
  pre-migration DOM. This matches the convention the Overview migration adopted.
- `tsc --noEmit` clean; existing peec-ai tests pass.
- Optional end-to-end: drive the running app's PR Influence tab for renaissance (`/verify`) to
  confirm Sentiment is gone and the rest renders.

---

## Branch & rollout

- New branch `feat/report-parts-pr-influence` off `dev`. Created at implementation start, not now.
- The current `feat/report-commentary` working tree has unrelated uncommitted `visibility-chart.v2`
  changes; those are left untouched.
- Rollout order at implementation time: (1) refactor + parts + default parity green, (2) seed the
  template row, (3) run the renaissance hide script, (4) verify.

## Risks & mitigations

- **Silent parity drift during extraction.** Mitigation: the default-composition golden test is the
  gate; extraction into `ctx.ts` must be a pure move (no logic edits).
- **Model-filter behavior.** `models` must thread into `buildPrInfluenceCtx` so per-section tables
  stay model-reactive exactly as today; the synopsis stays model-filter-agnostic (matches current
  behavior, lines 462-467). Covered by fixtures exercising an active model filter.
- **Config-key collision with commentary.** Both body config and the commentary opt-in live on the
  same `peec-ai:pr-influence` key; the hide script must merge, not overwrite. Covered by the
  idempotency requirement and a preservation assertion.
