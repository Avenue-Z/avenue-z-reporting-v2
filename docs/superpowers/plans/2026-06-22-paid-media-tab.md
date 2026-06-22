# Paid Media Nav Tab — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `paid-media` parent nav tab that groups the existing Paid Search, Meta, and LinkedIn reports as subsections (mirroring the AEO/`peec-ai` tab), making them reachable from the sidebar (which uses the `?section=` route).

**Architecture:** Pure nav + routing wiring. A new `paid-media` ReportSlug + a fixed `PAID_MEDIA_SUBSECTIONS` list drive: (a) both sidebars rendering an expandable parent with child links, and (b) both `?section=` route `getReportComponent` switches dispatching by subsection to the unchanged `PaidSearchReport`/`MetaAdsReport`/`LinkedInAdsReport`. No report component or data layer changes.

**Tech Stack:** Next.js App Router (RSC + client sidebars), TypeScript.

**Spec:** `docs/superpowers/specs/2026-06-22-paid-media-tab-design.md`

## Global Constraints

- TypeScript strict; no `any` in new code.
- Surgical: follow the existing `peec-ai`/`ga4` patterns verbatim; touch only the files each task lists.
- Default subsection (`id: null`) = **Paid Search**; `meta` = Meta Advertising; `linkedin` = LinkedIn Advertising. Subsections are **fixed** (always all three).
- URLs: `?section=paid-media[&subsection=meta|linkedin]`. Child reports receive `dateRange` + `compareRange`.
- No unit tests (consistent with the existing AEO/GA4 nav tabs). Verification = `npx tsc --noEmit` clean + `npm run build` clean + manual nav check.
- Commit per task with the message shown. Stage only that task's files.

---

## Inter-Component Dependency Map

```
            T1 constants + schema
   (ReportSlug 'paid-media', PAID_MEDIA_SUBSECTIONS,
    REPORT_NAMES, NAV_GROUPS, ALL_REPORT_SLUGS)
        │        │         │          │
        ▼        ▼         ▼          ▼
   T2 dash    T3 portal  T4 dash    T5 portal
   ?section=  ?section=  sidebar    sidebar
   route      route      block      block
        └────────┴─────────┴──────────┘
                      ▼
        T6 build verify + per-client DB config
```

**Edges = consumes.** T2–T5 each need T1 (the `'paid-media'` slug must exist in `ReportSlug` for the `case`/filters to type-check; the sidebars consume `PAID_MEDIA_SUBSECTIONS`). T2–T5 touch **disjoint files** → safe to run in parallel.

### Parallelization waves
| Wave | Tasks (parallel) | Unblocked by |
|---|---|---|
| 0 | **T1** constants + schema | nothing |
| 1 | **T2** dash route, **T3** portal route, **T4** dash sidebar, **T5** portal sidebar | T1 (4 disjoint files → 4-way fan-out) |
| 2 | **T6** build verify + DB config | T2–T5 |

If running T2–T5 in parallel in one worktree, the implementers must **not** commit (concurrent commits race the git index); the controller commits each sequentially after they return. Otherwise run them sequentially.

---

## File Structure
```
lib/db/schema.ts                                    # MODIFY: + 'paid-media' ReportSlug          (T1)
lib/constants.ts                                    # MODIFY: PAID_MEDIA_SUBSECTIONS, REPORT_NAMES,
                                                    #         NAV_GROUPS, ALL_REPORT_SLUGS         (T1)
app/dashboard/[clientSlug]/reports/page.tsx         # MODIFY: imports + case + title + datepicker  (T2)
app/portal/[clientSlug]/reports/page.tsx            # MODIFY: case + title + datepicker            (T3)
components/layout/sidebar.tsx                        # MODIFY: paid-media expandable block          (T4)
components/layout/portal-sidebar.tsx                 # MODIFY: paid-media expandable block          (T5)
```

---

## Task 1: Constants + schema backbone

**Files:** Modify `lib/db/schema.ts`, `lib/constants.ts`.

**Interfaces:** Produces — `ReportSlug` now includes `'paid-media'`; `PAID_MEDIA_SUBSECTIONS: { id: string | null; label: string; comingSoon?: boolean }[]`; `REPORT_NAMES['paid-media'] = 'Paid Media'`; `NAV_GROUPS` Reports group lists `'paid-media'` (not the flat ad slugs); `ALL_REPORT_SLUGS` includes `'paid-media'`. Consumed by T2–T5.

