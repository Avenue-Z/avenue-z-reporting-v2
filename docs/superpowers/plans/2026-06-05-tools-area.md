# Tools Area Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the two external AEO tools out of every client's report sidebar into a dedicated, internal-only `/tools` area whose UI mirrors the dashboard but lists teams (one team: AEO) instead of clients.

**Architecture:** A new `/tools` route tree mirrors `/dashboard`: `/tools` lists team cards, `/tools/[teamSlug]` lists that team's tool cards (external links). Teams + tools are a hardcoded typed constant (`TEAMS`) in `lib/constants.ts`, shaped so it can later be promoted to a DB table. The existing `Sidebar` component gains two tools-mode variants (`ToolsSidebar`, `TeamSidebar`) reusing its shared helpers. Route protection mirrors the dashboard (proxy redirect + role check in the layout).

**Tech Stack:** Next.js 16 (App Router, RSC), TypeScript, Tailwind v4, lucide-react, Auth.js v5. No test framework is installed; see "Verification strategy" below.

**Spec:** `docs/superpowers/specs/2026-06-05-tools-area-design.md`

---

## Verification strategy (no test framework)

This repo has **no unit-test framework** (only two standalone `scripts/*.test.ts`). Introducing one for a small presentational feature is out of scope (YAGNI). Verification is therefore:

