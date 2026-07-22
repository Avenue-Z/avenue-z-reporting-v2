# Dashboard Report Commentary — Design

**Date:** 2026-07-06
**Status:** ✅ Implemented — ⚠️ **partly superseded; do not use as a reference.**
**Branch:** TBD (off `design/per-client-report-sections`)
**Source PRD:** "Dashboard Report Commentary PRD" (06.30.2026)

> **Read [`lib/commentary/ENGINEERS.md`](../../../lib/commentary/ENGINEERS.md) instead.**
> This doc is the original design record, kept for history. Two of its central
> claims are no longer true:
>
> 1. **The render path described here was replaced** by the shared-parts system
>    (`2026-07-07-shared-report-parts-commentary-design.md`). Commentary is not
>    rendered by the four route files calling `resolveCommentaryView`; it renders via
>    `SharedPartsHeader`, and **only** for clients who opt in through a `sharedParts`
>    pin in `report_section_config`. `resolveCommentaryView` survives but is called by
>    nothing outside its own test.
> 2. **"Delete UI" is listed here as a non-goal.** That was reversed — draft
>    soft-delete shipped (`2026-07-14-commentary-history-and-soft-delete-design.md`).
>
> Its permission table is also out of date: the history log is approver-only, and
> staff attribution is stripped server-side for non-editors. The schema, sanitizer,
> permission helpers, selection logic, and editor described below are accurate.

## Summary

Add a **commentary section** to the top of each in-scope report view so Avenue Z
service leads can write a client-ready, human-context summary for a chosen
reporting period. Commentary lives inside the dashboard alongside the data,
carries its **own date range** (decoupled from the live dashboard date picker),
and passes through a lightweight **draft → approved** review flow before it
becomes visible to clients.

Commentary is authored in a **Tiptap rich-text editor** (bold/italic, lists,
headings, inline hyperlinks), stored as **sanitized HTML**, and rendered at the
top of the seven in-scope views. Any `@avenuez.com` user can write/edit and see
drafts; only an **approver allowlist** (Maddie/Dianna, via env var) can approve;
clients only ever see **approved** entries.

## Goals

- Internal users can write and edit commentary inside the dashboard, per service view.
- Each entry carries a required, self-contained date range that never auto-changes
  when the dashboard date picker changes.
- The most recent relevant entry shows by default; older entries are reachable
  through a manual dropdown.
- Commentary stays internal until approved; approved commentary is client-visible.
- The workflow is simple enough to repeat every ~2 weeks before client calls.

## Non-goals (v1)

- **Separate structured "links" field** — Tiptap handles inline hyperlinks in the
  body, so no distinct links column/UI. (PRD lists "optional links"; folded into
  rich text.)
- **Full edit-history / change-log table** — v1 keeps only row-level
  `created_by/at`, `updated_by/at`, `approved_by/at`. (PRD nice-to-have.)
- **Delete UI**, scheduled/email delivery, and **AI-generated** commentary — all
  out of scope.
- **Per-part / multiple summaries per view** — one commentary stream per
  `(client, view)`; "most recent" is the default. (PRD: "one overall summary per
  service view is enough for the first version".)
- **Reconciling the two duplicated route files** — commentary is added to the
  existing four route files as-is (see Context). The known dashboard/portal
  render duplication is pre-existing tech debt, not addressed here.

## In-scope views & the view-key resolver

The PRD's seven "service tabs" do **not** map 1:1 to route coordinates, and — this
is the critical constraint — **the same logical report renders under different
`(slug, subsection)` coordinates depending on which of the four route files serves
it** (verified in code):

| Logical view | Canonical `view_key` | Owner | Route coordinates that resolve to it |
|---|---|---|---|
| AEO Overview | `peec-ai` | Melena | `peec-ai` (no subsection) — all routes |
| AEO PR Influence | `peec-ai:pr-influence` | Alyssa | `peec-ai` + `pr-influence` (SPA routes only) |
| AEO Content Impact | `peec-ai:content-impact` | Danielle | `peec-ai` + `content-impact` (SPA routes only) |
| Paid Search | `paid-search` | Amir | `google-ads` (deep-link) · `paid-media` no-subsection (SPA) |
| Meta Advertising | `meta-ads` | Greg | `meta-ads` (deep-link, portal SPA) · `paid-media` + `meta` (dashboard SPA, portal SPA) |
| LinkedIn Advertising | `linkedin-ads` | Greg | `linkedin-ads` (deep-link, portal SPA) · `paid-media` + `linkedin` (dashboard SPA, portal SPA) |
| Organic Social | `organic-social` | Jasmine / Kyleah | `organic-social` — all routes |

Because the raw coordinates are unstable, the **canonical `view_key` must be
produced by a single resolver**, not read from the URL. Keying commentary on raw
coordinates would fragment one report's commentary across two keys (e.g. Meta as
both `paid-media:meta` and `meta-ads`).

