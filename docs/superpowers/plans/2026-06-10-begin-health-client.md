# Begin Health Client + Paid Media Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Begin Health as a third client on the Avenue Z reporting platform and surface a new **Paid Media** report tab — visible only on Begin Health — that iframes the existing standalone `begin-health-dashboard`.

**Architecture:** Strictly additive. Introduce one new `ReportSlug` literal (`paid-media`), register it in the sidebar constants between `peec-ai` and `ga4`, render it via a `<PaidMediaReport />` RSC that embeds `https://begin-health-dashboard.vercel.app`. Insert a new `clients` row for `begin-health` and append `paid-media` to every other client's `hiddenReports` so the tab is invisible to them. No DB schema migration (the `enabledReports` / `hiddenReports` columns are already `text[]`).

**Tech Stack:** Next.js 15 App Router (RSC) · TypeScript strict · Drizzle ORM · Neon Postgres · Auth.js v5 · Tailwind v4. Safety nets: `next build` (type-check) and `eslint`. No component test framework is configured in this repo — verification is manual via the dev server + Vercel preview.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `lib/db/schema.ts` | Modify | Add `'paid-media'` to the `ReportSlug` union literal. No DB shape change. |
| `lib/constants.ts` | Modify | Add display name, insert into `ALL_REPORT_SLUGS` and `NAV_GROUPS` Reports group between `peec-ai` and `ga4`. |
| `components/report-sections/paid-media/index.tsx` | Create | Single RSC. Renders the iframe. No props. |
| `app/dashboard/[clientSlug]/reports/[reportSlug]/page.tsx` | Modify | Import `PaidMediaReport`, add `case 'paid-media'` to the switch in `getReportComponent`. |
| `scripts/seed-begin-health.ts` | Create | Idempotent: upsert the `begin-health` `clients` row + append `'paid-media'` to every other client's `hiddenReports`. |

Each file has one clear job. The constants and schema changes are platform-wide; the component, switch case, and seed script are Begin-Health-specific.

---

## Task 1: Extend the ReportSlug union

**Files:**
- Modify: `lib/db/schema.ts:4-30`

- [ ] **Step 1.1: Open `lib/db/schema.ts` and locate the `ReportSlug` union (starts at line 4 with `export type ReportSlug =`).**

- [ ] **Step 1.2: Insert `'paid-media'` between `'peec-ai'` and `'profound-ai'` so the union order matches the platform sidebar order.**

Find:
```ts
  | 'peec-ai'
  | 'profound-ai'
```

Replace with:
```ts
  | 'peec-ai'
  | 'paid-media'
  | 'profound-ai'
```

- [ ] **Step 1.3: Run the TypeScript build to confirm no callers break.**

Run: `npm run build`
Expected: build succeeds. Any caller doing exhaustive `switch (slug: ReportSlug)` with no `default` would surface here — none exist in this codebase (the central switch in `reports/[reportSlug]/page.tsx` has `default: return null`), so build should pass.

- [ ] **Step 1.4: Commit.**

```bash
git add lib/db/schema.ts
git commit -m "feat(schema): add 'paid-media' to ReportSlug union"
```

---

## Task 2: Register `paid-media` in the sidebar constants

**Files:**
- Modify: `lib/constants.ts` (three locations: `REPORT_NAMES`, `NAV_GROUPS`, `ALL_REPORT_SLUGS`)

- [ ] **Step 2.1: Add the display name to `REPORT_NAMES`.**

Find (around line 59):
```ts
  'peec-ai': 'Answer Engine Optimization',
```

Replace with:
```ts
  'peec-ai': 'Answer Engine Optimization',
  'paid-media': 'Paid Media',
```

- [ ] **Step 2.2: Insert `'paid-media'` into the Reports group of `NAV_GROUPS`.**

Find (around line 85):
```ts
    slugs: ['peec-ai', 'ga4', 'inbound-funnel', 'hubspot-performance'],
```

Replace with:
```ts
    slugs: ['peec-ai', 'paid-media', 'ga4', 'inbound-funnel', 'hubspot-performance'],
```

- [ ] **Step 2.3: Insert `'paid-media'` into `ALL_REPORT_SLUGS` at the same position.**

Find (around line 112):
```ts
export const ALL_REPORT_SLUGS: string[] = [
  'demand-overview',
  'peec-ai',
  'ga4',
  'inbound-funnel',
  'hubspot-performance',
  'request-a-report',
]
```

