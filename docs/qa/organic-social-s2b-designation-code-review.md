# S2-B — Organic Social Influencer designation — code review record

> **Scope.** Module **S2-B** of the Organic Social Top Content overhaul (plan
> `docs/superpowers/plans/2026-07-23-organic-social-spec2-top-content.md`, tasks B1–B8).
> Branch `feat/organic-social-influencer-designation`, stacked on
> `feat/organic-social-top-content` (S2-A).
>
> **Diff range under review:** `c7db045..6fc719f` — six commits, no unrelated code:
> B1 table+migration · B2–B4 pure cores · B5 DB layer · B6 server action · B7 Instagram UGC · B8 top-content@2.
>
> **This document changes no code.** Reviewers: **Paul** and **Thomas**.

---

## §1 How it works

Adds a staff-editable per-post **Organic / Influencer** designation, a separate Influencer
section below the owned ranking, and the Instagram UGC source.

- **Storage** — `post_designations` (migration 0019): one row per `(client_id, post_id)`,
  `post_id` = Dash's own post id (stable + unique in CONTENT). Absence is meaningful: *no row =
  never manually designated*, which lets the `#ad` suggestion apply; a stored row always wins,
  including a stored `'organic'` that **un-marks** an `#ad`-suggested post. Mirrors
  `report_commentary` in shape/indexing.
- **Resolution order** (`partition.ts` `resolveDesignation`): **stored row → `#ad` suggestion →
  `'organic'`.** `partitionPosts` splits the engagement-sorted pool into `owned` + `influencer`,
  stamping each post's resolved `sourceType`. Influencer posts never compete in the owned ranking.
- **The `#ad` rule** (`suggest.ts`): `/#(ad|sponsored)\b/i` — a *complete hashtag token*,
  case-insensitive, matched against the **caption** (findings §2.1: the tag lives in caption text,
  not the sparse `hashtags` field). `#adventure` / `#advice` deliberately do **not** match.
- **Permissions** — `canSetDesignation(role)` delegates to `isInternalStaff` (one source of truth,
  matching `canEditDashboard`). The toggle is **invisible** (not disabled) to `CLIENT_*`, and the
  server action **re-checks** the role — a hidden control is not an authorization boundary.
- **Write path** — `setDesignationAction` (`'use server'`): session → `canSetDesignation` →
  `authorizeDesignation` (pure, validates postId/designation) → `getClientBySlug` → `setDesignation`
  (upsert, overwrite on conflict) → `revalidateTag('db','max')`.
- **Instagram UGC** (`fetchTopContent`): CONTENT returns OWNED only, so influencer posts are absent.
  A second call to `INSTAGRAM_UGC` + `UGC_TOTAL_ENGAGEMENTS` pulls them in (Instagram only —
  `FACEBOOK_UGC`/`LINKEDIN_UGC` return 400). Live probe confirmed UGC keys engagement under
  `engagements_public` (same as owned IG), so `normalizePost(_, 'INSTAGRAM')` handles it unchanged.
- **Composition** — the Influencer section renders **inside** the `top-content` part as a version
  bump `@1 → @2` (Spec 1 §6 forbids adding a part to an existing template row). v1 stays registered
  + published; both template pins move to `@2`. No `section_templates` DB seed (that is Spec 1's M4).

## §2 Verification method

- Static anchors confirmed at the stated lines.
- Executed logic (pure cores + orchestration + UGC fixture) via `npx vitest run` — **373 passed
  (50 files)**; `npx tsc --noEmit` clean; `npm run db:generate` produced migration 0019 (CREATE
  only, no DROP — inspected).
- The Instagram-UGC field claim is **not** synthetic — it was captured from a **live** probe
  (brand 26952): 17 UGC posts, `source_type: UGC`, `engagements_public` populated; a 3-post fixture
  is committed and asserted.
- External/live triggers deferred to B9 `/verify`: the DB round-trip (persist + reload), the
  `CLIENT_*` invisibility + server rejection, and that Facebook `#ad` posts sit in Organic until
  manually designated (decision 5).

## §3 Findings

Sev: **●** correctness · **○** cleanup/convention. Status: CONFIRMED / PLAUSIBLE.

| # | Sev | Status | Location | Finding |
|---|-----|--------|----------|---------|
| 1 | ○ | CONFIRMED | `parts/top-content.tsx` `TopContentV2Section` | The owned and influencer buckets each render a full `TopContent`, so the interim view shows **two "Top Content" headings and two sort-toggle rows**. Cosmetic; S2-C's card gallery replaces this table. |
| 2 | ○ | CONFIRMED | `designation-toggle.tsx` | The toggle is **two-phase**: the optimistic flip changes only the button label; the post does not **relocate** between the Owned/Influencer sections until `revalidateTag('db')` re-renders the RSC (re-runs `partitionPosts`). Correct, but a viewer sees the label change before the row moves. |
| 3 | ○ | CONFIRMED | `parts/top-content.tsx` `groupBucket` | Platform ordering uses the static canonical `CHANNELS` order, not the client's configured allowlist (unlike `getTopContent`, which orders by `dashClientFor().channels`). Harmless — posts from unconfigured channels never exist — but the order is fixed rather than client-driven. |
| 4 | ○ | PLAUSIBLE | `suggest.ts` `AD_TOKEN` | `#ads` (plural) does **not** match (`\b` sees no boundary between `ad` and `s`). Intended per "complete token `#ad`", but worth confirming with Tina that `#ads` should not auto-flag. |
| 5 | ● | PLAUSIBLE | migration 0019 / B5 / B8 | **Migration before code.** `post_designations` must be applied to each env **before** the B5/B8 reading code is live, or the section blanks through its error boundary (commentary precedent). Deploy-ordering, not a code defect. |
| 6 | ○ | CONFIRMED | B7 (Views/Impr.) | UGC video (Reel) posts return `impressions = 0` (with `reach` populated), so a UGC Reel shows `0` in the Views/Impr. column — same impressions-definition caveat flagged in S2-A. |

## §4 Detail

**#1** Two stacked `TopContent` tables each render their own `<h2>Top Content</h2>` + view toggle.
*Fix:* interim-only; either pass a "no header/toggle" prop for the influencer instance or accept it
until S2-C removes the table. Low priority.

**#2** `DesignationToggle` sets local state optimistically (label) and calls the action; the
Owned↔Influencer relocation happens on the server re-render after `revalidateTag`. *Fix:* acceptable;
if instant relocation is wanted, lift the designation into a client-side optimistic store — not worth
it for the interim table (S2-C's card owns the toggle).

**#3** `groupBucket(posts, channel)` passes `channel ? [channel] : [...CHANNELS]` as `allowed`.
*Fix:* if per-client channel ordering matters, thread `dashClientFor().channels` through; otherwise
leave (canonical order is fine and avoids a DB call in the golden path).

**#5** Highest-value operational item. Note the migration-before-code step explicitly in the PR/deploy.

## §5 Follow-ups

**Blocks a correct deploy:**
- **#5** — apply migration 0019 before the S2-B code is live in each env. Call it out in the PR body.

**Needs a live call (B9 `/verify`, before merge):**
- Round-trip persistence (toggle → reload), `CLIENT_*` invisibility + forged-call rejection, and that
  Facebook `#ad` posts stay Organic until manually designated (decision 5).

**Decide with Tina:**
- **#4** — should `#ads` (plural) auto-flag? Current answer: no.

**Cleanup (optional):**
- **#1** duplicate table header/toggle · **#2** two-phase relocation · **#3** static platform order ·
  **#6** UGC-Reel `impressions = 0` (tracked with the S2-A impressions-definition caveat).