`lib/commentary/views.ts` exports `resolveCommentaryView(slug, subsection?)`, called
by all four route files. It returns the canonical key or `null` (→ no commentary
block). The block renders **iff** the resolver returns non-null, so every other tab
(exec-summary, ga4, etc.) is untouched.

```ts
export type CommentaryViewKey =
  | 'peec-ai' | 'peec-ai:pr-influence' | 'peec-ai:content-impact'
  | 'paid-search' | 'meta-ads' | 'linkedin-ads' | 'organic-social'

export function resolveCommentaryView(slug: string, subsection?: string | null): CommentaryViewKey | null {
  switch (slug) {
    case 'peec-ai':
      if (!subsection) return 'peec-ai'
      if (subsection === 'pr-influence') return 'peec-ai:pr-influence'
      if (subsection === 'content-impact') return 'peec-ai:content-impact'
      return null                                    // technical-audit: out of scope
    case 'organic-social': return 'organic-social'
    case 'meta-ads': return 'meta-ads'
    case 'linkedin-ads': return 'linkedin-ads'
    case 'google-ads': return 'paid-search'
    case 'paid-media':
      if (!subsection) return 'paid-search'
      if (subsection === 'meta') return 'meta-ads'
      if (subsection === 'linkedin') return 'linkedin-ads'
      return null
    default: return null
  }
}
```

`COMMENTARY_VIEWS: Record<CommentaryViewKey, { label; owner }>` provides display
labels/owners. **`peec-ai:technical-audit` is deliberately excluded** — the PRD's
AEO scope is Overview / PR Influence / Content Impact only.

## Context (current state)

- **Two route files per audience** render report sections via a hardcoded
  `reportSlug`/`subsection` switch (known duplication, tracked in memory):
  - `app/dashboard/[clientSlug]/reports/page.tsx` (SPA-style, `activeSection` +
    `subsection` query params)
  - `app/dashboard/[clientSlug]/reports/[reportSlug]/page.tsx` (deep-link)
  - `app/portal/[clientSlug]/reports/page.tsx`
  - `app/portal/[clientSlug]/reports/[reportSlug]/page.tsx`
  The AEO sub-tabs (`pr-influence`, `content-impact`) are reached via the
  `subsection` branch in the first/third files.
- **Auth:** `auth()` from `@/auth`; `session.user` has `role`, `clientSlug`,
  `email`. Dashboard layout is internal-only; portal layout scopes clients to their
  own slug but **lets internal users view any client's portal**.
- **DB:** Neon + Drizzle (`neon-http`). uuid PKs via `defaultRandom()`,
  `timestamp(..., { withTimezone: true })`, typed `jsonb`/enums. Highest migration
  is `0016` (`section_templates` + `clients.report_section_config`). Migration
  workflow: `npm run db:generate` → `drizzle/0017_*.sql` → `npm run db:migrate`.
- **Server-action convention:** `'use server'` shell in `app/actions/*` (auth →
  validate → DB write → `revalidateTag('db','max')`, returns a discriminated
  `Result` union); **pure, unit-tested logic** lives in a sibling `lib/*/*.ts` with
  a `.test.ts` (see `app/actions/report-sections.ts` + `lib/report-sections/`).
- **Read helpers:** `lib/db/queries.ts`, wrapped in `React.cache()` (and optionally
  the persistent `cached('db', …)`).

## Data model

New enum + table (migration `0017`):

```ts
// lib/db/schema.ts
export const commentaryStatusEnum = pgEnum('commentary_status', ['draft', 'approved'])

export const reportCommentary = pgTable('report_commentary', {
  id:          uuid('id').primaryKey().defaultRandom(),
  clientId:    uuid('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  viewKey:     text('view_key').notNull(),          // 'peec-ai', 'peec-ai:pr-influence', 'meta-ads', …
  bodyHtml:    text('body_html').notNull(),          // Tiptap output, sanitized on write
  periodStart: date('period_start').notNull(),       // commentary's own range — required
  periodEnd:   date('period_end').notNull(),
  status:      commentaryStatusEnum('status').notNull().default('draft'),
  createdBy:   text('created_by').notNull(),          // email
  updatedBy:   text('updated_by').notNull(),          // email
  approvedBy:  text('approved_by'),                    // email, null until approved
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  approvedAt:  timestamp('approved_at', { withTimezone: true }),
}, (t) => [index('report_commentary_client_view_idx').on(t.clientId, t.viewKey)])

export type ReportCommentary = typeof reportCommentary.$inferSelect
export type NewReportCommentary = typeof reportCommentary.$inferInsert
```