- [ ] **Step 1: Add the ReportSlug** — in `lib/db/schema.ts`, in the `ReportSlug` union, add `'paid-media'`. Insert it right after the `'linkedin-ads'` line:

```ts
  | 'linkedin-ads'
  | 'paid-media'
```

- [ ] **Step 2: Add the subsections constant** — in `lib/constants.ts`, immediately after the `GA4_SUBSECTIONS` declaration, add:

```ts
/** Sub-items shown under the Paid Media parent nav item */
export const PAID_MEDIA_SUBSECTIONS: { id: string | null; label: string; comingSoon?: boolean }[] = [
  { id: null,       label: 'Paid Search'          },
  { id: 'meta',     label: 'Meta Advertising'     },
  { id: 'linkedin', label: 'LinkedIn Advertising' },
]
```

- [ ] **Step 3: Add the display name** — in `lib/constants.ts`, in the `REPORT_NAMES` object, add a line near the other ad names:

```ts
  'paid-media': 'Paid Media',
```

- [ ] **Step 4: Group the tab in NAV_GROUPS** — in `lib/constants.ts`, in `NAV_GROUPS`, replace the Reports group's `slugs` line:

```ts
    slugs: ['peec-ai', 'ga4', 'meta-ads', 'google-ads', 'inbound-funnel', 'hubspot-performance'],
```
with:
```ts
    slugs: ['peec-ai', 'ga4', 'paid-media', 'inbound-funnel', 'hubspot-performance'],
```

- [ ] **Step 5: Surface it in the portal list** — in `lib/constants.ts`, in `ALL_REPORT_SLUGS`, add `'paid-media'` after `'ga4'`:

```ts
export const ALL_REPORT_SLUGS: string[] = [
  'demand-overview',
  'peec-ai',
  'ga4',
  'paid-media',
  'inbound-funnel',
  'hubspot-performance',
  'request-a-report',
]
```

- [ ] **Step 6: Type-check + commit**

Run: `npx tsc --noEmit 2>&1 | grep "lib/constants\|lib/db/schema" || echo "constants ok"` → `constants ok`

```bash
git add lib/db/schema.ts lib/constants.ts
git commit -m "feat(nav): paid-media slug, subsections, and nav grouping constants"
```

---

## Task 2: Dashboard `?section=` route dispatch

**Files:** Modify `app/dashboard/[clientSlug]/reports/page.tsx`.

**Interfaces:** Consumes `'paid-media'` ReportSlug (T1). Renders `PaidSearchReport`/`MetaAdsReport`/`LinkedInAdsReport` (existing components) by subsection.

- [ ] **Step 1: Add the report imports** — at the top of the file, with the other `@/components/report-sections/*` imports, add:

```tsx
import { MetaAdsReport } from '@/components/report-sections/meta-ads'
import { PaidSearchReport } from '@/components/report-sections/paid-search'
import { LinkedInAdsReport } from '@/components/report-sections/linkedin-ads'
```

- [ ] **Step 2: Add the dispatch case** — in `getReportComponent`, add a case before `default:`:

```tsx
    case 'paid-media':
      if (subsection === 'meta')     return <MetaAdsReport clientSlug={clientSlug} dateRange={dateRange} compareRange={compareRange} />
      if (subsection === 'linkedin') return <LinkedInAdsReport clientSlug={clientSlug} dateRange={dateRange} compareRange={compareRange} />
      return <PaidSearchReport clientSlug={clientSlug} dateRange={dateRange} compareRange={compareRange} />
```

- [ ] **Step 3: Add the subsection-name map** — next to the existing `AEO_SUBSECTION_NAMES` declaration, add:

```tsx
const PAID_MEDIA_SUBSECTION_NAMES: Record<string, string> = {
  'meta':     'Meta Advertising',
  'linkedin': 'LinkedIn Advertising',
}
```

- [ ] **Step 4: Add the page-title branch** — in the `pageTitle` chain, add a branch before the final `: (REPORT_NAMES[activeSection] ?? activeSection)` fallback:

