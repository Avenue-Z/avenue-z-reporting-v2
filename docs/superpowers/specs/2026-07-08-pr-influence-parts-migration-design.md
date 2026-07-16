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
change is renaissance hiding one part. Every other client renders the same sections, in the same
order, with the same content — structurally equivalent to today modulo the per-part wrapper `<div>`
described in §Parity.

### Non-goals

- Migrating any other section/view (Content Impact, Technical Audit, or non-peec sections). Those
  are separate future sub-projects, each with its own spec + parity test.
- Splitting the Top Editorial / Prompt Cluster grid into two independently-configurable parts
  (kept as one combined part — see §Architecture, "The five body parts").
- Deleting the Sentiment Insights component or `lib/peec/sentiment-insights.ts`. Sentiment stays a
  real, shipping part; it is merely hidden for one client.
- An in-app editor UI for composing parts (framework roadmap item, out of scope here).

## Success criteria

1. With the **default** template and no client override, the PR Influence tab renders the same
   sections, in the same order, with the same content as today (verified by a golden snapshot;
   see §Parity for the one accepted structural delta).
2. With renaissance's override applied, the `sentiment-insights` part is absent and every other
   part renders in the unchanged order.
3. `tsc --noEmit` clean; existing peec-ai tests, the new composition golden tests, the
   `buildPrInfluenceCtx` derivation snapshot test, and the CI registry guard for the new registry
   all pass.
4. No other client's PR Influence output changes (confirmed by the default-composition golden test
   plus a pre/post `/verify` on a non-renaissance client run **after** the template row is seeded,
   so the production "DB row + no override" path is exercised directly).

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
false), preserving today's conditional with zero config. Note `SHOW_AI_NARRATIVE` is currently
`false`, so `pr-synopsis` renders `null` in production today (this is why the empty-wrapper fix in
§Architecture matters — it is the first body part).

