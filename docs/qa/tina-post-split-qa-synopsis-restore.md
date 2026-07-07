# QA Pack: Restore AEO Synopsis for Avenue Z (post-split)

Branch: `tina-post-split-qa` (off `dev`). Status: **pre-code, QA phase.** No source
changed yet. Every claim below is cited to a file:line verified by source read on
`origin/dev` @ `178079e`.

Goal in one line: turn the AI synopsis back ON for the Avenue Z client only, on the
three AEO tabs that ever had one (Overview, Content Impact, PR Influence), with an
explicit test that proves it is ON for `avenue-z` and OFF for every other client,
and that gate must pass CI before merge to `dev`.

---

## Gate 0 — Requirement Lock (atomic, each with a pass bar)

| ID | Requirement | Done means (pass bar) |
|----|-------------|-----------------------|
| R1 | Overview synopsis renders for Avenue Z | On `avenue-z`, the Overview tab shows the Glean synopsis card |
| R2 | Content Impact synopsis renders for Avenue Z | On `avenue-z`, Content Impact shows the synopsis card |
| R3 | PR Influence synopsis renders for Avenue Z | On `avenue-z`, PR Influence shows the synopsis card |
| R4 | All 3 render NOTHING for any non-Avenue-Z client | On `renaissance` (and any other slug), all 3 synopsis cards are absent |
| R5 | Organic Social synopsis stays OFF for everyone | No change to `organic-social/index.tsx:47` |
| R6 | AI Summaries report stays OFF for everyone | No change to `app/dashboard/[clientSlug]/reports/page.tsx:48` |
| R7 | DataChat widget stays OFF for everyone | No change to `app/portal/[clientSlug]/reports/page.tsx:251` |
| R8 | Global `SHOW_AI_NARRATIVE` remains `false` | `lib/constants.ts:196` unchanged |
| R9 | Existing golden tests stay green | `overview-synopsis.golden.test.tsx` + `parity.golden.test.tsx` pass |
| R10 | New NEGATIVE (leak) test exists and passes | Helper returns false for `renaissance`, unknown slug, undefined |
| R11 | New POSITIVE test exists and passes | Helper returns true for `avenue-z` |
| R12 | Glean failure degrades gracefully | On Glean error the tab shows "temporarily unavailable", never crashes |
| R13 | Type-check clean | `npx tsc --noEmit` exits 0 |
| R14 | CI gates the PR into dev | `checks.yml` runs `npm test` on the PR and it is green |
| R15 | Deploy proof | The merged commit is live; `avenue-z` prod shows the 3 synopses, another client does not |
| TP | Technical Performance | OUT OF SCOPE. It never had a synopsis (verified across all history). Net-new build, separate task. Pending Thomas's decision. |

---

## Data Contracts (per synopsis)

A synopsis is an LLM-written block. The contract is what guarantees it cannot lie or
crash the page. Same shape for all three; the grounding strength differs.

### Shared contract

- **Output shape:** `{ synopsis: string, actions: string[] }`. Anything else is rejected.
- **Producer:** Glean via `gleanChat(prompt, { saveChat: false })`. No other LLM vendor.
- **Failure contract:** generator THROWS on Glean error / timeout / unparseable output.
  The component-level `try/catch` converts the throw to fallback text
  ("temporarily unavailable"), so a failure never crashes the tab and never fabricates.
- **Isolation contract:** result is cached by a key that includes `clientSlug` +
  `dateRange` (+ provider/context + day). No cross-client or cross-date-range leak as
  long as `clientSlug` is passed (it is).
- **Gating contract (post-change):** renders iff `SHOW_AI_NARRATIVE === true` OR
  `clientSlug === 'avenue-z'`.

### Overview — `lib/peec/synopsis.ts`

- Consumes `PeecOverview | ProfoundOverview` (brand snapshot, top-5 brands/domains,
  competitor averages, citation share, AI sessions), built in `buildContext` (`:18-58`).
- Grounding: **structural only.** `extractJsonObject` (`:63-93`) parses JSON and requires
  `synopsis:string` + `actions:array`, else throws (`:92`). No numeric cross-check, **no retry.**
- Failure caught at `overview-synopsis.tsx:23-28` → fallback (`:40`).
- Cache: `cached('glean','getOverviewSynopsis', [clientSlug,dateRange,provider], ttl 3600)` (`:126-139`).
- Gate: `parts/overview-synopsis.tsx:15`.

### Content Impact — `lib/peec/content-impact-synopsis.ts`

- Grounding: **numeric.** `validateContentImpactSynopsisGrounding` (`:241`) after each Glean
  call, retry loop `MAX_GENERATION_ATTEMPTS = 2` (`:203`), throws on repeated failure (`:253`).
  Numbers rendered to one decimal.
- Failure caught at `content-impact-synopsis.tsx:20-25` → fallback (`:37`).
- Cache key `(clientSlug, dateRange, context)` + day, version `v3-glean-ci-rule2-removed`, ttl 3600 (`:263-268`).
- Gate: `content-impact.tsx:1010`.