Replace with:
```ts
export const ALL_REPORT_SLUGS: string[] = [
  'demand-overview',
  'peec-ai',
  'paid-media',
  'ga4',
  'inbound-funnel',
  'hubspot-performance',
  'request-a-report',
]
```

- [ ] **Step 2.4: Run lint to catch typos.**

Run: `npm run lint`
Expected: PASS (no new errors).

- [ ] **Step 2.5: Commit.**

```bash
git add lib/constants.ts
git commit -m "feat(constants): register 'paid-media' in sidebar"
```

---

## Task 3: Create the `PaidMediaReport` component

**Files:**
- Create: `components/report-sections/paid-media/index.tsx`

- [ ] **Step 3.1: Create the directory and file with the complete component.**

Write `components/report-sections/paid-media/index.tsx`:

```tsx
const DASHBOARD_URL = 'https://begin-health-dashboard.vercel.app'

/**
 * Embeds the standalone begin-health-dashboard (a single-file HTML app
 * backed by a Google Apps Script + Google Sheet) inside the Avenue Z
 * reporting platform. The dashboard handles its own data fetching,
 * editor-password gating, and PDF export — this component is just a frame.
 */
export function PaidMediaReport() {
  return (
    <iframe
      src={DASHBOARD_URL}
      title="Begin Health — Paid Media Recap"
      className="block h-[calc(100vh-12rem)] w-full rounded-lg border border-white/[0.06] bg-bg-surface"
      loading="lazy"
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
      referrerPolicy="no-referrer-when-downgrade"
    />
  )
}
```

- [ ] **Step 3.2: Type-check.**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3.3: Commit.**

```bash
git add components/report-sections/paid-media/index.tsx
git commit -m "feat(report-sections): add PaidMediaReport iframe component"
```

---

## Task 4: Wire `PaidMediaReport` into the report switch

**Files:**
- Modify: `app/dashboard/[clientSlug]/reports/[reportSlug]/page.tsx`

- [ ] **Step 4.1: Add the import.** Place it next to the other report-section imports near the top of the file (around lines 9–22).

Find:
```ts
import { PeecAIReport } from '@/components/report-sections/peec-ai'
```

Replace with:
```ts
import { PeecAIReport } from '@/components/report-sections/peec-ai'
import { PaidMediaReport } from '@/components/report-sections/paid-media'
```

- [ ] **Step 4.2: Add the switch case inside `getReportComponent`.** Place it directly after the `peec-ai` case so the file's order tracks the sidebar order.

Find:
```ts
    case 'peec-ai':
      if (subsection === 'pr-influence')    return <PRInfluenceReport clientSlug={clientSlug} dateRange={dateRange} demoMode={demoMode} />
      if (subsection === 'content-impact')  return <ContentImpactReport clientSlug={clientSlug} dateRange={dateRange} demoMode={demoMode} />
      if (subsection === 'technical-audit') return <TechnicalAuditReport clientSlug={clientSlug} dateRange={dateRange} demoMode={demoMode} />
      return <PeecAIReport clientSlug={clientSlug} dateRange={dateRange} demoMode={demoMode} />
    default:
      return null
```

Replace with:
```ts
    case 'peec-ai':
      if (subsection === 'pr-influence')    return <PRInfluenceReport clientSlug={clientSlug} dateRange={dateRange} demoMode={demoMode} />
      if (subsection === 'content-impact')  return <ContentImpactReport clientSlug={clientSlug} dateRange={dateRange} demoMode={demoMode} />
      if (subsection === 'technical-audit') return <TechnicalAuditReport clientSlug={clientSlug} dateRange={dateRange} demoMode={demoMode} />
      return <PeecAIReport clientSlug={clientSlug} dateRange={dateRange} demoMode={demoMode} />
    case 'paid-media':
      return <PaidMediaReport />
    default:
      return null
```

- [ ] **Step 4.3: Type-check + lint.**

Run: `npm run build && npm run lint`
Expected: both PASS.

- [ ] **Step 4.4: Commit.**

```bash
git add app/dashboard/\[clientSlug\]/reports/\[reportSlug\]/page.tsx
git commit -m "feat(reports): wire PaidMediaReport into dashboard switch"
```

---

## Task 5: Seed script — insert Begin Health, hide Paid Media everywhere else

**Files:**
- Create: `scripts/seed-begin-health.ts`