**What "moves to ctx" vs. what stays async (resolving an apparent contradiction).** Only the
*synchronous* fetch + derivation currently at `pr-influence.tsx:199-492` moves into
`buildPrInfluenceCtx` — the `Promise.allSettled` of the 7 fast sources and all the pure derivation
(matchback rows, opportunity rows, editorial rows, brand-absent rows, synopsis context). The two
streaming parts still own a `<Suspense>` boundary because their inner async child makes a **further,
slower call that is intentionally not in ctx**: `PRInfluenceSynopsis` awaits `getPRInfluenceSynopsis`
(Glean LLM narrative) and `SentimentInsightsSection` awaits `getSentimentInsights` (Glean sentiment).
ctx supplies the *inputs* to those children (`synopsisContext`; `sentimentCitations` + `sentimentModelKey`);
the children still perform the slow Glean call themselves, so those calls keep streaming
independently instead of blocking the tab. This matches today's behavior exactly.

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
        const node = impl?.render(ctx, r) ?? null
        // Skip the wrapper entirely when a part self-nulls, so no empty <div>
        // becomes a child of space-y-8 (see §Parity, "empty-wrapper" note).
        return node == null ? null : <div key={`${r.id}@${r.version}`}>{node}</div>
      })}
    </div>
  )
}
```

**Empty-wrapper deviation from the Overview convention (deliberate).** Overview's `ProviderSection`
wraps unconditionally: `impl ? <div>{impl.render()}</div> : null`. Because `SHOW_AI_NARRATIVE` is
`false` in this codebase, the `pr-synopsis` part returns `null` in production and is the **first**
body part; an unconditional wrapper would emit a leading empty `<div>` under `space-y-8`, adding a
spurious top margin. The view therefore skips the wrapper when a part renders `null`. (Overview
carries the same latent issue for its `overview-synopsis` part; fixing it there is out of scope for
this migration but noted.)

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
  body registry, making this the **first `SectionOverride` in the codebase to carry `sharedParts`
  and body fields (`hidden`/`order`/`versions`/`extraParts`) together**. This is safe, and verified
  against the code rather than assumed:
  - `resolveSection(template, override)` ([resolve.ts:16-73](../../lib/report-sections/resolve.ts))
    reads only the body fields; it never references `override.sharedParts`. A combined override
    resolves the body parts unchanged and leaves `sharedParts` alone for `SharedPartsHeader`.
  - `parseOverride` ([validate.ts:64-88](../../lib/report-sections/validate.ts)) validates body
    fields against the body registry and `sharedParts` against `sharedReg`; `parseReportSectionConfig`
    resolves `registries[key]` for the body registry (now `PR_INFLUENCE_PARTS` for this key).

    Because this combined path is novel, it gets **explicit regression tests** (not just the two-file
    read above): a `validate.ts` unit test for one override carrying both `hidden` and `sharedParts`
    (asserting each validates against the right registry), and a `resolveSection` unit test asserting
    that override returns the body parts unchanged while ignoring `sharedParts`. No framework change
    is needed beyond the registry entry.
- **Template seed & source of truth** — a tracked idempotent script inserts a `section_templates`
  row keyed `peec-ai:pr-influence` matching `PR_INFLUENCE_TEMPLATE`. The view falls back to the code
  constant when the row is absent, so behavior is correct before/after seeding.
  **Once the row is seeded, the DB row is authoritative and the code constant is dormant** (it only
  serves the pre-seed window and local/test runs without a DB). To prevent silent drift, composition
  is edited in exactly one direction: change `PR_INFLUENCE_TEMPLATE`, then re-run the idempotent seed
  script (which overwrites the row to match the constant). The constant is thus both seed source and
  fallback, and the DB never diverges from it after a seed. Editing the constant *without* re-seeding
  is a known no-op, called out in the rollout steps. **The seed script asserts the row it writes
  round-trips equal to `PR_INFLUENCE_TEMPLATE`** (parse the persisted row via `parseSectionTemplate`
  and deep-equal it to the constant), so a malformed seed fails loudly instead of silently diverging.
- **Registry guard (CI-enforced)** — extend the existing
  `components/report-sections/peec-ai/guard.test.ts` pattern to the new registry: every pin the
  template/frozen/shared config references must exist and be `published`; no dangling refs. This test
  runs in CI, which is what makes the view's `lookup(...) → null` fallback safe — a missing or
  unpublished template pin fails the build instead of silently dropping a section at runtime. The
  `null` convention is kept (matching Overview) rather than throwing in the view, because the guard
  makes that null branch unreachable for any pin the template references.

---

## Per-client change (the goal)

A tracked idempotent script — mirroring `scripts/enable-commentary-renaissance.ts` — performs a
read-modify-write on renaissance's `clients.report_section_config`, merging:

```
'peec-ai:pr-influence': {
  ...existing,
  // set-union, NOT replacement — preserve any pre-existing hidden entries
  hidden: [...new Set([...(existing.hidden ?? []), 'sentiment-insights'])],
}
```

Two preservation requirements, both by set-union on the existing override rather than replacement:
- **`sharedParts`** — the existing `[{ id: 'commentary', version: 1 }]` on this key (from
  `enable-commentary-renaissance.ts`) must survive. (`lib/report-sections/mutations.ts` has
  `mergePreservingSharedParts` for the inverse direction; this script preserves `sharedParts` while
  writing body config.)
- **`hidden`** — union into any existing `hidden` array so the write survives a future entry, rather
  than overwriting it. (No other entries exist today, but the by-the-book write is a union.)

The script is idempotent: re-running does not duplicate `hidden` entries, add a second
`sentiment-insights`, or drop the commentary opt-in.

> **Portability caveat (for when this pattern is copied to future migrations).** The `existing.hidden`
> access above is safe only because renaissance is guaranteed a prior commentary override on this
> key, so `existing` is always defined. A future hide-script targeting a client with *no* prior
> override on the key must use optional chaining (`existing?.hidden ?? []`) and tolerate a missing
> override object. Do not copy the non-optional form forward unchanged.

Result: renaissance's PR Influence renders parts 1, 2, 4, 5 (Sentiment omitted); all other clients
render all five.

---

## Parity / testing

The migration has **two independent risk surfaces**, and they need **two different tests** — a
distinction the first draft of this spec elided:

- **(A) Composition** — do the right parts render, in the right order, with the right wrappers,
  given a ctx? Covered by the golden tests below.
- **(B) Derivation** — does the extracted `buildPrInfluenceCtx` produce the *same ctx* the old
  inline code did? The golden tests **cannot** cover this: they start from a hand-built fixture ctx,
  so they assume the ctx is correct. This is the surface the refactor actually threatens (moving
  lines 199-492), so it gets its own test.

**Composition tests (surface A):**

- **Default-composition golden test** — resolve the **real** `PR_INFLUENCE_TEMPLATE` through the
  real `resolveSection` + real `lookup(PR_INFLUENCE_PARTS, …)` (not a hand-listed part array) from a
  frozen fixture ctx, no override, and snapshot the `space-y-8` container. This exercises the full
  template → resolve → registry → render wiring, exactly like Overview's `parity.golden.test.tsx`.
- **Renaissance-override golden test** — same, with `hidden: ['sentiment-insights']` applied →
  snapshot shows Sentiment absent, order otherwise intact.
- **Per-part golden tests** — one per part (matching the Overview `parts/*.golden.test.tsx`
  convention), each rendering `PR_INFLUENCE_PARTS[id][version].render(FIXTURE, resolved)`.

**Combined-config tests (novel path — `sharedParts` + body fields on one key):**

- **`validate.ts` unit test** — parse one override carrying both `hidden: ['sentiment-insights']`
  and `sharedParts: [{ id: 'commentary', version: 1 }]`; assert `hidden` validates against the body
  registry and `sharedParts` against `sharedReg`, with no cross-contamination.
- **`resolveSection` unit test** — call `resolveSection(PR_INFLUENCE_TEMPLATE, override)` with that
  combined override; assert the resolved body parts are correct (Sentiment dropped, order intact)
  and that `sharedParts` is untouched/ignored by the resolver.

**Derivation test (surface B):**

- **`buildPrInfluenceCtx` snapshot test, added on the extraction commit** — mock the data-source
  layer (`getPeecOverview`, `getPRProofData`, `ga4Query`, `getDomainCoverage`, `getUrlCitations`)
  with recorded fixtures, call `buildPrInfluenceCtx`, and snapshot the returned ctx — run with
  `models = null` and with an active model filter. Because the extraction is a standalone first
  commit (see rollout step 1), this snapshot captures the derivation output *before* any parts work,
  so every subsequent step has a real pre/post regression guard on the derivation.
- **Honest limit — the extraction commit itself:** the guard above protects everything *after* the
  extraction, but not the extraction move itself: the *pre-refactor* derivation lives inline in the
  RSC and is not independently callable, so there is no automated diff between "inline in the old
  RSC" and "first `buildPrInfluenceCtx`." That single move's correctness rests on it being a
  **mechanical, logic-free move** plus the mandatory `/verify` on the extraction commit. (Overview
  was migrated the same way — it never had a `buildPeecCtx` derivation test at all.) This residual
  risk is stated, not hidden behind a test that doesn't cover it.
- **`/verify` is required, not optional** (see rollout): drive the running PR Influence tab for a
  real client before and after the extraction commit, confirming identical content, precisely
  because that one commit has no automated diff.

**Accepted structural delta:** the parts convention wraps each *rendered* part in a keyed `<div>`
(`<div key={id@version}>…</div>`), which today's inline body does not. Under the section's
`space-y-8` container these wrappers remain direct children, so vertical spacing and visual layout
are identical — the wrapper `<div>`s are the single accepted difference from the pre-migration DOM.
Parts that render `null` get **no** wrapper (see the empty-wrapper fix in §Architecture), so they
add no gap.

**Test-renderer caveat (RSC + Suspense):** the composition golden tests render in RTL, which does
not resolve async server-component children; the two streaming parts (`pr-synopsis`,
`sentiment-insights`) therefore snapshot as their `<Suspense>` fallback (skeleton), not their
resolved Glean content — and `pr-synopsis` is `null` anyway under `SHOW_AI_NARRATIVE=false`. That is
expected and sufficient for surface A (structure/order/wrappers). The resolved content of those
async children is not part of this migration (their components are unchanged) and is covered by
`/verify`, not the snapshot.

- `tsc --noEmit` clean; existing peec-ai tests pass.

---

## Branch & rollout

- New branch `feat/report-parts-pr-influence` off `dev`. Created at implementation start, not now.
- The current `feat/report-commentary` working tree has unrelated uncommitted `visibility-chart.v2`
  changes; those are left untouched.
- Rollout order at implementation time:
  1. **Extract `buildPrInfluenceCtx` as a standalone mechanical move first** (its own commit, before
     any parts work), and add the derivation snapshot test **on that commit** — so the snapshot
     captures the derivation output *before* the parts refactor. Every later step then has a true
     pre/post regression guard on the derivation, converting the un-diffable move into an
     automated guard for everything after the extraction. (`/verify` still covers the extraction
     commit itself, which has no pre-refactor callable to diff against.)
  2. Build the parts + composition golden tests green; the derivation snapshot from step 1 must
     stay unchanged.
  3. Seed the template row (re-run whenever `PR_INFLUENCE_TEMPLATE` changes); the seed script's
     round-trip assertion must pass.
  4. **`/verify` a non-renaissance client _after_ seeding** — this is the only step that exercises
     the "DB row present, no override, all five parts" path every other client runs in production;
     confirm it matches pre-refactor output.
  5. Run the renaissance hide script.
  6. `/verify` renaissance shows Sentiment gone, the rest intact.

## Risks & mitigations

- **Silent parity drift during extraction (surface B).** This is the top risk. The composition
  golden tests do **not** cover it (they start from a fixture ctx). Mitigations: extraction into
  `ctx.ts` is a mechanical, logic-free move; the `buildPrInfluenceCtx` snapshot test pins the
  derivation going forward; and a mandatory pre/post `/verify` against a real client covers the move
  itself (which has no automated old-vs-new diff, since the pre-refactor logic is inline). Residual
  risk is accepted and explicit rather than papered over.
- **Model-filter behavior.** `models` must thread into `buildPrInfluenceCtx` so per-section tables
  stay model-reactive exactly as today; the synopsis stays model-filter-agnostic (matches current
  behavior, lines 462-467). Covered by fixtures exercising an active model filter.
- **Config-key collision with commentary (novel combined-config path).** Both body config and the
  commentary opt-in live on the same `peec-ai:pr-influence` key — the first override to carry
  `sharedParts` and body fields together. Verified safe against the code (`resolveSection` ignores
  `sharedParts`; `validate.ts` validates each field against its own registry) and pinned by explicit
  `validate.ts` + `resolveSection` regression tests (see §Parity). The hide script must merge, not
  overwrite (set-union on both `hidden` and `sharedParts`); covered by the idempotency + preservation
  assertions.