- One row per commentary **entry**; many entries per `(client, view)` over time
  form the history stream.
- **Decoupled from the dashboard `dateRange`** — the block never reads the live
  picker; each entry carries its own `periodStart`/`periodEnd`.
- Keyed by `client_id` (FK) because the client is already loaded on every report
  page via `getClientBySlug`; `.id` is in hand.

## Permissions & visibility (`lib/commentary/permissions.ts`, pure)

Capabilities are derived from the **viewer's session**, not the route. The block
renders identically in all four route files and adapts per viewer.

- `isAvenueZEmail(email)` = `email` ends with `@avenuez.com`.
- **Write / edit / view drafts** = `isAvenueZEmail(email)`. (Matches PRD "any Avenue
  Z email address can write or edit commentary across all tabs.")
- **Approve** = `isAvenueZEmail(email) && COMMENTARY_APPROVERS.has(email.toLowerCase())`
  where `COMMENTARY_APPROVERS` is a comma-separated env var of approver emails
  (Maddie/Dianna). New env var, documented in CLAUDE.md.
- **Client visibility** = only `status === 'approved'` entries are ever returned for
  a non-Avenue-Z viewer (clients, portal only).

| Viewer | Entries seen | Controls |
|---|---|---|
| `@avenuez.com` (any route) | drafts + approved | Add, Edit; Approve/Revoke if in allowlist |
| Client (portal only) | approved only | none (read-only) |

## Approval & revision workflow

Draft → approved, with a **fork-on-edit-of-approved** rule so a client-visible
entry is never disturbed mid-review:

- **New entry** → created as `draft`.
- **Edit a `draft`** → `UPDATE` in place (nothing client-visible to protect).
- **Edit an `approved` entry** → `INSERT` a **new `draft`** pre-filled from the
  approved one; the approved entry is left untouched and stays client-visible.
  When the new draft is later approved, it is the most-recent approved entry and
  becomes the default display; the older approved entry moves into the history
  dropdown.
- **Approve** (allowlist only) → set `status='approved'`, `approvedBy`, `approvedAt`.
- **Revoke** (allowlist only) → set `status='draft'`, clear `approvedBy/at`.

The `saveCommentary` action decides UPDATE vs INSERT by reading the target row's
current status server-side, so the client UI just sends the row `id` it opened.
No `supersedes`/parent pointer in v1 — entries are independent rows ordered by
`periodStart desc, updatedAt desc`.

## Default entry & history selection (`pickDefaultEntry`, pure)

Given all entries for a `(client, view)` and whether the viewer may see drafts:

1. Filter to the viewer's visible statuses (client → approved only).
2. Default = most recent by `periodStart desc`, tiebreak `updatedAt desc`.
3. All visible entries populate the **older-entries dropdown** (labeled by period +
   status), so a user can manually pick an older one.

No attempt to match the dashboard's selected date range (PRD's recommended MVP
behavior: always show the most recent, with its own range clearly labeled).

## Rendering — one shared, section-agnostic block

A single component tree, dropped in at the **top** of each in-scope view in all
four route files. Each route computes `viewKey = resolveCommentaryView(slug, subsection)`
and renders the block only when `viewKey` is non-null:

- **`CommentarySection`** (RSC) — resolves the viewer's capabilities from `auth()`,
  loads entries via `getCommentaryForView(clientId, viewKey)`, computes the default
  entry, and passes entries + capabilities + default down. Renders nothing (or an
  empty add-affordance for Avenue Z viewers) when there are no visible entries.
- **`CommentaryPanel`** (`'use client'`) — collapsible container at the top of the
  view. Shows the selected entry's sanitized HTML, its **date-range label**, a
  **status badge** (Draft/Approved), the **older-entries dropdown**, and — for
  Avenue Z viewers — Add / Edit buttons and (allowlist) Approve/Revoke.
- **`CommentaryEditor`** (`'use client'`) — Tiptap toolbar (bold, italic, bullet/
  numbered list, heading, link) + required period start/end date inputs + Save.
  Calls the server actions and shows validation errors inline.

Styling follows the Avenue Z brand system (brand-coherence skill applied during
implementation), consistent with the existing `SectionHeader`/panel look.

## Server actions (`app/actions/commentary.ts`) + pure logic (`lib/commentary/`)