This script is idempotent and intended to be run once locally by Thomas against the production Neon DB after the code is deployed (or in tandem with the Vercel preview). It uses the same Drizzle conventions as `scripts/seed.ts`.

- [ ] **Step 5.1: Write the seed script.**

Write `scripts/seed-begin-health.ts`:

```ts
import { drizzle } from 'drizzle-orm/neon-http'
import { neon } from '@neondatabase/serverless'
import { and, eq, ne, sql } from 'drizzle-orm'
import { clients, type ReportSlug } from '@/lib/db/schema'

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL not set. Run with: tsx --env-file=.env.local scripts/seed-begin-health.ts')
  process.exit(1)
}

const db = drizzle(neon(process.env.DATABASE_URL))

const BEGIN_HEALTH = {
  slug: 'begin-health',
  name: 'Begin Health',
  logoUrl: null,
  domain: null,
  ga4PropertyId: null,
  gscSiteUrl: null,
  hubspotTokenEnvVar: null,
  sfCsvFileId: null,
  sfPrevCsvFileId: null,
  sitebulbSheetId: null,
  peecCustomerProjectId: null,
  prProofSheetId: null,
  prProofColumnMap: null,
  contentCalendarSheetId: null,
  peecYourBrand: null,
  profoundCategoryId: null,
  prConfig: null,
  enabledReports: [
    'demand-overview',
    'peec-ai',
    'paid-media',
    'ga4',
    'inbound-funnel',
    'hubspot-performance',
    'request-a-report',
  ] as ReportSlug[],
  hiddenReports: [] as ReportSlug[],
}

async function main() {
  // 1. Upsert the begin-health client row.
  const existing = await db.select().from(clients).where(eq(clients.slug, BEGIN_HEALTH.slug))
  if (existing.length === 0) {
    await db.insert(clients).values({ ...BEGIN_HEALTH, updatedAt: new Date() })
    console.log('Inserted client: begin-health')
  } else {
    await db
      .update(clients)
      .set({
        name: BEGIN_HEALTH.name,
        enabledReports: BEGIN_HEALTH.enabledReports,
        hiddenReports: BEGIN_HEALTH.hiddenReports,
        updatedAt: new Date(),
      })
      .where(eq(clients.slug, BEGIN_HEALTH.slug))
    console.log('Updated client: begin-health (enabledReports / hiddenReports)')
  }

  // 2. Append 'paid-media' to every other client's hidden_reports, but only
  //    if it's not already there. Postgres array_append + ANY() handles
  //    idempotency at the SQL level.
  const result = await db.execute(sql`
    UPDATE clients
       SET hidden_reports = array_append(hidden_reports, 'paid-media'),
           updated_at     = NOW()
     WHERE slug != ${BEGIN_HEALTH.slug}
       AND NOT ('paid-media' = ANY(hidden_reports))
  `)
  console.log(`Hid 'paid-media' on ${result.rowCount ?? 0} other client(s).`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
```

- [ ] **Step 5.2: Type-check.**

Run: `npm run build`
Expected: PASS. (Build does not execute the script — just type-checks it as part of the workspace.)

- [ ] **Step 5.3: Dry-run locally against the dev DB.**

> Thomas: run this against your `.env.local` DATABASE_URL first to make sure it behaves correctly before pointing it at prod.

Run: `npx tsx --env-file=.env.local scripts/seed-begin-health.ts`
Expected output (first run):
```
Inserted client: begin-health
Hid 'paid-media' on 2 other client(s).
```
Expected output (second run, idempotent):
```
Updated client: begin-health (enabledReports / hiddenReports)
Hid 'paid-media' on 0 other client(s).
```

- [ ] **Step 5.4: Commit.**

```bash
git add scripts/seed-begin-health.ts
git commit -m "feat(scripts): seed Begin Health client + hide Paid Media from others"
```

---

## Task 6: Local end-to-end smoke test

**Files:** none. Verification only.

- [ ] **Step 6.1: Start the dev server.**

Run: `npm run dev`
Expected: server starts on `http://localhost:3000` with no compile errors.

- [ ] **Step 6.2: Sign in as an internal user and confirm Avenue Z is untouched.**

Open: `http://localhost:3000/dashboard/avenue-z/reports`
Expected sidebar (in order): Overview · Answer Engine Optimization · Web Analytics · Inbound Funnel · Pipeline Performance · Request a Report. **No Paid Media item anywhere.** No visual or layout shift vs. before this change.

