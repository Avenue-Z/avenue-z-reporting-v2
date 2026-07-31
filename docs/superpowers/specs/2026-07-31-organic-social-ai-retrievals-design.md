# Organic Social — AI Retrievals (Change 4, re-interpreted)

**Status:** Design — pending review
**Date:** 2026-07-31
**Author:** Paul Ramirez (with Claude)
**Supersedes:** the original Change 4 as literally specced ("match each social post URL back to Peec Sources URLs"), which is not buildable as written — see §2.

---

## 1. Problem

The client (Renaissance) asked for an **"AI Retrievals"** signal in Organic Social: for owned social
content, how often are AI answer engines retrieving it, per Peec's "Sources" data (total retrievals,
All Time / All Models). Show `0` when there's no retrieval, `N/A`/hidden when the client has no Peec
workspace.

The original Change 4 assumed a Dash social post URL and a Peec "Sources" URL are the same string and
can be exact-matched. **They are not** (§2). This design re-interprets the requirement around what the
data actually supports, validated with live probes against Renaissance (Peec project + Dash brand
26952) on 2026-07-31.

## 2. Findings that shape the design (live-probed 2026-07-31)

1. **Peec exposes `retrievals` per URL, but the app drops it.** `ApiUrlRow.retrievals` exists
   (`lib/peec/url-citations.ts`), but `mergeUrlCitations` never copies it onto `UrlCitation`. Surfacing
   it is a one-field addition.

2. **Dash and Peec identify the same LinkedIn post with different URLs.**
   - Peec (what the AI cited): `linkedin.com/posts/renaissancebenefits_…-activity-<ACTIVITY_ID>-<code>`
   - Dash Top Content (`linkedin_link`): `linkedin.com/feed/update/urn:li:ugcPost:<UGC_ID>`
   - `ACTIVITY_ID ≠ UGC_ID` and are not derivable from each other; Dash exposes **no** activity id or
     public `/posts/` URL in its CONTENT payload (confirmed: the only link field is `linkedin_link`,
     and there is no `activity`-typed field). **Exact match = 0 of 100** Dash LinkedIn URLs.

3. **The bridge: resolve the canonical URL from the post page.** Fetching the Dash `ugcPost` URL and
   reading `<link rel="canonical">` / `og:url` returns the public `/posts/…activity-<id>` URL Peec
   uses. **End-to-end probe: 15/15 Dash URLs resolved to canonical**, then exact-matched Peec →
   `1/15` had retrievals (=34). The low hit-rate is expected: most feed posts are not AI-retrieved.

4. **The high-retrieval owned content is LinkedIn Pulse, which is NOT in Dash Top Content.** Peec holds
   Renaissance `/pulse/…` articles at 1452 / 838 / 768 / 673… retrievals. Dash Top Content is feed
   posts only, so a column bolted onto it structurally cannot show Pulse. Hence a second, Peec-driven
   surface.

**Consequence:** the feature is two surfaces sharing one small piece of plumbing.

## 3. Shared plumbing — surface `retrievals`

Add `retrievals: number` to `UrlCitation` and copy `r.retrievals` in `mergeUrlCitations`. Bump the
`getUrlCitations` cache `version`. No other consumer changes; both surfaces below read this field.

## 4. Surface A — "AI Retrievals" column on Top Content

A right-aligned column on the LinkedIn Top Content table.