```tsx
    : (activeSection === 'paid-media' && subsection && PAID_MEDIA_SUBSECTION_NAMES[subsection])
      ? PAID_MEDIA_SUBSECTION_NAMES[subsection]
```

- [ ] **Step 5: Add the date picker** — inside `<StickyReportHeader>`, after the existing `peec-ai` date-picker `Suspense` block, add:

```tsx
        {activeSection === 'paid-media' && (
          <Suspense fallback={null}>
            <GA4DatePicker dateRange={dateRange} compareRange={compareRange} />
          </Suspense>
        )}
```

- [ ] **Step 6: Type-check + commit**

Run: `npx tsc --noEmit 2>&1 | grep "dashboard/\[clientSlug\]/reports/page" || echo "dash route ok"` → `dash route ok`

```bash
git add "app/dashboard/[clientSlug]/reports/page.tsx"
git commit -m "feat(nav): render paid-media subsections in dashboard report route"
```

---

## Task 3: Portal `?section=` route dispatch

**Files:** Modify `app/portal/[clientSlug]/reports/page.tsx`.

**Interfaces:** Consumes `'paid-media'` ReportSlug (T1). The `MetaAdsReport`/`PaidSearchReport`/`LinkedInAdsReport` imports **already exist** in this file — do not re-add them.

- [ ] **Step 1: Add the dispatch case** — in `getReportComponent`, add a case (the switch has no `default`, so place it among the other cases, e.g. after the `linkedin-ads` case):

```tsx
    case 'paid-media':
      if (subsection === 'meta')     return <MetaAdsReport clientSlug={clientSlug} dateRange={dateRange} compareRange={compareRange} />
      if (subsection === 'linkedin') return <LinkedInAdsReport clientSlug={clientSlug} dateRange={dateRange} compareRange={compareRange} />
      return <PaidSearchReport clientSlug={clientSlug} dateRange={dateRange} compareRange={compareRange} />
```

- [ ] **Step 2: Add the subsection-name map** — next to the existing `INBOUND_FUNNEL_SUBSECTION_NAMES` declaration, add:

```tsx
const PAID_MEDIA_SUBSECTION_NAMES: Record<string, string> = {
  'meta':     'Meta Advertising',
  'linkedin': 'LinkedIn Advertising',
}
```

- [ ] **Step 3: Add the page-title branch** — in the `pageTitle` chain, add a branch before the final `: (REPORT_NAMES[activeSection] ?? activeSection)` fallback:

```tsx
    : (activeSection === 'paid-media' && subsection && PAID_MEDIA_SUBSECTION_NAMES[subsection])
      ? PAID_MEDIA_SUBSECTION_NAMES[subsection]
```

- [ ] **Step 4: Add the date picker** — inside `<StickyReportHeader>`, after the existing GA4/inbound-funnel date-picker `Suspense` block, add:

```tsx
        {activeSection === 'paid-media' && (
          <Suspense fallback={null}>
            <GA4DatePicker dateRange={dateRange} compareRange={compareRange} />
          </Suspense>
        )}
```

- [ ] **Step 5: Type-check + commit**

Run: `npx tsc --noEmit 2>&1 | grep "portal/\[clientSlug\]/reports/page" || echo "portal route ok"` → `portal route ok`

```bash
git add "app/portal/[clientSlug]/reports/page.tsx"
git commit -m "feat(nav): render paid-media subsections in portal report route"
```

---

## Task 4: Dashboard sidebar — expandable Paid Media tab

**Files:** Modify `components/layout/sidebar.tsx`.

**Interfaces:** Consumes `PAID_MEDIA_SUBSECTIONS` (T1). In-scope vars (already used by the `peec-ai` block): `slug`, `isActive`, `activeSubsection`, `dateRange`, `compareRange`, `clientSlug`, `REPORT_NAMES`, `cn`.

- [ ] **Step 1: Import the constant** — add `PAID_MEDIA_SUBSECTIONS` to the existing `@/lib/constants` import in this file (the one that already imports `AEO_SUBSECTIONS`, `GA4_SUBSECTIONS`).

- [ ] **Step 2: Add the expandable block** — immediately after the `if (slug === 'peec-ai') { … }` block closes and before the `// GA4 — expandable sub-menu` block, insert:

