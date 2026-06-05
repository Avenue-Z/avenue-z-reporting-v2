# Design: Move AEO tools into a top-level `/tools` area

**Date:** 2026-06-05
**Branch:** `feat/tools-area` (off `origin/main`)
**Status:** Approved

## Problem

Two external tools — **SEO → AEO Converter** and **Prompt Demand Navigator** —
currently live inside every client's report sidebar (under the "Tools" group),
because they were registered as report slugs with an external-link override
(`AEO_TOOLS` in `lib/constants.ts`, consumed in `components/layout/sidebar.tsx`).
They are not client-specific, so showing them in each client's report view is the
wrong home.

Move them into a dedicated, top-level **`/tools`** area whose UI mirrors the
internal dashboard, but lists **teams** instead of clients. There is one team
today — **AEO** — and it has access to both tools.

## Decisions (from brainstorming)

- **Base branch:** new branch `feat/tools-area` off `origin/main` (which already
  has the tools embedded in client sidebars, so they can be removed there).
- **Access:** internal Avenue Z staff only (`INTERNAL_ADMIN` / `INTERNAL_ANALYST`),
  same as `/dashboard`. Clients no longer see these tools anywhere.
- **Data model:** hardcoded typed constant for now; DB table noted as the
  extensible path forward.
- **Navigation:** "Tools" link in the dashboard sidebar; two-level structure
  (`/tools` → team cards → `/tools/[teamSlug]` → tool cards), faithfully
  mirroring the dashboard.
- **Removal scope:** remove only the two AEO tools from client sidebars.
  "Request a Report" stays in each client's "Tools" group.
- **Sidebar approach:** Approach A — extend the existing `Sidebar` component with
  tools-mode variants, reusing its shared helpers (logo, user footer, demo
  toggle, collapse toggle), rather than building a separate sidebar component.

## Routing & page structure (dashboard mirror)

| Route | Mirrors | Renders |
|---|---|---|
| `/tools` | `/dashboard` (client cards) | Grid of **team** cards. One card: **AEO** → links to `/tools/aeo`. |
| `/tools/[teamSlug]` | `/dashboard/[clientSlug]/reports` | Grid of that team's **tool** cards. Each card is an external link (`<a target="_blank" rel="noopener noreferrer">`) opening the tool's Vercel app in a new tab. |

Unknown `teamSlug` → `notFound()`.

## Data model (hardcoded constant, DB-ready shape)

New typed constant in `lib/constants.ts`, replacing the current `AEO_TOOLS` map:

```ts
export interface ToolDef { slug: string; name: string; url: string; description?: string }
export interface TeamDef { slug: string; name: string; tools: ToolDef[] }

export const TEAMS: TeamDef[] = [
  {
    slug: 'aeo',
    name: 'AEO',
    tools: [
      { slug: 'seo-to-aeo-converter',    name: 'SEO → AEO Converter',     url: 'https://seo-to-aeo-converter.vercel.app/' },
      { slug: 'prompt-demand-navigator', name: 'Prompt Demand Navigator', url: 'https://prompt-demand-navigator.vercel.app/' },
    ],
  },
]
```

A comment will document the forward path: *to make teams dynamic, promote `TEAMS`
to a `teams` table + Drizzle query helper (mirroring `clients` in
`lib/db/`), keeping this same `TeamDef`/`ToolDef` shape so page and sidebar code
need not change.*

## New files

- **`app/tools/layout.tsx`** — same shell as `app/dashboard/layout.tsx`:
  `auth()` guard (redirect `/login` if no session; `/unauthorized` if role is not
  `INTERNAL_ADMIN`/`INTERNAL_ANALYST`); compute `demoModeEffective` from the user
  flag + `demoMode` cookie; render `<Sidebar>` + the `max-w-7xl` `<main>`
  container. Does **not** fetch clients.
- **`app/tools/page.tsx`** — team-cards grid, reusing the card markup/classes from
  `app/dashboard/page.tsx` (avatar = colored initial since AEO has no logo; team
  name; "N tools" subtitle; hover arrow). Links each card to `/tools/[teamSlug]`.
- **`app/tools/[teamSlug]/page.tsx`** — finds the team in `TEAMS`; `notFound()` if
  missing. Renders the team's tools as external-link cards (external-link icon,
  `target="_blank"`, `rel="noopener noreferrer"`). Header shows the team name.

## Sidebar changes (`components/layout/sidebar.tsx`) — Approach A

- **Routing:** in `Sidebar()`, detect `pathname.startsWith('/tools')`. Render a new
  `ToolsSidebar` (teams list — mirrors `MainSidebar`) when at `/tools`, or
  `TeamSidebar` (the team's tools list — mirrors `ClientSidebar`) when a team slug
  is present. Both reuse `CollapseToggle`, `UserFooter`, `AvenueZLogo`,
  `getAvatarColor`, `getInitial`.
- **Entry point:** add a **"Tools"** link (`Wrench` icon) to `MainSidebar`'s top
  nav, beside "Dashboard". The tools sidebars get a reciprocal "Dashboard" link
  and an "All Teams" back link (mirroring "All Clients").
- **Revert client embedding:** remove the `AEO_TOOLS[slug] ? <a> : <Link>` branch
  and the `|| AEO_TOOLS[slug]` `enabledReports` filter bypass in `ClientSidebar` —
  back to a plain `<Link>` for "Request a Report".
- Make the `clients` prop **optional** (default `[]`) so the tools layout need not
  pass it.

## Constants cleanup (`lib/constants.ts`)

Remove the two tool slugs from `REPORT_NAMES`; restore the `NAV_GROUPS` "Tools"
group to `['request-a-report']`; remove the two slugs from `ALL_REPORT_SLUGS`;
delete the `AEO_TOOLS` map (replaced by `TEAMS`). "Request a Report" is untouched.

## Route protection (`proxy.ts`)

Add `'/tools/:path*'` to the `matcher` so unauthenticated requests redirect to
`/login`. Role-level enforcement lives in `app/tools/layout.tsx`.

## Non-goals

- No DB table for teams (constant only; DB is the documented forward path).
- No portal / client access to `/tools`.
- No changes to the external tool apps themselves.
- No changes to "Request a Report".

## Verification

- Typecheck/build passes (check for an existing test setup during planning).
- `/tools` shows the AEO team card → `/tools/aeo` shows two tool cards that open
  the correct Vercel apps in new tabs.
- The two AEO tools no longer appear in any client's report sidebar; "Request a
  Report" still does.
- Unauthenticated → `/login`; non-internal role → `/unauthorized`.