- **Per task — fast typecheck:** `npx tsc --noEmit` (expected: no errors, except the one documented red window between Task 1 and Task 2).
- **Integration — authoritative:** `npm run build` (Next's full typecheck + compile) and `npm run lint`.
- **Manual browser checks:** enumerated in Task 7.

---

## Dependency Graph & Parallelization

Every parallel task below edits a **distinct file set** (no two concurrent tasks touch the same file), and every round leaves the integration branch **build-green**.

| Task | File(s) | Depends on | Why |
|---|---|---|---|
| **T1** Add `TEAMS` constant | `lib/constants.ts` (additive only) | — | Foundation. Additive ⇒ build stays green. |
| **T6** Protect `/tools` route | `proxy.ts` | — | Independent one-line matcher edit. |
| **T2** Remove tools from client sidebar + add tools-mode variants | `lib/constants.ts` (removals), `components/layout/sidebar.tsx` | T1 (uses `TEAMS`; branches off post-T1 so the constants removals don't conflict) | Constants removals + sidebar revert/rewire change together, so they ship as one atomic task. |
| **T4** `/tools` page | `app/tools/page.tsx` (new) | T1 (`TEAMS`) | Reads `TEAMS`. |
| **T5** `/tools/[teamSlug]` page | `app/tools/[teamSlug]/page.tsx` (new) | T1 (`TEAMS`) | Reads `TEAMS`. |
| **T3** `/tools` layout (shell) | `app/tools/layout.tsx` (new) | T2 (`Sidebar` `clients` prop becomes optional) | Renders `<Sidebar>` without `clients`. |
| **T7** Integration verify | — | T1–T6 | Final build/lint/manual gate. |

### Parallel rounds (each round = a barrier; merge round N before starting round N+1)

```
Round 1  (parallel):  T1  ‖  T6
Round 2  (parallel):  T2  ‖  T4  ‖  T5      # all branch off post-Round-1
Round 3            :  T3                     # needs T2's optional clients prop
Round 4            :  T7  (build + lint + manual)
```

**Build-green checkpoints:** after Round 1 (additive constants + proxy = green), after Round 2 (removal+sidebar atomic = green), after Round 3 (layout = green). The only never-merged red state is a single agent's in-progress T1 worktree; the integration branch is green at every merge.

### Workflow-tool mapping (if executed via the Workflow tool)

```
await parallel([ () => T1, () => T6 ])           // Round 1 barrier
await parallel([ () => T2, () => T4, () => T5 ])  // Round 2 barrier
await T3                                          // Round 3
await T7                                          // Round 4 verify
```

Use `isolation: 'worktree'` per task (they mutate files); the round barriers enforce the dependency order, and the distinct-file guarantee prevents merge conflicts.

---

## File Structure

- **`lib/constants.ts`** — owns the `TEAMS` registry (`TeamDef`/`ToolDef`) and the report-nav constants. T1 adds `TEAMS`; T2 removes the now-moved tool slugs and the obsolete `AEO_TOOLS` map.
- **`components/layout/sidebar.tsx`** — owns all sidebar variants. T2 reverts the client-embedded tool links and adds `ToolsSidebar`/`TeamSidebar` + routing + the "Tools" entry link.
- **`app/tools/layout.tsx`** — internal-only shell for the tools area (auth guard + `<Sidebar>` + content container).
- **`app/tools/page.tsx`** — team-cards index.
- **`app/tools/[teamSlug]/page.tsx`** — a team's tool-cards page.
- **`proxy.ts`** — adds `/tools/:path*` to the auth-redirect matcher.

---

## Task 1: Add the `TEAMS` constant (additive)

**Files:**
- Modify: `lib/constants.ts` (append a new block at end of file)

**Depends on:** nothing. **Parallel with:** T6.

- [ ] **Step 1: Append the `TEAMS` registry to the bottom of `lib/constants.ts`**

After the existing `AEO_TOOLS` block (leave `AEO_TOOLS` in place for now — T2 removes it), add:

```ts

/**
 * Internal team-tools registry for the /tools area.
 *
 * Hardcoded for now (single team). Forward path to make teams dynamic: promote
 * this to a `teams` table + Drizzle query helper mirroring `clients` in lib/db/,
 * keeping the TeamDef/ToolDef shape so page and sidebar code need not change.
 */
export interface ToolDef {
  slug: string
  name: string
  url: string
  description?: string
}

export interface TeamDef {
  slug: string
  name: string
  tools: ToolDef[]
}

export const TEAMS: TeamDef[] = [
  {
    slug: 'aeo',
    name: 'AEO',
    tools: [
      {
        slug: 'seo-to-aeo-converter',
        name: 'SEO → AEO Converter',
        url: 'https://seo-to-aeo-converter.vercel.app/',
      },
      {
        slug: 'prompt-demand-navigator',
        name: 'Prompt Demand Navigator',
        url: 'https://prompt-demand-navigator.vercel.app/',
      },
    ],
  },
]
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (additive change; existing `AEO_TOOLS` still present so `sidebar.tsx` still compiles).

- [ ] **Step 3: Commit**

```bash
git add lib/constants.ts
git commit -m "feat(tools): add TEAMS registry constant for /tools area"
```

---

## Task 6: Protect the `/tools` route in proxy

**Files:**
- Modify: `proxy.ts`

**Depends on:** nothing. **Parallel with:** T1.

- [ ] **Step 1: Add `/tools/:path*` to the matcher**

Change:

```ts
export const config = {
  matcher: ['/dashboard/:path*', '/portal/:path*'],
}
```

to:

```ts
export const config = {
  matcher: ['/dashboard/:path*', '/portal/:path*', '/tools/:path*'],
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add proxy.ts
git commit -m "feat(tools): protect /tools route in proxy matcher"
```

---

## Task 2: Remove tools from client sidebar + add tools-mode sidebar variants

**Files:**
- Modify: `lib/constants.ts` (remove moved slugs + `AEO_TOOLS`)
- Modify: `components/layout/sidebar.tsx`

**Depends on:** T1 (uses `TEAMS`). Branch off the post-Round-1 integration branch so the `lib/constants.ts` removals apply cleanly on top of T1's additions. **Parallel with:** T4, T5.

### Part A — `lib/constants.ts` removals

- [ ] **Step 1: Remove the two tool entries from `REPORT_NAMES`**

Delete these two lines:

```ts
  'seo-to-aeo-converter': 'SEO → AEO Converter',
  'prompt-demand-navigator': 'Prompt Demand Navigator',
```

- [ ] **Step 2: Restore the `NAV_GROUPS` "Tools" group to request-a-report only**

Change:

```ts
  {
    label: 'Tools',
    slugs: ['request-a-report', 'seo-to-aeo-converter', 'prompt-demand-navigator'],
  },
```

to:

```ts
  {
    label: 'Tools',
    slugs: ['request-a-report'],
  },
```

- [ ] **Step 3: Remove the two slugs from `ALL_REPORT_SLUGS`**

Delete these two lines (the last two entries of the array):

```ts
  'seo-to-aeo-converter',
  'prompt-demand-navigator',
```

- [ ] **Step 4: Delete the obsolete `AEO_TOOLS` map**

Delete the entire block:

```ts
/** External AEO tool links */
export const AEO_TOOLS: Record<string, string> = {
  'seo-to-aeo-converter': 'https://seo-to-aeo-converter.vercel.app/',
  'prompt-demand-navigator': 'https://prompt-demand-navigator.vercel.app/',
}
```

### Part B — `components/layout/sidebar.tsx`

- [ ] **Step 5: Update the constants import and add the `Wrench` icon**

Change the constants import from:

```ts
import { REPORT_NAMES, NAV_GROUPS, AEO_SUBSECTIONS, GA4_SUBSECTIONS, AEO_TOOLS } from '@/lib/constants'
```

to:

```ts
import { REPORT_NAMES, NAV_GROUPS, AEO_SUBSECTIONS, GA4_SUBSECTIONS, TEAMS } from '@/lib/constants'
```

In the `lucide-react` import block, add `Wrench` to the existing list:

```ts
import {
  LayoutGrid,
  ChevronLeft,
  ChevronRight,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Wrench,
} from 'lucide-react'
```

- [ ] **Step 6: Make the `clients` prop optional**

Change:

```ts
interface SidebarProps {
  user?: SidebarUser
  clients: Client[]
  /** Whether demoMode is currently effective for this render — drives the
   *  toggle's visual state. Computed by the layout from the user's flag
   *  AND the demoMode cookie (which the user can flip via the toggle). */
  demoModeEffective?: boolean
}

export function Sidebar({ user, clients, demoModeEffective = false }: SidebarProps) {
```

to:

```ts
interface SidebarProps {
  user?: SidebarUser
  clients?: Client[]
  /** Whether demoMode is currently effective for this render — drives the
   *  toggle's visual state. Computed by the layout from the user's flag
   *  AND the demoMode cookie (which the user can flip via the toggle). */
  demoModeEffective?: boolean
}

export function Sidebar({ user, clients = [], demoModeEffective = false }: SidebarProps) {
```

- [ ] **Step 7: Add `/tools` routing in `Sidebar()`**

Immediately after `const pathParts = pathname.split('/')` (and before the `const clientSlug =` line), insert:

```ts
  // Tools area: /tools (teams list) and /tools/[teamSlug] (a team's tools)
  if (pathParts[1] === 'tools') {
    const teamSlug =
      pathParts.length >= 3 && pathParts[2] !== '' ? pathParts[2] : null
    if (teamSlug) {
      return (
        <TeamSidebar
          teamSlug={teamSlug}
          pathname={pathname}
          user={user}
          collapsed={collapsed}
          onToggle={() => setCollapsed((c) => !c)}
          demoModeEffective={demoModeEffective}
        />
      )
    }
    return (
      <ToolsSidebar
        pathname={pathname}
        user={user}
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
        demoModeEffective={demoModeEffective}
      />
    )
  }
```

- [ ] **Step 8: Add a "Tools" entry link in `MainSidebar`'s top nav**

In `MainSidebar`, the top `<ul className="flex flex-col gap-1">` currently contains a single `<li>` for the Dashboard link. Add a second `<li>` for Tools directly after the Dashboard `</li>`:

```tsx
          <li>
            <Link
              href="/tools"
              title="Tools"
              className={cn(
                'flex items-center rounded-md transition-colors',
                collapsed
                  ? cn(
                      'h-9 w-9 justify-center',
                      pathname.startsWith('/tools')
                        ? 'bg-white/[0.08] text-white'
                        : 'text-text-muted hover:bg-white/[0.06] hover:text-white'
                    )
                  : cn(
                      'gap-3 px-2 py-2 text-sm font-semibold',
                      pathname.startsWith('/tools')
                        ? 'bg-white/[0.08] text-white'
                        : 'text-text-muted hover:bg-white/[0.04] hover:text-white'
                    )
              )}
            >
              <Wrench className="h-5 w-5 shrink-0" />
              {!collapsed && <span>Tools</span>}
            </Link>
          </li>
```

- [ ] **Step 9: Revert the `ClientSidebar` `enabledReports` filter bypass**

Change:

```ts
                const visibleSlugs = group.slugs.filter((slug) =>
                  client.enabledReports.includes(slug as any) || AEO_TOOLS[slug]
                )
```

to:

```ts
                const visibleSlugs = group.slugs.filter((slug) =>
                  client.enabledReports.includes(slug as any)
                )
```

- [ ] **Step 10: Revert the `ClientSidebar` external-link branch to a plain `<Link>`**

Replace this block (the default `return` inside `visibleSlugs.map`):

```tsx
                        return (
                          <li key={slug}>
                            {AEO_TOOLS[slug] ? (
                              <a
                                href={AEO_TOOLS[slug]}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={cn(
                                  'block rounded-md px-3 py-2 text-sm font-semibold transition-colors',
                                  'text-text-muted hover:bg-white/[0.04] hover:text-white'
                                )}
                              >
                                {REPORT_NAMES[slug] ?? slug}
                              </a>
                            ) : (
                              <Link
                                href={`/dashboard/${clientSlug}/reports?${linkParams.toString()}`}
                                className={cn(
                                  'block rounded-md px-3 py-2 text-sm font-semibold transition-colors',
                                  isActive
                                    ? 'bg-white/[0.08] text-white'
                                    : 'text-text-muted hover:bg-white/[0.04] hover:text-white'
                                )}
                              >
                                {REPORT_NAMES[slug] ?? slug}
                              </Link>
                            )}
                          </li>
                        )
```

with:

```tsx
                        return (
                          <li key={slug}>
                            <Link
                              href={`/dashboard/${clientSlug}/reports?${linkParams.toString()}`}
                              className={cn(
                                'block rounded-md px-3 py-2 text-sm font-semibold transition-colors',
                                isActive
                                  ? 'bg-white/[0.08] text-white'
                                  : 'text-text-muted hover:bg-white/[0.04] hover:text-white'
                              )}
                            >
                              {REPORT_NAMES[slug] ?? slug}
                            </Link>
                          </li>
                        )
```

- [ ] **Step 11: Add the `ToolsSidebar` component**

Add this function at the end of `sidebar.tsx`, before the final `UserFooter` definition (placement is not load-bearing; anywhere at module top level works):

```tsx
// ─── Tools sidebar (tools home — teams list) ─────────────────────────────────

function ToolsSidebar({
  pathname,
  user,
  collapsed,
  onToggle,
  demoModeEffective,
}: {
  pathname: string
  user?: SidebarUser
  collapsed: boolean
  onToggle: () => void
  demoModeEffective: boolean
}) {
  return (
    <aside
      className={cn(
        'flex h-screen flex-col bg-bg-surface transition-all duration-200',
        collapsed ? 'w-14' : 'w-64'
      )}
    >
      {/* Logo + toggle */}
      <div className="flex h-16 shrink-0 items-center justify-between px-3">
        {!collapsed && (
          <Link href="/dashboard" className="px-3 text-white">
            <AvenueZLogo height={20} />
          </Link>
        )}
        <CollapseToggle collapsed={collapsed} onToggle={onToggle} />
      </div>

      {/* Navigation */}
      <nav className={cn('flex flex-1 flex-col', collapsed ? 'items-center px-1 pt-1' : 'px-2')}>
        <ul className="flex flex-col gap-1">
          <li>
            <Link
              href="/dashboard"
              title="Dashboard"
              className={cn(
                'flex items-center rounded-md transition-colors',
                collapsed
                  ? 'h-9 w-9 justify-center text-text-muted hover:bg-white/[0.06] hover:text-white'
                  : 'gap-3 px-2 py-2 text-sm font-semibold text-text-muted hover:bg-white/[0.04] hover:text-white'
              )}
            >
              <LayoutGrid className="h-5 w-5 shrink-0" />
              {!collapsed && <span>Dashboard</span>}
            </Link>
          </li>
          <li>
            <Link
              href="/tools"
              title="Tools"
              className={cn(
                'flex items-center rounded-md transition-colors',
                collapsed
                  ? cn(
                      'h-9 w-9 justify-center',
                      pathname === '/tools'
                        ? 'bg-white/[0.08] text-white'
                        : 'text-text-muted hover:bg-white/[0.06] hover:text-white'
                    )
                  : cn(
                      'gap-3 px-2 py-2 text-sm font-semibold',
                      pathname === '/tools'
                        ? 'bg-white/[0.08] text-white'
                        : 'text-text-muted hover:bg-white/[0.04] hover:text-white'
                    )
              )}
            >
              <Wrench className="h-5 w-5 shrink-0" />
              {!collapsed && <span>Tools</span>}
            </Link>
          </li>
        </ul>

        {/* Teams section */}
        <div className={collapsed ? 'mt-2 flex flex-col gap-1' : 'mt-6'}>
          {!collapsed && (
            <p className="mb-2 px-2 text-xs font-semibold text-text-muted">Teams</p>
          )}
          <ul className="flex flex-col gap-1">
            {TEAMS.map((team) => {
              const isActive = pathname.startsWith(`/tools/${team.slug}`)
              return (
                <li key={team.slug}>
                  <Link
                    href={`/tools/${team.slug}`}
                    title={team.name}
                    className={cn(
                      'group flex items-center rounded-md transition-colors',
                      collapsed
                        ? cn(
                            'h-9 w-9 justify-center',
                            isActive
                              ? 'bg-white/[0.08] text-white'
                              : 'text-text-muted hover:bg-white/[0.06] hover:text-white'
                          )
                        : cn(
                            'gap-3 px-2 py-2 text-sm font-semibold',
                            isActive
                              ? 'bg-white/[0.08] text-white'
                              : 'text-text-muted hover:bg-white/[0.04] hover:text-white'
                          )
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[11px] font-bold',
                        isActive
                          ? getAvatarColor(team.name)
                          : 'border border-white/[0.12] text-text-muted group-hover:text-white'
                      )}
                    >
                      {getInitial(team.name)}
                    </span>
                    {!collapsed && <span className="truncate">{team.name}</span>}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      </nav>

      {/* User section */}
      <div className="mt-auto border-t border-white/[0.06] p-2">
        <UserFooter user={user} collapsed={collapsed} demoModeEffective={demoModeEffective} />
      </div>
    </aside>
  )
}
```

- [ ] **Step 12: Add the `TeamSidebar` component**

Add this function right after `ToolsSidebar`:

```tsx
// ─── Team sidebar (a single team's tools) ────────────────────────────────────

function TeamSidebar({
  teamSlug,
  pathname,
  user,
  collapsed,
  onToggle,
  demoModeEffective,
}: {
  teamSlug: string
  pathname: string
  user?: SidebarUser
  collapsed: boolean
  onToggle: () => void
  demoModeEffective: boolean
}) {
  const team = TEAMS.find((t) => t.slug === teamSlug)
  const teamName = team?.name ?? teamSlug

  return (
    <aside
      className={cn(
        'flex h-screen flex-col bg-bg-surface transition-all duration-200',
        collapsed ? 'w-14' : 'w-64'
      )}
    >
      {/* Logo + toggle */}
      <div className="flex h-16 shrink-0 items-center justify-between px-3">
        {!collapsed && (
          <Link href="/dashboard" className="px-3 text-white">
            <AvenueZLogo height={20} />
          </Link>
        )}
        <CollapseToggle collapsed={collapsed} onToggle={onToggle} />
      </div>

      {/* Back to teams */}
      {!collapsed && (
        <div className="px-3">
          <Link
            href="/tools"
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-text-muted transition-colors hover:bg-white/[0.04] hover:text-white"
          >
            <ChevronLeft className="h-4 w-4" />
            All Teams
          </Link>
        </div>
      )}

      {/* Team name + tools */}
      {!collapsed && (
        <nav className="flex-1 overflow-y-auto px-2 pt-2">
          <p className="mb-1 px-3 text-[10px] font-bold uppercase tracking-widest text-text-muted">
            {teamName}
          </p>
          <ul className="flex flex-col gap-0.5">
            {team?.tools.map((tool) => (
              <li key={tool.slug}>
                <a
                  href={tool.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-md px-3 py-2 text-sm font-semibold text-text-muted transition-colors hover:bg-white/[0.04] hover:text-white"
                >
                  {tool.name}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {/* User section */}
      <div className={cn('border-t border-white/[0.06] p-2', !collapsed && 'mt-auto')}>
        <UserFooter user={user} collapsed={collapsed} demoModeEffective={demoModeEffective} />
      </div>
    </aside>
  )
}
```

- [ ] **Step 13: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS. (`AEO_TOOLS` is now fully removed from both files; `TEAMS` is imported and used; no dangling references.)

- [ ] **Step 14: Commit**

```bash
git add lib/constants.ts components/layout/sidebar.tsx
git commit -m "feat(tools): move AEO tools out of client sidebar into /tools sidebar variants"
```

---

## Task 4: `/tools` page (team cards)

**Files:**
- Create: `app/tools/page.tsx`

**Depends on:** T1 (`TEAMS`). **Parallel with:** T2, T5.

> Note: `AVATAR_COLORS`/`getAvatarColor` are duplicated locally here, matching the existing repo pattern (they are already duplicated in `app/dashboard/page.tsx` and `components/layout/sidebar.tsx`). Do not extract — that would refactor unrelated files.

- [ ] **Step 1: Create `app/tools/page.tsx`**

```tsx
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { TEAMS } from '@/lib/constants'
import { ArrowRight } from 'lucide-react'

const AVATAR_COLORS = [
  'bg-brand-yellow text-black',
  'bg-brand-green text-black',
  'bg-brand-cyan text-black',
  'bg-brand-blue text-white',
  'bg-brand-purple text-white',
]

function getAvatarColor(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

export default function ToolsPage() {
  return (
    <>
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Tools</h1>
        <p className="mt-1 text-sm text-text-muted">
          Select a team to view its tools.
        </p>
      </div>

      {/* Team cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TEAMS.map((team) => (
          <Link
            key={team.slug}
            href={`/tools/${team.slug}`}
            className="group relative flex items-center gap-4 rounded-lg border border-white/[0.06] bg-bg-surface p-5 transition-all hover:border-white/[0.12] hover:bg-white/[0.02]"
          >
            <span
              className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-base font-bold',
                getAvatarColor(team.name)
              )}
            >
              {team.name.charAt(0).toUpperCase()}
            </span>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">{team.name}</p>
              <p className="mt-0.5 text-xs text-text-muted">
                {team.tools.length} tool{team.tools.length !== 1 ? 's' : ''}
              </p>
            </div>

            <ArrowRight className="h-4 w-4 shrink-0 text-text-muted opacity-0 transition-opacity group-hover:opacity-100" />
          </Link>
        ))}
      </div>
    </>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/tools/page.tsx
git commit -m "feat(tools): add /tools team cards index page"
```

---

## Task 5: `/tools/[teamSlug]` page (tool cards)

**Files:**
- Create: `app/tools/[teamSlug]/page.tsx`

**Depends on:** T1 (`TEAMS`). **Parallel with:** T2, T4.

- [ ] **Step 1: Create `app/tools/[teamSlug]/page.tsx`**

```tsx
import { notFound } from 'next/navigation'
import { TEAMS } from '@/lib/constants'
import { ArrowUpRight } from 'lucide-react'

export default async function TeamToolsPage({
  params,
}: {
  params: Promise<{ teamSlug: string }>
}) {
  const { teamSlug } = await params
  const team = TEAMS.find((t) => t.slug === teamSlug)
  if (!team) notFound()

  return (
    <>
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">{team.name}</h1>
        <p className="mt-1 text-sm text-text-muted">
          Tools available to the {team.name} team.
        </p>
      </div>

      {/* Tool cards (external links) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {team.tools.map((tool) => (
          <a
            key={tool.slug}
            href={tool.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group relative flex items-center gap-4 rounded-lg border border-white/[0.06] bg-bg-surface p-5 transition-all hover:border-white/[0.12] hover:bg-white/[0.02]"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">{tool.name}</p>
              {tool.description && (
                <p className="mt-0.5 text-xs text-text-muted">{tool.description}</p>
              )}
            </div>

            <ArrowUpRight className="h-4 w-4 shrink-0 text-text-muted opacity-0 transition-opacity group-hover:opacity-100" />
          </a>
        ))}
      </div>
    </>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "app/tools/[teamSlug]/page.tsx"
git commit -m "feat(tools): add /tools/[teamSlug] tool cards page"
```

---

## Task 3: `/tools` layout (internal-only shell)

**Files:**
- Create: `app/tools/layout.tsx`

**Depends on:** T2 (`Sidebar` `clients` prop is now optional). **Parallel with:** nothing (Round 3).

> This mirrors `app/dashboard/layout.tsx` exactly, except it does **not** fetch clients and passes no `clients` prop to `<Sidebar>`.

- [ ] **Step 1: Create `app/tools/layout.tsx`**

```tsx
import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { auth } from '@/auth'
import { Sidebar } from '@/components/layout/sidebar'
import { resolveDemoMode } from '@/lib/demo-data/resolve'

const INTERNAL_ROLES = new Set(['INTERNAL_ADMIN', 'INTERNAL_ANALYST'])

export default async function ToolsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()

  if (!session) redirect('/login')
  if (!INTERNAL_ROLES.has(session.user.role ?? '')) redirect('/unauthorized')

  const cookieStore = await cookies()
  const demoModeEffective = resolveDemoMode({
    userDemoFlag: session.user.demoMode === true,
    cookieValue: cookieStore.get('demoMode')?.value,
  })

  return (
    <div className="flex h-screen bg-black" data-print-layout>
      <Suspense>
        <Sidebar user={session.user} demoModeEffective={demoModeEffective} />
      </Suspense>
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-7xl px-8 py-8">{children}</div>
      </main>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/tools/layout.tsx
git commit -m "feat(tools): add internal-only /tools layout shell"
```

---

## Task 7: Integration verification

**Files:** none (verification only).

**Depends on:** T1–T6 all merged.

- [ ] **Step 1: Lint**

Run: `npm run lint`
Expected: PASS (no errors in the changed/added files).

- [ ] **Step 2: Production build (authoritative typecheck + compile)**

Run: `npm run build`
Expected: PASS. Build output should list the new routes `/tools` and `/tools/[teamSlug]`.

- [ ] **Step 3: Manual verification (dev server)**

Run: `npm run dev`, sign in as an internal user (`@avenuez.com`), then verify:

1. The dashboard sidebar shows a **"Tools"** link (wrench icon) beside "Dashboard".
2. `/tools` renders a single **AEO** team card showing "2 tools"; clicking it navigates to `/tools/aeo`.
3. `/tools/aeo` renders two tool cards — **SEO → AEO Converter** and **Prompt Demand Navigator** — each opening the correct `*.vercel.app` URL in a **new tab**.
4. The `/tools` sidebar lists the **AEO** team; `/tools/aeo` sidebar lists the two tools (external links) with an "All Teams" back link.
5. Open any client report (e.g. `/dashboard/<slug>/reports`): the "Tools" group shows **only "Request a Report"** — the two AEO tools are gone.
6. Visiting `/tools/does-not-exist` returns the 404 (not-found) page.
7. Sign out (or use an incognito window) and hit `/tools` → redirected to `/login`. (Role-gating to `/unauthorized` for a non-internal user is enforced by the layout, identical to `/dashboard`.)

- [ ] **Step 4: Final state confirmation**

Run: `git status` and `git log --oneline origin/main..HEAD`
Expected: clean working tree; commits for T1–T6 present on `feat/tools-area`.

---

## Self-Review (completed by plan author)

- **Spec coverage:** routing/2-level (T4/T5), data model `TEAMS` + DB-forward comment (T1), new files layout/page/teamSlug (T3/T4/T5), sidebar Approach-A variants + entry link + clients-optional (T2), constants cleanup (T2), proxy matcher (T6), non-goals respected (Request-a-Report untouched; no DB; internal-only), verification (T7). All sections map to a task.
- **Placeholder scan:** none — every code step contains full code.
- **Type consistency:** `TeamDef`/`ToolDef`/`TEAMS` defined in T1 are consumed with matching shapes (`team.slug`, `team.name`, `team.tools[].{slug,name,url,description}`) in T2/T4/T5; `Sidebar` prop change in T2 (`clients?`) matches T3's omission of the prop; `ToolsSidebar`/`TeamSidebar` props match their call sites in `Sidebar()` (T2 Step 7).