### PR Influence — `lib/peec/pr-influence-synopsis.ts`

- Grounding: **numeric.** `validateSynopsisGrounding` + retry (`MAX` 2), throws on failure (`:259`).
  Competitor citation counts rounded to one decimal before the prompt (the fix for Tina's
  long-decimal complaint).
- Failure caught in the PR Influence synopsis component → fallback.
- Gate: `pr-influence.tsx:503`.

---

## Gate 2 — Adversarial break-list (every way this breaks + mitigation)

| # | How it breaks | Likelihood | Mitigation (becomes a test or a rule) |
|---|---------------|-----------|----------------------------------------|
| B1 | Test placed in `lib/peec/**` never runs (not in vitest globs) → false "tests pass" | HIGH (already true for 2 existing tests) | New test MUST live under `components/report-sections/peec-ai/*.test.ts`. Verify with `npx vitest list --filesOnly`. |
| B2 | Gate written as truthy check (`clientSlug &&`) or `startsWith` leaks to other/`avenue-z-2` slugs | MED | Strict `=== 'avenue-z'` (or a `Set` allowlist). Negative test asserts default-deny. |
| B3 | Editing the const or lines 47/48/251 flips DataChat / AI Summaries / Organic Social on | MED | Change ONLY the 3 AEO gate expressions. Those 3 other gates keep referencing bare `SHOW_AI_NARRATIVE`. |
| B4 | Golden tests break: they assert `null` because flag is off | HIGH | Keep fixture slug (`fixture-client`) non-enabled so `null` assertions stay valid. Add a NEW test with `avenue-z` that `vi.mock`s the async child. |
| B5 | Async server component rendered in a sync test → unhandled Promise / Glean called live | HIGH if B4 mishandled | The positive render test must `vi.mock('../overview-synopsis')` (and CI/PR equivalents). Never let real `gleanChat` run in tests. |
| B6 | `clientSlug` undefined at a gate → Ave Z silently OFF and cache key degrades | LOW | Helper treats `undefined` as not-enabled; confirm `ctx.clientSlug` is set on the Overview path. |
| B7 | Child component re-checks `SHOW_AI_NARRATIVE` downstream → gate opens but body still null | RESOLVED | Verified: none of the 3 children re-gate (grep clean). |
| B8 | Two clients share slug `avenue-z` → leak | IMPOSSIBLE | `slug` is `.notNull().unique()` (`schema.ts:119`). |
| B9 | Parity snapshot shifts because synopsis now renders at top | MED | Regenerate snapshot deliberately, eyeball the diff, only the synopsis block should change. |
| B10 | Throw BEFORE the await (bad `context` prop shape) is not caught by the component try/catch | LOW | Keep context construction pure; covered by tsc + the existing typed context. |

---

## Gate 3 — Test spec (write BEFORE code)

Location constraint (from B1): all new tests go under
`components/report-sections/peec-ai/`. Framework: vitest (`test` / `expect`).

Proposed gate helper (Gate 4 will implement): `showAeoSynopsis(clientSlug?: string): boolean`
in `lib/constants.ts`, returning `SHOW_AI_NARRATIVE || clientSlug === 'avenue-z'`.
The three other surfaces keep using the bare `SHOW_AI_NARRATIVE`.

1. **Helper unit test** — `components/report-sections/peec-ai/aeo-synopsis-gate.test.ts`
   - POSITIVE: `showAeoSynopsis('avenue-z') === true`
   - NEGATIVE: `showAeoSynopsis('renaissance') === false`
   - NEGATIVE: `showAeoSynopsis('some-other-client') === false`
   - NEGATIVE: `showAeoSynopsis(undefined) === false`
   - GUARD: if implemented as an allowlist, assert it equals exactly the intended set,
     so an accidental extra entry fails the build.
2. **Overview render test (positive path)** — renders the PartImpl with `clientSlug: 'avenue-z'`,
   `vi.mock('../overview-synopsis')` to a stub, asserts the stub renders (not null).
3. **Overview render test (negative path)** — existing golden test stays as-is with the
   non-enabled fixture slug; assert it still renders `null`.
4. Confirm collection: `npx vitest list --filesOnly | grep aeo-synopsis-gate` returns the file.

---

## Gate log / sign-off

| Gate | State | Evidence |
|------|-------|----------|
| 0 Requirement lock | OPEN | TP decision pending; R1-R15 locked above |
| 1 Source truth | DONE | 3 deep reads + greps, all cited above |
| 2 Adversarial review | DONE | B1-B10 above |
| 3 Test spec | DRAFTED | above; awaiting Thomas approval |
| 4 Implement | NOT STARTED | code is last |
| 5 Verify (source+runtime+suite) | NOT STARTED | |
| 6 Deploy proof | NOT STARTED | |
