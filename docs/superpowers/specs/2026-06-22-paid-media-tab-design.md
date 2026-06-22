# Paid Media Nav Tab — Design

**Status:** Approved (brainstorm)
**Date:** 2026-06-22
**Working branch:** `feat/renaissance-dashboard`

---

## 1. Summary

Group the three paid-media reports — **Paid Search** (`google-ads`), **Meta
Advertising** (`meta-ads`), **LinkedIn Advertising** (`linkedin-ads`) — under a
single **Paid Media** navigation tab, modeled exactly on the existing **Answer
Engine Optimization** (`peec-ai`) tab: one parent report slug with a fixed list
of subsections rendered as nested child links.

This is **pure navigation + routing wiring**. The three report components are
**not modified** — the new `paid-media` parent simply dispatches to them by
subsection. It also closes a real gap: the sidebar links into the `?section=`
route, whose `getReportComponent` switch currently has **no case** for the
paid-media slugs, so today they render blank when reached via the nav (they only
work via the path route `/reports/<slug>`).

## 2. Why (problem)

- The dashboard/portal sidebars navigate to `/reports?section=<slug>`. The
  `?section=` route renders one section via a `getReportComponent` switch that
  handles `peec-ai`, `ga4`, `inbound-funnel`, etc. — **but not**
  `meta-ads`/`google-ads`/`linkedin-ads`. Those fall to `default → null` → blank.
- The paid-media reports are only reachable via the **path** route
  `/reports/[reportSlug]/page.tsx` (separate `getReportSection` switch).
- A `paid-media` grouping was already anticipated (`hidden_reports: ['paid-media']`
  on the Renaissance row) but never built.

## 3. Pattern being mirrored (AEO)

The canonical "parent tab with children" pattern, used by `peec-ai`, `ga4`, and
`inbound-funnel`:

- A `*_SUBSECTIONS` array in `lib/constants.ts`: `{ id: string | null; label }`,
  where `id: null` is the default subsection.
- The parent is a single `ReportSlug`. The sidebar renders it as a parent; when
  active, it renders indented child `<Link>`s to
  `?section=<slug>&subsection=<id>` (preserving `dateRange`/`compareRange`).
- The `?section=` route's `getReportComponent` switch dispatches on
  `(section, subsection)` to the child report components.
- A `*_SUBSECTION_NAMES` map drives the page title per subsection.

## 4. Design

### 4.1 Subsections (fixed — shown for every client with the tab)

```ts
// lib/constants.ts
export const PAID_MEDIA_SUBSECTIONS: { id: string | null; label: string }[] = [
  { id: null,       label: 'Paid Search'         }, // default → google-ads report
  { id: 'meta',     label: 'Meta Advertising'    },
  { id: 'linkedin', label: 'LinkedIn Advertising'},
]
```

URLs:
- `?section=paid-media` → Paid Search (default)
- `?section=paid-media&subsection=meta` → Meta Advertising
- `?section=paid-media&subsection=linkedin` → LinkedIn Advertising

### 4.2 Route dispatch (both `?section=` routes)

Add to `getReportComponent` in **`app/dashboard/[clientSlug]/reports/page.tsx`**
and **`app/portal/[clientSlug]/reports/page.tsx`**:

```tsx
case 'paid-media':
  if (subsection === 'meta')     return <MetaAdsReport     clientSlug={clientSlug} dateRange={dateRange} compareRange={compareRange} />
  if (subsection === 'linkedin') return <LinkedInAdsReport clientSlug={clientSlug} dateRange={dateRange} compareRange={compareRange} />
  return <PaidSearchReport clientSlug={clientSlug} dateRange={dateRange} compareRange={compareRange} />
```

Also in each route file:
- `PAID_MEDIA_SUBSECTION_NAMES = { meta: 'Meta Advertising', linkedin: 'LinkedIn Advertising' }`
  for the page title (no entry ⇒ title falls back to `REPORT_NAMES['paid-media']`
  = "Paid Media" for the default Paid Search view — matching how AEO's Overview
  shows the parent name).
