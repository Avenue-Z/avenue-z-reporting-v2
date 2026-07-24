# S2-C — Organic Social creative + reproducible snapshot — code review record

> **Scope.** Module **S2-C** of the Organic Social Top Content overhaul (plan tasks C1–C7).
> Branch `feat/organic-social-creative-snapshot`, stacked on
> `feat/organic-social-influencer-designation` (S2-B).
>
> **Diff range under review:** `f55b405..a6b6453` — seven commits: C2 fixture · C3 resolveCreative ·
> C4 snapshot table+migration · C5 snapshot helpers · C6 freeze rule · C1 engagement-rate map ·
> C7 card gallery.
>
> **This document changes no code.** Reviewers: **Paul** and **Thomas**.

---

## §1 How it works

Renders the creative as a card gallery (replacing the interim table inside `top-content@2`),
backed by a reproducible metadata snapshot.

- **Creative** (`resolveCreative`) — read from the post's **top-level** `image`/`video` (NOT the
  channel sub-object; confirmed via a live fixture). Image → `image.sizes.medium_square.url` thumb +
  `original` full; video → `video.sizes.original.url` (`.mp4`) src + `video.thumbnails.medium_square`
  poster; a carousel carries its cover frame under `image`, so it resolves to an image (the carousel
  **badge** is driven by `mediaType` in the card). All four channels expose this same top-level
  structure (FB 93/93, LI 103/103, X 97/97, IG confirmed) — so `resolveCreative` is channel-agnostic.
  Returns `null` only on genuine failure → the card shows a **placeholder**, never a hidden row.
- **Snapshot** (`top_content_snapshots`, migration 0020) — one row per
  `(client, channel, resolved window, post)`; stores the frozen `TopContentPost` facts as `jsonb`
  (URLs, **not** media bytes); `sourceType` is excluded so **designations stay live**.
- **Freeze rule** (`fetchTopContentFrozen`, keyed on **resolved** dates): `range_end >= today` ⇒
  **open** → live fetch + overwrite the snapshot; **closed** + snapshot exists ⇒ read it (no live
  query); closed + absent ⇒ fetch once + insert. `today` is injectable (the one clock input).
  Overview (channel `null`) snapshots under the sentinel `'ALL'`.
- **Card** (`PostCard`) — creative (top, square; video `controls`, **no autoplay**) · carousel badge ·
  date · caption (3-line clamp) · metric list **Effectiveness · Engagement Rate · Engagements ·
  Views/Impr.** (active-sort emphasised) · View-post link · internal-only designation toggle. On a
  creative load error (`onError`) the media area swaps to a placeholder and the card stays.
- **Engagement rate** (`CONTENT_ENGAGEMENT_RATE_FIELD`) — per channel, like engagement: IG/FB
  `engagement_rate_public`, LI/X plain `engagement_rate` (they expose no `*_public`).

## §2 Verification method

- Static anchors confirmed. Pure logic executed: `npx vitest run` → **383 passed (53 files)**;
  `npx tsc --noEmit` clean; migration 0020 inspected (CREATE only, no DROP).
- `resolveCreative` is TDD'd against a **live-captured** fixture (image/video/carousel). The
  freeze-rule decision table is unit-tested with injected deps (no DB). Cross-channel creative
  presence confirmed by a **live probe** of all four channels.
- Deferred to C8 `/verify` (live): reproducibility of a closed month across reopens; that a rolling
  preset still refreshes; the placeholder on a simulated 404; and the CDN-retention probe.

## §3 Findings

Sev: **●** correctness · **○** cleanup/convention. Status: CONFIRMED / PLAUSIBLE.

| # | Sev | Status | Location | Finding |
|---|-----|--------|----------|---------|
| 1 | ● | PLAUSIBLE | `content-types.ts` `CONTENT_ENGAGEMENT_RATE_FIELD` | **GATE (C1) not fully cleared.** The Instagram rate variant (`_public` vs `_impressions` vs `_views`) is **not yet visually confirmed** against Dash's card. `_public` is the flagged default; if Dash's card differs, the card shows a wrong rate. Blocks sign-off, not the build. |
| 2 | ○ | PLAUSIBLE | C8 (CDN retention) | "Reproducible" = a metadata snapshot + **live** creative from a frozen CDN URL. If Dash purges an asset, the card correctly shows the placeholder — but long-term CDN retention is **unverified** (informational C8 probe; informs how we describe reproducibility to clients). |
| 3 | ○ | CONFIRMED | `snapshot.ts` `writeSnapshot` | Non-atomic: sequential `delete` → `insert` (neon-http has no transactions; the repo uses none). Tiny window, per-(client,channel,range), touched by a single render. |
| 4 | ○ | CONFIRMED | `organic-social/top-content.tsx` (interim table) | The B8 `canEdit` toggle **column** on the interim `TopContent` table is now **dead in v2** — C7 replaced the table with `PostCard` (the toggle now lives on the card). Harmless (optional, backward-compatible) but prunable once S2-B/S2-C land together. |
| 5 | ○ | CONFIRMED | `post-card.tsx` `cardMetrics` | Display assumes `effectiveness` is 0–100 (`pct(x)`) and `engagementRate` is a fraction (`pct(x*100)`). Confirmed for Instagram; C8 should magnitude-check the other channels. |

## §4 Detail

**#1 (C1 gate)** `normalizePost` reads `CONTENT_ENGAGEMENT_RATE_FIELD[channel]`. IG has three rate
variants; the correct one is whichever Dash's Top Performing Posts card displays. *Fix:* in A5/C8,
compare the fixture post's card rate to the three IG fields; if not `_public`, change **only** the
INSTAGRAM entry. Until then the rate is a flagged default, not silently chosen.

**#2** The snapshot stores CDN URLs, not bytes (decision 8). *Fix:* run the C8 retention probe
(`HEAD` a known-deleted post's saved URL over time) and record it in the snapshot-design appendix.

**#3** *Fix:* acceptable given the access pattern; revisit only if concurrent renders of the same
closed window become common.

**#4** *Fix:* when S2-B + S2-C are both merged, drop the `canEdit`/`clientSlug` params + designation
column from `organic-social/top-content.tsx` (the interim table) — or remove the interim table
entirely, since v2 no longer uses it. Left in place here per surgical-changes (it is S2-B's code).

## §5 Follow-ups

**Blocks sign-off (live, C8/A5):**
- **#1** — confirm the Instagram engagement-rate variant against Dash's card (C1 gate).
- Reproducibility: a named closed month is stable across reopens; a rolling preset still refreshes;
  the placeholder shows on a purged asset (not a gap).

**Deploy:**
- Apply **migration 0020** (`top_content_snapshots`) before the C6 reading code is live (migration
  before code).

**Informational:**
- **#2** — CDN-retention probe result → snapshot-design appendix.
- Note on the PR that a **frozen** Top Content ranking sits beside **live**-recomputed KPI cards
  (snapshot §6 — deliberate: the snapshot covers Top Content only).

**Cleanup (when S2-B+S2-C land):**
- **#4** interim-table toggle column · **#5** magnitude-check card metric scaling per channel.