- [ ] **Step 6.3: Confirm Renaissance is untouched.**

Open: `http://localhost:3000/dashboard/renaissance/reports`
Expected: same — no Paid Media item.

- [ ] **Step 6.4: Confirm Begin Health appears on the dashboard picker.**

Open: `http://localhost:3000/dashboard`
Expected: a third card titled "Begin Health" with a "B" initial avatar and "7 reports configured".

- [ ] **Step 6.5: Click into Begin Health and confirm sidebar order.**

Click the Begin Health card. URL becomes `/dashboard/begin-health/reports`.
Expected sidebar (in order): Overview · Answer Engine Optimization · **Paid Media** · Web Analytics · Inbound Funnel · Pipeline Performance · Request a Report.

- [ ] **Step 6.6: Click Paid Media and confirm the embedded dashboard loads.**

URL becomes `/dashboard/begin-health/reports?section=paid-media`.
Expected: the begin-health-dashboard renders inside the iframe — header reads "Begin Health — Weekly Recap · Avenue Z". The dashboard's "Login" button (top-right) and PDF export controls work.

- [ ] **Step 6.7: Confirm error-boundary fallback on Begin Health's data-less tabs.**

Click "Web Analytics" (or Inbound Funnel / Pipeline Performance). Expected: an in-section error boundary UI (not a crashed route). Page layout and sidebar remain interactive. This is the documented v1 behavior per the spec.

- [ ] **Step 6.8: Stop the dev server.**

Press `Ctrl+C` in the terminal running `npm run dev`.

---

## Task 7: Push, preview-verify, merge

**Files:** none.

- [ ] **Step 7.1: Push the branch.**

Run: `git push -u origin feat/begin-health-client`
Expected: branch published. Vercel auto-deploys a preview within ~1 minute.

- [ ] **Step 7.2: Open the preview URL and re-run Steps 6.2–6.7 against the preview deploy.**

Get the preview URL from `gh pr view --json url 2>/dev/null` after PR creation, or from `vercel ls`, or from the Vercel dashboard.
Expected: identical behavior to local.

- [ ] **Step 7.3: Open the PR.**

Run:
```bash
gh pr create --title "feat: add Begin Health client + Paid Media tab" --body "$(cat <<'EOF'
## Summary
- Adds Begin Health as a third client on the Avenue Z reporting platform
- Adds a new Paid Media tab between Answer Engine Optimization and Web Analytics, visible **only** for Begin Health
- Embeds the existing standalone begin-health-dashboard via iframe (no port, no backend rewrite)
- Strictly additive — Avenue Z and Renaissance see zero change

## Test plan
- [ ] Avenue Z sidebar unchanged (no Paid Media item)
- [ ] Renaissance sidebar unchanged (no Paid Media item)
- [ ] Begin Health appears on the dashboard picker with "B" avatar
- [ ] Begin Health sidebar order: Overview · AEO · **Paid Media** · Web Analytics · Inbound Funnel · Pipeline Performance · Request a Report
- [ ] Paid Media tab loads the embedded dashboard, password login works, PDF export works
- [ ] Begin Health's data-less tabs (GA4 / HubSpot / Inbound Funnel) render the existing error boundary, don't crash the route

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 7.4: Thomas runs the seed against the production Neon DB.**

> Thomas: with your production `DATABASE_URL` set (either in `.env.local` or inline), run:
> ```bash
> npx tsx --env-file=.env.local scripts/seed-begin-health.ts
> ```
> Expected output mirrors Step 5.3.

- [ ] **Step 7.5: Merge.**

Once the preview is green and Thomas signs off, merge the PR. Vercel auto-deploys production.

- [ ] **Step 7.6: Post-merge smoke test on production.**

Open: `https://<prod-domain>/dashboard/begin-health/reports?section=paid-media`
Expected: identical behavior to preview. Sidebar correct. Iframe loads.

---

## Rollback (if needed)

- Revert the merge commit on `main`. The schema is unchanged (no Drizzle migration), so revert leaves the DB in a consistent state.
- The `clients` row for `begin-health` stays harmless once the slug is no longer in `REPORT_NAMES` — no route will render it. Delete with `DELETE FROM clients WHERE slug = 'begin-health';` if desired.
- `paid-media` entries in other clients' `hiddenReports` are also harmless after revert (they reference a slug that no longer exists in the union — still valid string array data).