- Include `paid-media` in the header date-picker render condition (all three
  child reports consume `dateRange`/`compareRange`).

Imports for `MetaAdsReport` / `PaidSearchReport` / `LinkedInAdsReport` already
exist in the path route; add them to the `?section=` route files.

### 4.3 Sidebars

- **`components/layout/sidebar.tsx`** (dashboard, `NAV_GROUPS`-driven): add a
  `slug === 'paid-media'` branch that renders the `PAID_MEDIA_SUBSECTIONS` as
  nested child links when the section is active — a direct copy of the existing
  `peec-ai` block (build `?section=paid-media&subsection=<id>`, preserve
  `dateRange`/`compareRange`).
- **`components/layout/portal-sidebar.tsx`** (client portal,
  `ALL_REPORT_SLUGS` + `hiddenReports`-driven): render the same parent +
  children for `paid-media`, following that file's existing rendering shape.

### 4.4 Constants & schema

- `lib/db/schema.ts`: add `'paid-media'` to the `ReportSlug` union.
- `lib/constants.ts`:
  - `REPORT_NAMES['paid-media'] = 'Paid Media'`.
  - `NAV_GROUPS`: replace the flat `'meta-ads'`, `'google-ads'` entries in the
    "Reports" group with a single `'paid-media'` (LinkedIn was never a flat
    entry). Result: `['peec-ai', 'ga4', 'paid-media', 'inbound-funnel', 'hubspot-performance']`.
  - If a `ALL_REPORT_SLUGS` list exists, add `'paid-media'` so the portal can
    surface it.

### 4.5 Consolidation rule

The three ad slugs (`google-ads`/`meta-ads`/`linkedin-ads`) **remain in
`enabledReports`** so the subsection dispatch and the existing `/reports/<slug>`
deep-links keep resolving. They are removed only as **flat nav items**:
- Dashboard: by dropping them from `NAV_GROUPS` (done in 4.4).
- Portal: by adding them to the client's `hidden_reports` (so the
  `ALL_REPORT_SLUGS` filter omits the flat items) while the `paid-media` parent
  renders them as children.

### 4.6 Per-client data

For Renaissance (and any client meant to have the tab):
- `enabled_reports`: add `'paid-media'` (keep `google-ads`/`meta-ads`/`linkedin-ads`).
- `hidden_reports`: remove `'paid-media'`; add `'google-ads'`, `'meta-ads'`,
  `'linkedin-ads'` (portal flat-item suppression).

## 5. Accepted tradeoff

"Always show all three" (the chosen option): a client whose Paid Media tab is on
but who lacks a given channel's config will see that channel's sub-page render
the normal not-connected / "couldn't load" state, rather than the sub-link being
hidden. This matches how any unconfigured report behaves today and keeps the
subsection list fixed like AEO.

## 6. Out of scope

- No blended/aggregate **Overview** subsection (default is the Paid Search
  report itself).
- **No changes** to the Paid Search, Meta, or LinkedIn report components or their
  data layers.
- The path route `/reports/[reportSlug]/page.tsx` is left unchanged (still
  renders the three individually for deep-links).

## 7. Testing

This is RSC/nav wiring with no pure logic to unit-test (consistent with the
existing AEO/GA4/Inbound-Funnel tabs, which have none). Verification:
- `npm run build` clean; `tsc --noEmit` clean.
- Manual: Paid Media tab appears in dashboard + portal; expands to Paid Search /
  Meta Advertising / LinkedIn Advertising; each renders its real report with a
  working date picker; the old flat Meta/Paid-Search items no longer appear
  separately.

## 8. Acceptance criteria

- A **Paid Media** tab appears in the dashboard and portal sidebars for a client
  with `paid-media` enabled.
- Clicking it opens **Paid Search**; nested links switch to **Meta Advertising**
  and **LinkedIn Advertising**; URLs are `?section=paid-media[&subsection=meta|linkedin]`.
- Each subsection renders the real report (live data) with the date-range picker.
- The three reports no longer appear as separate flat nav items.
- `/reports/<slug>` deep-links and the path route still work.
- Build + type-check clean.
