# Organic Social — M4 (seed `section_templates`) — Code Review Record

**Scope under review:** PR [#178](https://github.com/Avenue-Z/avenue-z-reporting-v2/pull/178),
branch `feat/organic-social-m4-seed-templates`, diff range **`406f195..aa1d7f1`** (1 commit) off
`origin/integration/organic-social` (`406f195` = the M3 `/verify` sign-off, #177). The range
touches exactly two files: `scripts/seed-section-templates.ts` (+6) and the plan doc
`docs/superpowers/plans/2026-07-30-organic-social-M4-seeding.md` (+156). No other code is in scope.

**This document changes no code.** It is the pre-merge comprehension-gate record for Spec 1's final
module (M4, §9 step 9). Paul's inline review on PR #178 and the two remaining gated steps — the
real DB seed and the `/verify` render check (both blocked on confirming the target database, Spec 1
§10) — are tracked in §5 as the open gates; this record documents what the change is, why it is
safe, and how that was verified offline.

Reviewers: Paul.

---

## §1 How it works (comprehension — where the composition comes from)

M4 seeds the two `section_templates` DB rows for Organic Social. It is deliberately the **last**
module (Spec 1 §6 / §10): once a `section_templates` row exists, no supported path adds a *new*
part to it, so the rows are written only now that every part they reference exists (`follower-graph`
from M3, `top-content@2` from Spec 2).

**The one change.** `scripts/seed-section-templates.ts` had a one-entry `SEED` array (`peec-ai`).
M4 imports the two Organic Social template constants and appends two entries:

```
organic-social          -> ORGANIC_SOCIAL_TEMPLATE          = [platform-headlines@1, engagement-trend@1, top-content@2]
organic-social:platform -> ORGANIC_SOCIAL_PLATFORM_TEMPLATE = [platform-headlines@1, follower-graph@1, engagement-trend@1, top-content@2]
```

The templates are **imported, not hand-typed** — the seeded row is the exact object the view
renders from, so the row cannot drift from the code. `ORGANIC_SOCIAL_PLATFORM_TEMPLATE` is itself
*derived* from `ORGANIC_SOCIAL_TEMPLATE.order` (with `follower-graph` spliced in at index 1) in
`template.ts`, so Overview and the platform page also can't drift from each other.

**What the seed script does with each entry** (all pre-existing M1 machinery, unchanged by M4):
for each `{ slug, template }` it (1) looks up `REGISTRIES[slug]` and **parse-validates** the
template against it (`parseSectionTemplate`) — a reference to a missing or unpublished pin throws
here, before any write; (2) `SELECT`s the existing row; (3) if a row exists, it **never
overwrites** — it only `isDeepStrictEqual`-compares and reports drift (`promoteToTemplate` + manual
SQL own divergence, Spec 1 §6); (4) otherwise `INSERT … onConflictDoNothing`. `--check` makes the
whole run read-only (an absent row is reported as drift, never inserted).

**Why seeding changes nothing a client sees.** The view
(`components/report-sections/organic-social/index.tsx:46-58`) resolves
`key = channel ? 'organic-social:platform' : 'organic-social'`, then
`template = (await getSectionTemplate(key)) ?? CODE_TEMPLATES[key]` inside a `try/catch` that
degrades to the code template on any DB error. Before M4, `getSectionTemplate` returns `null` for
both keys → both views resolve through `CODE_TEMPLATES`. After M4, it returns the seeded row —
**derived from the same constants**, so the resolved composition is deep-equal and the render is
byte-identical. The seed makes the DB the *source*, without changing the *value*.

**The consequence a reviewer/client question turns on.** After M4, for any client whose row
exists, the **DB row is authoritative over the code constant** for structure: editing
`ORGANIC_SOCIAL_TEMPLATE.order` in code will no longer change what those clients render (the seed
is insert-if-absent; the view prefers the DB row). Structural changes then go through
`promoteToTemplate` (version bumps — supported) or manual SQL (add/remove/reorder — the §6/§10
lock-in). This is by design, not a regression; it is the whole reason M4 runs last.

---

## §2 Verification method

- **Static anchors** confirmed at the cited `file:line` in the reviewed tree (`aa1d7f1`):
  the SEED array and import in `scripts/seed-section-templates.ts:7-20`; the two exported constants
  in `components/report-sections/organic-social/template.ts:4,21`; the schema in
  `lib/db/schema.ts:234-236` (`section_templates`, PK `section_slug` free-text, `composition` jsonb
  typed `SectionTemplate`); the view's key/resolve in
  `components/report-sections/organic-social/index.tsx:46,54-58`.
- **Slug ↔ view-key match (the one correctness-relevant question).** The two seeded slugs are
  **exactly** the two keys `getSectionTemplate` is ever called with (`'organic-social'`,
  `'organic-social:platform'`) — confirmed by reading the view. A mismatched slug would seed an
  inert row; verified this is not the case.
- **Parse-before-insert, executed offline (no DB).** A throwaway `tsx` probe imported the two
  constants and the live `REGISTRIES`, and ran `parseSectionTemplate` on each — proving both
  compositions reference only pins that exist and are `published` (`follower-graph@1`,
  `top-content@2` included). Output:
  ```
  OK  organic-social: platform-headlines@1, engagement-trend@1, top-content@2
  OK  organic-social:platform: platform-headlines@1, follower-graph@1, engagement-trend@1, top-content@2
  ```
  (Run with a dummy `DATABASE_URL` so the module graph loads without a network connection — the
  Neon client only connects on query, and parse issues none.)
- **Type-check.** `npx tsc --noEmit` — clean.
- **`--check` dry run against the DB — DEFERRED to the seed step.** Because it needs `.env.local`,
  which is intentionally absent from this fresh worktree, and because even the read-only `--check`
  connects to a real database, it is run together with the gated seed (§5) once the target DB is
  confirmed. Note for whoever runs it: `--check` exits non-zero *by design* until the rows are
  seeded (it reports the two absent rows), and its exit code can also reflect a pre-existing
  `peec-ai` promotion — read the `[drift]` lines, don't gate on the exit code alone.
- **Manual `/verify` — PENDING (gated).** Confirming `getSectionTemplate('organic-social')` and
  `('organic-social:platform')` return non-null rows and that a client's Organic Social Overview
  and a platform subpage render identically to before, now DB-sourced. Runs after the real seed
  against the confirmed DB; recorded here on completion.

---

## §3 Findings

Sev: **●** correctness · **○** cleanup/convention/efficiency.
Status: **CONFIRMED** (proven in-tree) · **PLAUSIBLE** (code assumption confirmed, external trigger
unverified). Locations as reviewed (`aa1d7f1`).

| # | Sev | Status | Location | Finding |
|---|-----|--------|----------|---------|
| — | — | — | — | No correctness or cleanup findings. The change is a two-entry extension of a list whose per-entry handling was reviewed and merged with M1; parse-before-insert, slug↔view-key match, and `tsc` all verified clean (§2). |

The review deliberately did **not** manufacture findings. The one item that could read as a defect
— that seeding freezes the composition against future code edits — is the **designed** §6/§10
lock-in behavior, documented in §1 as the key comprehension point rather than filed as a bug.

---

## §4 Detail

Nothing to detail beyond §1. The diff adds one `import { ORGANIC_SOCIAL_TEMPLATE,
ORGANIC_SOCIAL_PLATFORM_TEMPLATE }` and two `SEED` entries; the existing `main()` loop handles them
with no new branch. The comment above the array (`Add a row here ONLY when every part it references
exists`) already carries the §10 residual-risk warning about early seeding requiring manual-SQL
recovery, so no new comment was needed.

---

## §5 Follow-ups (disposition)

**No code follow-ups.** The remaining work is the two operational gates, not fixes:

- **Real seed — GATED on target-DB confirmation.** Run `npm run db:seed-section-templates` (writes)
  only after Paul confirms which database (staging Neon branch vs prod). Expected: two `Seeded …`
  lines, `peec-ai` skipped. Then re-run `-- --check` to confirm convergence (no `[drift]` for the
  two new rows) — the non-tautological proof the rows match the constants.
- **`/verify` — GATED on the seed.** Confirm non-null DB rows for both keys and byte-identical
  render (Overview + one platform subpage) on a live client. Post the result on #178.
- **Merge gate.** Paul's review sign-off on #178 + green CI, then merge to
  `integration/organic-social`. Per M1–M3 practice the reviewer is Paul (CLAUDE.md also names
  Thomas, who has not reviewed M1–M3); confirmed for this module.

**Post-change gate state:** `tsc --noEmit` clean; parse-before-insert verified offline for both
rows; slug↔view-key match confirmed. The DB write and `/verify` are the only things outstanding,
and both are deliberately gated on the target-database confirmation (Spec 1 §10).
