# Portal Sidebar Leak Implementation Plan

> **For the executor:** run inline in this session with superpowers:executing-plans. No subagents. Steps use checkbox (`- [ ]`) syntax.

**Goal:** The client portal sends the browser only the current client's six sidebar fields, never every client's full record, and Renaissance's portal renders exactly as before.

**Architecture:** A mapper decides the browser-bound fields; the layout loads one client and passes the mapped record; the sidebar takes one client; two tab helpers accept a structural type.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Vitest 3 with @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-09-18-portal-sidebar-leak-design.md`

## Global Constraints

- What Renaissance's portal renders does not change: the sidebar snapshots taken before the change pass unchanged after it.
- No database write.
- No em or en dash characters in anything added.
- Before every commit: `npx vitest run`, `npx tsc --noEmit`, `npm run check:rsc` clean. Baseline on this branch: **1054**.
- Commit messages end with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- Branch `reporting-outline` (PR 250).

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `vitest.config.ts` | Modify | Include `lib/portal/**/*.test.{ts,tsx}` |
| `lib/portal/portal-sidebar.golden.test.tsx` | Create (first) | Snapshots of what the sidebar renders for a Renaissance-shaped client |
| `lib/portal/sidebar-client.ts` + `.test.ts` | Create | `PortalSidebarClient`, `toPortalSidebarClient` |
| `lib/portal/portal-layout.test.tsx` | Create | The layout never loads every client and passes only the trimmed record |
| `lib/constants.ts` | Modify, types only | `OrganicTabsClient` for the two tab helpers |
| `components/layout/portal-sidebar.tsx` | Modify | Takes `client`, not `clients` |
| `app/portal/[clientSlug]/layout.tsx` | Modify | Loads one client, passes the trimmed record |

---

### Task 1: Pin what the sidebar renders today

- [ ] **Step 1:** add `'lib/portal/**/*.test.{ts,tsx}',` to the `include` list in `vitest.config.ts`, next to `'lib/organic-social/**/*.test.{ts,tsx}'`.
- [ ] **Step 2:** create `lib/portal/portal-sidebar.golden.test.tsx`, rendering `PortalSidebar` with today's props (`clients={[renaissance, other]}`) through a `renderSidebar(ren, userRole)` helper, for the Organic Social, AEO and Paid Media pages and both client roles, and snapshotting each `container.innerHTML`. `next/navigation`, `next/link`, `next/image` and `@/app/actions/auth` are mocked. The Renaissance-shaped client uses its real prod `enabled_reports` (`organic-social, paid-media, peec-ai, request-a-report, executive-overview`) and `hidden_reports` (`technical-audit, content-impact`), no channel allowlist.
- [ ] **Step 3:** run it; snapshots are written. Record `shasum` of the snapshot file.
- [ ] **Step 4:** commit the config line, the test and its snapshot.

### Task 2: Trim what reaches the browser

- [ ] **Step 1:** write `lib/portal/sidebar-client.test.ts` (the six fields, channels kept, no planted secret in the output, same Organic Social tabs) and `lib/portal/portal-layout.test.tsx` (the layout with `@/auth`, `next/navigation` and `@/lib/db/queries` mocked: `getAllClients` never called, the sidebar's props hold only the trimmed record). Run: they fail (no module; the layout still calls `getAllClients` and passes `clients`).
- [ ] **Step 2:** implement `lib/portal/sidebar-client.ts`; add `OrganicTabsClient` to `lib/constants.ts` and use it as the parameter type of `organicSocialSubsections` and `resolveOrganicSubsection`; change `PortalSidebar` to take `client: PortalSidebarClient | null`; change the layout to `getClientBySlug` plus `toPortalSidebarClient`.
- [ ] **Step 3:** change the golden test's `renderSidebar` helper to the new props (`client={toPortalSidebarClient(ren)}`) and nothing else. Run: every snapshot passes unchanged, and the snapshot file's `shasum` is identical to Task 1 Step 3.
- [ ] **Step 4:** gates (`npx vitest run`, `npx tsc --noEmit`, `npm run check:rsc`), then commit with the edge-case list.

### Task 3: Prove, push, update PR 250

- [ ] **Step 1:** the drift check: surface and row identical in prod, staging and dev.
- [ ] **Step 2:** push; update PR 250's title and description (docs plus this fix; finding 5 closed).

## Self-Review

- **Spec coverage:** the mapper, the layout, the sidebar prop, the type change (Task 2); the before/after snapshots (Tasks 1 and 2 Step 3); the layout and mapper tests (Task 2 Step 1); the drift check (Task 3).
- **Placeholders:** none; the code is written in the steps as executed and recorded in the commits.
- **Types:** `PortalSidebarClient` fits `OrganicTabsClient`; a full `Client` fits it too.