Async shell (`'use server'`), returns `{ ok: true; … } | { ok: false; error: string }`:

- `saveCommentary({ id?, clientSlug, viewKey, bodyHtml, periodStart, periodEnd })`
  → `auth()` → `canEditCommentary` → `sanitizeCommentaryHtml(bodyHtml)` → validate
  period (both present, start ≤ end, non-empty body) → resolve `clientId` via
  `getClientBySlug` → UPDATE (draft) or INSERT new draft (approved/absent) →
  `revalidateTag('db','max')`.
- `approveCommentary({ id })` → `auth()` → `canApproveCommentary(email)` →
  set approved + actor/timestamp → revalidate.
- `revokeCommentary({ id })` → `auth()` → `canApproveCommentary(email)` →
  back to draft → revalidate.

Pure, unit-tested modules in `lib/commentary/`:

- `sanitize.ts` — `sanitizeCommentaryHtml(html)`: tag/attr allowlist
  (`p, br, strong, em, u, ul, ol, li, h3, a[href]`), strips scripts, event
  handlers, `javascript:` URLs, disallowed tags. **This is the client-facing XSS
  boundary** — sanitize on write; stored HTML is already safe to render via
  `dangerouslySetInnerHTML`.
- `select.ts` — `pickDefaultEntry`, status filtering.
- `views.ts` — `resolveCommentaryView(slug, subsection)`, `COMMENTARY_VIEWS`
  registry (labels/owners), `CommentaryViewKey` type.
- `permissions.ts` — `isAvenueZEmail`, `canEditCommentary`, `canApproveCommentary`,
  `getApprovers` (parse env).

Read helper in `lib/db/queries.ts`:
`getCommentaryForView(clientId, viewKey)` → `React.cache()`-wrapped
`db.select().from(reportCommentary).where(and(eq(clientId), eq(viewKey))).orderBy(...)`.

## Dependencies (verified against `package.json`)

- **Tiptap** — `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-link`.
  Confirmed **not present**; must be added. (No existing editor: no tiptap/
  prosemirror/slate/lexical/quill/draft-js in the tree.)
- **HTML sanitizer** — `sanitize-html` + `@types/sanitize-html` (server-side, the
  write boundary). Confirmed **not present**; must be added.
- **FYI:** `react-markdown@^10.1.0` **is** already present, but it is a Markdown
  *renderer*, not a WYSIWYG editor, and we chose rich-text/Tiptap (HTML) over
  Markdown. It is not used by this feature; stored HTML is sanitized on write and
  rendered directly.

## Environment variables

```env
# Comma-separated approver emails for report commentary (Maddie/Dianna)
COMMENTARY_APPROVERS=maddie@avenuez.com,dianna@avenuez.com
```

## Testing approach (TDD)

Write tests first, per repo norm:

1. **`sanitize.test.ts`** — strips `<script>`, `onclick`, `javascript:` hrefs, and
   disallowed tags; preserves allowed formatting + `http(s)`/`mailto` links.
2. **`select.test.ts`** — `pickDefaultEntry` picks most-recent by period then
   updatedAt; client viewer never sees drafts; empty → null.
3. **`permissions.test.ts`** — `isAvenueZEmail` edge cases (subdomains,
   case); approver allowlist parsing + membership.
4. **`views.test.ts`** — `resolveCommentaryView` maps every route alias to the
   right canonical key (`paid-media`+`meta` → `meta-ads`, `google-ads` → `paid-search`,
   etc.) and returns `null` for out-of-scope tabs (`peec-ai:technical-audit`, `ga4`).
5. **`commentary.action.test.ts`** — mirrors `report-sections.test.ts`: edit-draft
   → UPDATE; edit-approved → new draft INSERT (approved row untouched);
   non-Avenue-Z rejected; approve requires allowlist.
6. Manual/e2e wire-up verification of the block on one AEO view and one paid view.

## Resolved decisions (formerly open items)

- **Paid/AEO view keys** — resolved: routes use inconsistent coordinates
  (`google-ads`/`paid-media` for Paid Search; `meta-ads`/`paid-media:meta` for
  Meta; etc.). Normalized via `resolveCommentaryView` to seven canonical keys (see
  In-scope views). `peec-ai:technical-audit` excluded.
- **Editor / sanitizer** — resolved: neither exists in the tree; add Tiptap +
  `sanitize-html`. `react-markdown` is present but not applicable (renderer, not a
  WYSIWYG editor).
- **Collapsible default state** — resolved: the block is collapsible and **defaults
  to expanded/open**, so commentary is visible at the top of the view on load.
