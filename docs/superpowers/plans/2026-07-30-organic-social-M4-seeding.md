# Organic Social — Module M4 (seed section_templates) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Seed the two `section_templates` DB rows for Organic Social (`organic-social` and `organic-social:platform`) from the code constants in `template.ts`, so both views resolve their composition from the DB instead of the `CODE_TEMPLATES` first-boot fallback — with the rendered report unchanged.

**Architecture:** M4 is Spec 1 §9 step 9 — the last module, gated on Gate C ("the composition is final, after Spec 2"), now satisfied since Spec 2 (#172) and M3 (#174) are merged into `integration/organic-social`. The seed script (`scripts/seed-section-templates.ts`) already carries all the machinery it needs (parse-before-insert against `REGISTRIES`, insert-if-absent, `--check` read-only drift report) — M1 built it. M4 adds exactly two rows to its `SEED` array plus one import. No new code paths, no schema change.

**Tech Stack:** TypeScript (strict), Drizzle ORM + Neon Postgres, `tsx` runner, the in-repo report-parts framework (`lib/report-sections/*`).

## Global Constraints

- **Base branch.** Cut the M4 feature branch off **`integration/organic-social`** (currently `406f195`), which has M1 + M2 + M3 (#174) + Spec 2 (#172) merged. This departs from Spec 1's literal "off `dev`" wording; the departure matches the actual M1/M2/M3 practice and is **required** — `dev` lacks the `organic-social` parts registry, so `parseSectionTemplate` (parse-before-insert) would throw and the seed could neither validate nor run there. (Flagged to and confirmed by Paul.)
- **Reviewer.** Paul only, matching actual M1–M3 practice (CLAUDE.md also names Thomas, who has not reviewed M1–M3). Confirmed with Paul for this module.
- **Insert-if-absent stays (Spec 1 §6).** The seed is `onConflictDoNothing`, NOT `onConflictDoUpdate`. The code constant is a first-boot fallback only; once a row exists, `promoteToTemplate` + manual SQL own divergence. M4 does not change this contract — it only extends the `SEED` list.
- **Seed the FINAL composition (Gate C).** The rows written must be the post-Spec-2 / post-M3 compositions already defined in `template.ts` on `integration/organic-social`:
  - `organic-social` → `ORGANIC_SOCIAL_TEMPLATE` = `[platform-headlines@1, engagement-trend@1, top-content@2]`
  - `organic-social:platform` → `ORGANIC_SOCIAL_PLATFORM_TEMPLATE` = `[platform-headlines@1, follower-graph@1, engagement-trend@1, top-content@2]`
  Do NOT hand-type these — import the constants, so the seeded row can never drift from what the view renders.
- **Composition lock-in is why this is last (Spec 1 §6 / §10).** Once a `section_templates` row exists, no supported path adds a NEW part to it (verified against `mutations.ts:113` `computePromotion` = `template.order.map(...)`, and `seed-section-templates.ts` `onConflictDoNothing`). Recovery from a wrong composition is manual SQL. Therefore the row must not be written until every part it references exists — which is now true (`follower-graph@1`, `top-content@2` both present in `ORGANIC_SOCIAL_PARTS`).
- **The real DB write is gated on explicit human confirmation of the target database.** Seeding is a hard-to-cleanly-undo write (recovery = manual SQL per Spec 1 §10). The `--check` dry run is safe to run autonomously; the actual insert (`db:seed-section-templates`, no `--check`) MUST NOT run until Paul confirms which database it targets (staging vs prod Neon branch). See Task 3.
- **Scope discipline.** M4 is one step. Do not touch `template.ts`, the registries, the parts, or any component. The only source edit is the `SEED` array + its import in `scripts/seed-section-templates.ts`.
- **Sources of truth:** Spec 1 (`docs/superpowers/specs/2026-07-21-organic-social-parts-subpages-design.md`) §6 (seeding = insert-if-absent, must be last; the `promoteToTemplate` limitation), §9 "Module M4" (one-step scope), §10 "Composition lock-in" (residual: early seed → manual SQL recovery), §7 (the view's `getSectionTemplate(key) ?? CODE_TEMPLATES[key]` resolution the seed makes DB-authoritative).

---

## File Structure

- **Modify:** `scripts/seed-section-templates.ts` — extend the `SEED` array from one entry to three; add one import from `template.ts`. No other file changes.

There is no test file. The seed script has no unit test today (peec-ai's entry has none either); its correctness gate is the built-in `--check` self-report plus `tsc`, and the end-to-end gate is `/verify` against a live DB row. Adding a bespoke vitest harness that stands up a fake Drizzle client would be new scope beyond this module and is explicitly out.

---

### Task 1: Extend the SEED array to the two Organic Social rows

**Files:**
- Modify: `scripts/seed-section-templates.ts:7` (imports) and `:13-15` (the `SEED` array)

**Interfaces:**
- Consumes: `ORGANIC_SOCIAL_TEMPLATE`, `ORGANIC_SOCIAL_PLATFORM_TEMPLATE` from `@/components/report-sections/organic-social/template` (both `SectionTemplate`, already exported); `REGISTRIES['organic-social']` and `REGISTRIES['organic-social:platform']` (both present, → `ORGANIC_SOCIAL_PARTS`).
- Produces: nothing new — the script's existing `main()` loop already handles any `SEED` entry generically (parse → check-existing → insert-if-absent).

- [ ] **Step 1: Add the import**

Add alongside the existing `PEEC_TEMPLATE` import (after line 7):

```ts
import {
  ORGANIC_SOCIAL_TEMPLATE,
  ORGANIC_SOCIAL_PLATFORM_TEMPLATE,
} from '@/components/report-sections/organic-social/template'
```

- [ ] **Step 2: Extend the SEED array**

Replace the single-entry array (lines 13–15) with:

```ts
const SEED: { slug: string; template: SectionTemplate }[] = [
  { slug: 'peec-ai', template: PEEC_TEMPLATE },
  { slug: 'organic-social', template: ORGANIC_SOCIAL_TEMPLATE },
  { slug: 'organic-social:platform', template: ORGANIC_SOCIAL_PLATFORM_TEMPLATE },
]
```

The existing `// Add a row here ONLY when every part it references exists (M4 adds organic-social).` comment above the array stays — it now describes a completed step and the standing rule for future rows.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: clean. (Confirms the imports resolve and the two constants are `SectionTemplate`.)

- [ ] **Step 4: Commit**

```bash
git add scripts/seed-section-templates.ts docs/superpowers/plans/2026-07-30-organic-social-M4-seeding.md
git commit -m "feat(organic-social): M4 — seed section_templates rows for organic-social + :platform"
```

---

### Task 2: Dry-run the seed with `--check` (read-only, no DB write)

**Files:** none — this runs the script in its read-only mode.

**Interfaces:**
- Consumes: a reachable database via `.env.local` (`db:seed-section-templates` passes `--env-file=.env.local`). `--check` only `SELECT`s; it never inserts.

- [ ] **Step 1: Run the read-only drift report**

Run: `npm run db:seed-section-templates -- --check`

Expected behaviour (before the real seed has ever run against this DB):
- `peec-ai` — its row already exists → either silent (converged) or a `[drift]` line if the row was promoted/edited. Either is fine; it is not M4's concern.
- `organic-social` — `[drift] 'organic-social' row is absent (a non-check run would insert it).`
- `organic-social:platform` — `[drift] '...:platform' row is absent (...).`
- Non-zero exit (`--check: N row(s) diverge from / are absent ...`).

This proves two things without writing anything: (a) parse-before-insert **passed** for both new rows (a bad pin would have thrown *before* the absent-row report), and (b) the rows are not yet present. A parse failure here means a part/version in the template is missing or unpublished — STOP and reconcile `template.ts` vs the registry; do not proceed to Task 3.

- [ ] **Step 2: Record the `--check` output** verbatim for the review-record doc (§2 Verification method) and for the PR description.

---

### Task 3: Seed for real — GATED on Paul confirming the target database

**Files:** none — this is the authoritative DB write.

> ⚠️ **Do NOT run this task autonomously.** The insert is hard to cleanly undo (recovery = manual SQL, Spec 1 §10). It runs only after Paul explicitly says which database to target (staging Neon branch vs prod). The `/verify` step depends on this having run against the DB the app reads.

- [ ] **Step 1: Confirm the target DB with Paul** — which `.env.local` / Neon branch. Do not assume.

- [ ] **Step 2: Run the seed (writes)**

Run: `npm run db:seed-section-templates`
Expected:
```
Seeded 'organic-social' (insert-if-absent).
Seeded 'organic-social:platform' (insert-if-absent).
Seed complete.
```
(`peec-ai` is skipped — already present.)

- [ ] **Step 3: Re-run `--check` to confirm convergence**

Run: `npm run db:seed-section-templates -- --check`
Expected: no `[drift]` line for `organic-social` or `organic-social:platform`, and — if `peec-ai` was already converged — exit 0. This is the non-tautological confirmation the rows now match the code constants.

---

### Task 4: `/verify` the DB-row path end to end

**Files:** none — verification only.

- [ ] **Step 1: Confirm the rows resolve non-null from the DB.** In a throwaway `tsx` probe (or Drizzle Studio / Neon SQL editor), confirm `getSectionTemplate('organic-social')` and `getSectionTemplate('organic-social:platform')` (`lib/db/queries.ts:255`) each return a non-null `SectionTemplate` whose `order` matches the constant (`top-content@2`; platform has `follower-graph@1` second).

- [ ] **Step 2: Confirm render parity.** Load a client's Organic Social Overview and one platform subpage (e.g. renaissance, Instagram). They must render identically to before M4 — same parts, order, labels, numbers — now sourced from the DB row rather than the `CODE_TEMPLATES` fallback. The view code (`index.tsx` §7) is `getSectionTemplate(key) ?? CODE_TEMPLATES[key]`; since the seeded row is derived from the same constant, the resolved composition is byte-identical, so this is a no-op to the eye. Capture the before/after as the `/verify` evidence.

- [ ] **Step 3: Record `/verify` result** in the review-record doc and the PR.

---

## Self-Review

**1. Spec coverage.** Spec 1 §9 M4 = "Seed the two `section_templates` rows. `/verify` the DB-row path." → Task 1 (seed rows) + Task 3 (write) + Task 4 (`/verify`). §6 "insert-if-absent stays; seed the complete composition last" → Global Constraints + Task 1 imports the final constants. §10 "recovery is manual SQL; worth a comment in the seed script" → the existing `ONLY when every part it references exists` comment already carries this; no new comment needed. Covered.

**2. Placeholder scan.** No TBD/TODO; the one code edit is shown in full; the `--check` and real-seed commands are exact.

**3. Type consistency.** `ORGANIC_SOCIAL_TEMPLATE` / `ORGANIC_SOCIAL_PLATFORM_TEMPLATE` are the exact exported names in `template.ts`; both are `SectionTemplate`, matching the `SEED` element type. `REGISTRIES` keys `'organic-social'` / `'organic-social:platform'` match the slugs. `getSectionTemplate` returns `Promise<SectionTemplate | null>`.

---

## Execution Handoff

This is a two-line source change plus a gated DB write; **inline execution in this session** (superpowers:executing-plans) is the right call rather than dispatching subagents. Task 3 is the hard human gate — everything up to and including Task 2 (`--check`) is safe to run now; the real seed waits on Paul's DB confirmation.