**Per-post flow (server-side):**
1. Dash gives the post's `ugcPost` URL.
2. **Resolve** `ugcPost → canonical /posts URL` (§4.1). Immutable mapping, resolved once, persisted.
3. `urlJoinKey(canonical)` → look up in Peec's all-time citations (§4.2) → `retrievals`.
4. Render: the number; **`0`** when resolved-but-not-cited (spec's "show 0 if none"); **`N/A`** when the
   client has no Peec workspace (`peecCustomerProjectId` unset); **hidden value** when the post's URL
   can't be resolved (404/deleted/blocked) — the row still renders (creative rules are unchanged),
   the AI Retrievals cell shows `—`.

**Platform scope:** LinkedIn requires the canonical resolution. Instagram/Facebook/X post URLs are
expected to match Peec directly (no `ugcPost`/`activity` split); the plan will confirm whether they
match and, if so, they use the direct path with no resolution. If they don't match and aren't
meaningfully AI-retrieved, the column may be LinkedIn-only — decided in the plan from a quick probe.

### 4.1 Canonical resolution

- Fetch the `ugcPost` URL (normalize the URN casing to `ugcPost`) with a browser `User-Agent`, follow
  redirects, extract `<link rel="canonical">` (fall back to `og:url`).
- **Persist** the mapping in a new table `post_url_resolutions` (`dash_url_key` PK → `canonical_url`,
  `resolved_at`, `status`). The mapping is immutable, so a resolved row is reused forever and survives
  cache eviction — we never re-scrape a resolved post.
- **Failure handling:** 404 / auth-wall / non-200 / no-canonical → record a `status='unresolved'`
  sentinel (with a retry-after cool-off so we don't hammer a transiently-failing URL) → column shows
  `—`. Never throws into the report.
- **Reliability / ToS (named risk):** scraping LinkedIn canonical is the only in-reach bridge (the ids
  aren't derivable). Mitigations: resolve-once-and-persist, low volume (~top posts per report, once
  each), bounded concurrency + backoff, graceful degradation. Long-term clean fix: ask Dash whether the
  public share URL is available via another field/endpoint; if so, drop the scrape.

### 4.2 Peec match (All Time / All Models)

Reuse the existing all-pages walk (`getPlacementCitations` pattern) with an **all-time** window and the
set of resolved canonical keys for the posts on screen; read `retrievals` off the matched rows. All
models (no engine filter) per the client's "All Models".

## 5. Surface B — "Top AI-Retrieved Content" (Peec-driven)

A new element in the **Organic Social** report (its own part, alongside Top Content). Reads Peec's
all-time cited URLs, filters to the client's **owned** LinkedIn content, ranks by `retrievals` desc.
Shows: content title/URL (linked), retrievals, citing engines. This is where the real numbers live
(Pulse). Independent of Dash and of the resolution layer.

### 5.1 Owned-content identification — automatic, no maintained list

Owned social content is identified **automatically from page metadata**, keyed on the client's own
LinkedIn company handle (which we already have — it's the `/posts/` handle, e.g. `renaissancebenefits`).
No per-article allowlist is maintained.

- **Feed posts:** owned iff the URL path is `linkedin.com/posts/<handle>*`. No fetch needed.
- **Pulse articles:** the author is **not reliably parseable from the URL string** (often absent, never
  delimited), but the article page's JSON-LD carries `author.name` + `author.url` reliably (live-probed
  2026-07-31, all samples resolved). Owned iff `author.url` is the client's own company page
  (`linkedin.com/company/<handle>`). Resolution is the same fetch-and-persist layer as §4.1 (author is
  immutable per URL, so it's cached forever).
- Optional future extension: an owned-employee profile allowlist to also count employee-authored
  articles. Not required for v1 — company-authored is the reliable, zero-maintenance signal.

Config needed per client: just the LinkedIn company handle (already implied by the `/posts/` owned
handle). No owned-URL list.

### 5.2 Reality check — owned LinkedIn content is barely AI-retrieved (live 2026-07-31)

Classifying Renaissance's top-25 Peec-cited LinkedIn URLs with the automatic rule above:
**owned = 230 retrievals (one company-authored article); third-party = 7,233** (Roger Howell 1452,
Alex Tolbert/BerniePortal 838, Ancileo, MyHealthily, USAble Life, EastBridge…). ~97% of the LinkedIn
"AI retrievals" in the client's Peec project is competitor/industry content cited in their tracked
prompts, not owned content.

**Decision (2026-07-31): Surface B is owned-only.** It lists only the client's own AI-retrieved
LinkedIn content (owned posts + company-authored Pulse), ranked by retrievals — honest and thin today,
growing as their AEO improves, and never showing competitor content as "ours." The competitive/industry
picture stays the Peec section's job. Empty state: when the client has no owned AI-retrieved content in
the period, the element shows a friendly empty state (not an error, not hidden entirely — so the
absence is legible), consistent with the platform's empty-state convention.

## 6. Persistence & caching

- One new table for immutable LinkedIn page resolutions, serving both surfaces: keyed by URL, storing
  the resolved `canonical_url` (posts, §4.1) and/or `author_url` (Pulse, §5.1) plus `resolved_at` /
  `status`. Resolved once per URL, reused forever, survives cache eviction — so we never re-scrape.
- Peec fetches reuse the existing `cached()` layer; the all-time citation walk is cached per client.
- No change to `top_content_snapshots`.

## 7. Testing

Pure unit tests with fixtures, no live calls in CI:
- Canonical extraction from sample LinkedIn HTML (present / missing / og:url-only / auth-wall).
- URL normalization + exact-match join (Dash-resolved key ↔ Peec key).
- Owned-content filter (owned post handle match, owned Pulse allowlist, third-party Pulse excluded).
- Empty / N-A / unresolved states for the column.
- `retrievals` carried through `mergeUrlCitations`.

Live behavior (LinkedIn fetch, Peec match) is flagged for manual `/verify` against Renaissance, not
asserted in CI.

## 8. Out of scope

- Instagram/Facebook/X resolution beyond a direct-match check (revisit if those platforms prove
  AI-retrieved).
- Historical/point-in-time retrievals (this is All-Time / All-Models per the client).
- Backfilling resolution for posts outside the reporting window.
- Any change to the creative/hide-row/caching behavior of Top Content (separate audit items).

## 9. Open questions (confirm on review)

1. **Client LinkedIn company handle in config:** owned-ness (both surfaces) keys on the client's own
   LinkedIn company handle (`renaissancebenefits`). Confirm where this lives — an existing client-config
   field, or a small new one to add. This is the *only* per-client config the feature needs.
2. **Column platform scope:** LinkedIn-only, or all platforms if IG/X/FB post URLs match Peec directly
   (a quick plan-stage probe decides; LinkedIn is the one that definitely needs canonical resolution).
3. **ToS posture on LinkedIn page fetches:** accept as low-volume-and-persisted (canonical for posts,
   author for Pulse — both immutable, fetched once each), or first ask Dash whether it exposes the
   public `/posts/` URL so posts need no scrape. Pulse author still needs the page either way.

**Resolved during design:** owned-ness is automatic via page JSON-LD author (no maintained list, §5.1);
Surface B is owned-only (§5.2); Surface B lives in the Organic Social section.