```tsx
                        // Paid Media — expandable sub-menu
                        if (slug === 'paid-media') {
                          const pmBaseParams = new URLSearchParams()
                          pmBaseParams.set('section', 'paid-media')
                          if (dateRange) pmBaseParams.set('dateRange', dateRange)
                          if (compareRange) pmBaseParams.set('compareRange', compareRange)
                          return (
                            <li key={slug}>
                              <Link
                                href={`/dashboard/${clientSlug}/reports?${pmBaseParams.toString()}`}
                                className={cn(
                                  'block rounded-md px-3 py-2 text-sm font-semibold transition-colors',
                                  isActive
                                    ? 'text-white'
                                    : 'text-text-muted hover:bg-white/[0.04] hover:text-white'
                                )}
                              >
                                {REPORT_NAMES[slug] ?? slug}
                              </Link>
                              {isActive && (
                                <ul className="ml-3 mt-0.5 space-y-px border-l border-white/[0.08] pl-2.5">
                                  {PAID_MEDIA_SUBSECTIONS.map((sub) => {
                                    const subParams = new URLSearchParams()
                                    subParams.set('section', 'paid-media')
                                    if (sub.id) subParams.set('subsection', sub.id)
                                    if (dateRange) subParams.set('dateRange', dateRange)
                                    if (compareRange) subParams.set('compareRange', compareRange)
                                    const subIsActive = sub.id === null
                                      ? !activeSubsection
                                      : activeSubsection === sub.id
                                    return (
                                      <li key={sub.id ?? 'overview'}>
                                        <Link
                                          href={`/dashboard/${clientSlug}/reports?${subParams.toString()}`}
                                          className={cn(
                                            'block rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors',
                                            subIsActive
                                              ? 'bg-white/[0.08] text-white'
                                              : 'text-text-muted hover:bg-white/[0.04] hover:text-white/70'
                                          )}
                                        >
                                          {sub.label}
                                        </Link>
                                      </li>
                                    )
                                  })}
                                </ul>
                              )}
                            </li>
                          )
                        }
```

- [ ] **Step 3: Type-check + commit**

Run: `npx tsc --noEmit 2>&1 | grep "components/layout/sidebar" || echo "sidebar ok"` → `sidebar ok`

```bash
git add components/layout/sidebar.tsx
git commit -m "feat(nav): Paid Media expandable tab in dashboard sidebar"
```

---

## Task 5: Portal sidebar — expandable Paid Media tab

**Files:** Modify `components/layout/portal-sidebar.tsx`.

**Interfaces:** Consumes `PAID_MEDIA_SUBSECTIONS` (T1). In-scope vars (already used by the portal `peec-ai` block): `slug`, `isActive`, `activeSubsection`, `dateRange`, `clientSlug`, `REPORT_NAMES`, `cn`. (Portal nav links carry only `dateRange`, matching the existing blocks.)

- [ ] **Step 1: Import the constant** — add `PAID_MEDIA_SUBSECTIONS` to the existing `@/lib/constants` import (line 8: the one importing `REPORT_NAMES, ALL_REPORT_SLUGS, AEO_SUBSECTIONS, GA4_SUBSECTIONS, SOON_REPORT_SLUGS`).

- [ ] **Step 2: Add the expandable block** — immediately after the `if (slug === 'peec-ai') { … }` block closes and before the `// GA4 — expandable sub-menu` block, insert:

```tsx
            // Paid Media — expandable sub-menu
            if (slug === 'paid-media') {
              const pmBaseParams = new URLSearchParams()
              pmBaseParams.set('section', 'paid-media')
              if (dateRange) pmBaseParams.set('dateRange', dateRange)
              return (
                <li key={slug}>
                  <Link
                    href={`/portal/${clientSlug}/reports?${pmBaseParams.toString()}`}
                    className={cn(
                      'block rounded-md px-3 py-2 text-sm font-semibold transition-colors',
                      isActive
                        ? 'text-white'
                        : 'text-text-muted hover:bg-white/[0.04] hover:text-white'
                    )}
                  >
                    {REPORT_NAMES[slug] ?? slug}
                  </Link>
                  {isActive && (
                    <ul className="ml-3 mt-0.5 space-y-px border-l border-white/[0.08] pl-2.5">
                      {PAID_MEDIA_SUBSECTIONS.map((sub) => {
                        const subParams = new URLSearchParams()
                        subParams.set('section', 'paid-media')
                        if (sub.id) subParams.set('subsection', sub.id)
                        if (dateRange) subParams.set('dateRange', dateRange)
                        const subIsActive = sub.id === null ? !activeSubsection : activeSubsection === sub.id
                        return (
                          <li key={sub.id ?? 'overview'}>
                            <Link
                              href={`/portal/${clientSlug}/reports?${subParams.toString()}`}
                              className={cn(
                                'block rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors',
                                subIsActive
                                  ? 'bg-white/[0.08] text-white'
                                  : 'text-text-muted hover:bg-white/[0.04] hover:text-white/70'
                              )}
                            >
                              {sub.label}
                            </Link>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </li>
              )
            }
```

- [ ] **Step 3: Type-check + commit**

Run: `npx tsc --noEmit 2>&1 | grep "components/layout/portal-sidebar" || echo "portal sidebar ok"` → `portal sidebar ok`

```bash
git add components/layout/portal-sidebar.tsx
git commit -m "feat(nav): Paid Media expandable tab in portal sidebar"
```

---

## Task 6: Build verification + per-client config

**Files:** none (verification + DB data).

- [ ] **Step 1: Full type-check + build**

Run:
```bash
npx tsc --noEmit 2>&1 | grep -E "paid-media|sidebar|reports/page" || echo "no type errors"
npm run build
```
Expected: `no type errors`; build clean.

- [ ] **Step 2: Enable the tab for Renaissance (controller / DB)** — run against the target DB (dev for local demo; prod at go-live). Adds `paid-media` to `enabled_reports`, keeps the three ad slugs (so dispatch + deep-links resolve), and clears `paid-media` from `hidden_reports`:

```sql
UPDATE clients SET
  enabled_reports = (SELECT array_agg(DISTINCT r) FROM unnest(enabled_reports || ARRAY['paid-media']) r),
  hidden_reports  = array_remove(hidden_reports, 'paid-media')
WHERE slug = 'renaissance';
```

- [ ] **Step 3: Manual verification** (dev server)

Run: `npm run dev`, sign in, and confirm on **both** surfaces:
- A **Paid Media** tab appears in the sidebar (no separate flat Meta/Paid-Search items).
- Clicking it lands on **Paid Search** at `?section=paid-media`; nested links switch to **Meta Advertising** (`&subsection=meta`) and **LinkedIn Advertising** (`&subsection=linkedin`); each renders its real report with a working date picker.
- Dashboard: `/dashboard/renaissance/reports?section=paid-media`. Portal: `/portal/renaissance/reports?section=paid-media`.

- [ ] **Step 4: Commit (if any verification-driven tweaks)** — none expected; the DB change is data, not code.

---

## Self-Review

**Spec coverage:** §4.1 subsections → T1 Step 2; §4.2 route dispatch (both routes, title, datepicker) → T2 + T3; §4.3 sidebars → T4 + T5; §4.4 constants/schema/NAV_GROUPS/ALL_REPORT_SLUGS → T1; §4.5–4.6 consolidation (drop flat dash items via NAV_GROUPS; portal never listed the ad slugs in ALL_REPORT_SLUGS so no portal hiding needed; keep ad slugs in enabledReports) → T1 Step 4 + T6 Step 2; §7 testing (build + manual) → T6; §8 acceptance → T6 Step 3. ✅

> Spec §4.6 mentioned adding the ad slugs to the portal's `hidden_reports`; on inspection `ALL_REPORT_SLUGS` does **not** contain `meta-ads`/`google-ads`/`linkedin-ads`, so the portal never rendered them as flat items and no hiding is required — the portal step is dropped as unnecessary. Noted here so the deviation from the spec text is explicit.

**Placeholder scan:** none — every step has concrete code/commands. ✅

**Type consistency:** `'paid-media'` added to `ReportSlug` (T1) is what makes the `case 'paid-media'` in T2/T3 and the `slug === 'paid-media'` filter in T4/T5 type-check; `PAID_MEDIA_SUBSECTIONS` shape (T1) matches its `.map((sub) => sub.id/sub.label)` use in T4/T5; `PAID_MEDIA_SUBSECTION_NAMES` is defined locally in each route (T2/T3); subsection ids `meta`/`linkedin` and the `null` default are consistent across routes and sidebars. ✅
