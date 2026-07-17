# Report Commentary — Engineering Overview

> How commentary actually works today. Read this before touching
> `lib/commentary/**`, `app/actions/commentary.ts`,
> `components/report-sections/commentary/**`, or
> `components/report-sections/shared/**`.
> Type definitions are the source of truth ([types.ts](./types.ts),
> [views.ts](./views.ts)); this doc explains how the pieces fit and *why*.
>
> The three dated specs under `docs/superpowers/specs/` are the **history** of how
> this was designed, not a description of what shipped. Where they differ, trust
> this doc and the code. See [History](#history).

---

## What it is

A human-written, client-ready summary rendered at the top of a report view. Avenue Z
service leads write it; an approver allowlist publishes it; clients see only what was
approved. It carries its **own reporting period**, decoupled from the dashboard's date
picker — commentary about June stays about June when someone changes the picker to July.

Body text is authored in Tiptap, stored as **sanitized HTML** (`sanitize.ts` — the
XSS boundary), and passes through a `draft → approved` flow before a client can see it.

Seven views are in scope. Labels and service owners live in `COMMENTARY_VIEWS`
([views.ts](./views.ts)): AEO Overview, AEO PR Influence, AEO Content Impact, Paid
Search, Meta, LinkedIn, Organic Social.

---

## Render path — read this first

**Commentary is opt-in per client, per view. No opt-in, no block, no error.** This is
the single most surprising thing about the feature and the first place to look when
someone reports "commentary isn't showing up."

```
clients.report_section_config[viewKey].sharedParts   ← the opt-in pin lives here
  = [{ id: 'commentary', version: 1 }]
        │
        ▼
<SharedPartsHeader viewKey="meta-ads" clientSlug={slug} />   ← in each section's RSC
        │   shared-parts-header.tsx
        ▼
resolveSharedParts(pins, SHARED_PARTS)     ← pure; unknown pins silently dropped
        │   parts/resolve.ts
        ▼
lookup(SHARED_PARTS, 'commentary', 1) → commentaryPart.render(ctx)
        │   parts/registry.tsx
        ▼
<CommentarySection clientSlug viewKey />   ← wrapped in ReportErrorBoundary + Suspense
        │   components/report-sections/commentary/index.tsx
        ▼
<CommentaryPanel …props />                 ← client component
```

A client with no `sharedParts` pin renders nothing at all — `resolveSharedParts`
returns `[]` and `SharedPartsHeader` returns `null`. That is intended: commentary was
rolled out to Renaissance only (`scripts/enable-commentary-renaissance.ts`), and the
pin is how you enable it for anyone else.

To enable commentary for a client, add the pin to each view's entry in that client's
`report_section_config`. Use the rollout script as the reference for the shape.

All seven views call `SharedPartsHeader` as the first child of their returned JSX
(`meta-ads/index.tsx:46`, `linkedin-ads/index.tsx:46`, `paid-search/index.tsx:58`,
`organic-social/index.tsx:48`, `peec-ai/index.tsx:138`, `peec-ai/pr-influence.tsx:447`,
`peec-ai/content-impact.tsx:1020`). The peec-ai Overview call is guarded on
`{clientSlug && …}` because that component's `clientSlug` prop is optional.

> **Orphaned code:** `resolveCommentaryView(slug, subsection)` in [views.ts](./views.ts)
> is left over from the original page-level design, where the four route files mapped a
> route to a view key. Nothing in `app/` or `components/` calls it — only its own test
> does. The rest of `views.ts` is live (`CommentaryViewKey`, `COMMENTARY_VIEWS`, and
> `isCommentaryViewKey`, which `app/actions/commentary.ts` uses to validate a viewKey at
> runtime). Left in place deliberately; delete it only as its own change.

---

## Data model

One row per entry, `report_commentary` ([lib/db/schema.ts](../db/schema.ts)).
Many rows per `(client, viewKey)` form the version stream.

| Column | Note |
|---|---|
| `view_key` | Canonical key from [views.ts](./views.ts) — **not** a route slug |
| `body_html` | Sanitized on write |
| `period_start` / `period_end` | The commentary's own range, independent of the date picker |
| `status` | `draft` \| `approved` — no `deleted` status; see below |
| `deleted_at` / `deleted_by` | Soft delete (migration 0018) |
| `approved_by` / `approved_at` | Set on approve, nulled on revoke |

**Nothing is ever destroyed.** Three separate mechanisms rest on this:

- **Editing an approved entry forks a new draft row** rather than overwriting
  (`planCommentaryWrite`, [mutations.ts](./mutations.ts)). The client keeps reading the
  approved version while the edit is pending. Every version ever approved is still in
  the table.
- **Superseded rows are hidden at read time, not demoted or deleted.** Re-approving a
  period leaves the previous approved row untouched; `visibleEntries` simply shows the
  most recently approved one per period. This is what lets **revoke fall back** to the
  previously approved version with no row mutation.
- **Delete is soft.** `deleted_at` is set; the row stays for the approver history log
  and is recallable at the DB level.

**The `deleted ⇒ draft` CHECK constraint.** `report_commentary_no_deleted_approved`
(migration 0018) enforces `deleted_at IS NULL OR status = 'draft'` in the database,
mirroring the application rule that only drafts are deletable (`canDeleteDraft`). An
approved+deleted row is a state the history log has no way to describe, so the DB
forbids it. **This constraint is coupled to a race guard in the approve path** — see
[Write path](#write-path).

---

## Permissions

Two capabilities, derived per-request from the session ([permissions.ts](./permissions.ts)):

| Capability | Who | Rule |
|---|---|---|
| `canEdit` | Any `@avenuez.com` address | `canEditCommentary` — write, edit, delete drafts, see drafts |
| `canApprove` | The `COMMENTARY_APPROVERS` allowlist | `canApproveCommentary` — approve, revoke, see the history log |

`COMMENTARY_APPROVERS` is a comma-separated env var (see `.env.example`). An approver
must also be `@avenuez.com` — the allowlist narrows staff, it doesn't bypass the domain
check.

Note these are **not** the platform `ClientRole` values. Commentary permissions are
email-based and orthogonal to `INTERNAL_ADMIN` / `CLIENT_VIEWER` / etc. An
`INTERNAL_ANALYST` can edit commentary; an approver is a specific named person.

Any editor may delete any draft — a deliberate product decision (2026-07-14). Deleting
is not a greater power than editing, since an editor can already gut a draft by editing it.

---

## The client-safety boundary

**The governing rule: props cross the RSC→client boundary regardless of what renders.**
A JSX gate like `{canEdit && <Attribution />}` does *not* stop the data reaching the
browser — every field on every entry serializes into the bundle. So everything a client
must not receive is stripped **server-side, in the RSC**, before it becomes a prop.

All of this lives in `components/report-sections/commentary/index.tsx`. Three
separate redactions, each protecting a different data class:

| What | Mechanism | Protects against |
|---|---|---|
| Deleted rows | `visibleEntries` filters `!deletedAt` first, for every viewer | A deleted draft reaching a client |
| Staff attribution | `toClientSafeEntry` blanks `updatedBy`/`updatedAt`/`approvedBy`/`approvedAt`/`deletedAt`/`deletedBy` for non-editors | Internal emails + timestamps leaking |
| The history log | `historyEntries` returns `[]` unless `canApprove` | Superseded/deleted **body text** leaking |

The history gate is the load-bearing one: those entries carry body text that a client —
*and a non-approver editor* — must never receive. It is enforced in the RSC, not the
panel. **Do not move it into `CommentaryPanel`.**

Two ordering constraints that are easy to break:

- `toClientSafeEntry` blanks `updatedAt` to `''`. It must only run **after** any sort
  that reads `updatedAt` — `pickDefaultEntry` runs on the un-redacted list. A redacted
  entry feeding an `updatedAt` sort would silently mis-order.
- `tagVersion` checks `deleted` **before** the live-winner test. Unreachable today (the
  CHECK forbids approved+deleted), but it keeps the function correct regardless of how a
  caller builds `liveIds`.

The Approved/Draft badge is likewise hidden from clients — `commentary-panel.tsx` gates
it behind `canEdit`. That one is cosmetic; the three above are not.

---

## Read path

`getCommentaryForView(clientId, viewKey)` ([lib/db/queries.ts](../db/queries.ts)) is the
only read. `React.cache`-wrapped for per-render dedup; freshness after writes comes from
`revalidateTag('db', 'max')`, which every action calls.

Selection is pure and lives in [select.ts](./select.ts):

- `visibleEntries(entries, caps)` — drops deleted rows, dedupes to the most recently
  approved entry per period, then adds drafts for editors. **This is the only thing
  standing between a deleted draft and a client's screen**; every read path funnels
  through it.
- `pickDefaultEntry(entries)` — most recent period, tie-broken on `updatedAt`.
- `historyEntries(entries, caps)` — the full version stack grouped by period, tagged
  `live` / `superseded` / `deleted` / `draft`. Approvers only. Derived from the same
  `all` array, so it costs no extra query.

A client with nothing approved sees nothing (`index.tsx` returns `null`). Staff always
get the panel, so they can write the first entry.

---

## Write path

Four server actions in `app/actions/commentary.ts`, all returning
`{ ok: true } | { ok: false; error: string }`. All four are `(clientSlug, …)`-scoped:
a row must belong to the client named in the request (`authorizeRowForClient`), or the
action refuses. Missing and foreign rows return the **same** `'not found'`, so a caller
cannot probe which ids exist by diffing responses.

| Action | Who | Notes |
|---|---|---|
| `saveCommentary` | editor | Sanitize → validate → fork-or-update. Always lands as draft |
| `approveCommentary` | approver | Publishes to clients |
| `revokeCommentary` | approver | Back to draft; falls back to the previously approved version |
| `deleteCommentaryDraft` | editor | Soft delete; drafts only. `deleted_by` is the **authenticated** actor, never a parameter |

### Why the writes re-check `deleted_at IS NULL`

The guards **read, then write**. A delete landing in that window would slip through, so
the three sensitive writes re-assert `isNull(deletedAt)` in their `WHERE` clause and
check `.returning()` for a hit.

This is not defensive boilerplate — it is **coupled to the CHECK constraint**:

> Approving a row deleted in that window violates
> `report_commentary_no_deleted_approved`, and the driver **throws out of the action**
> rather than returning a `Result`. Matching on the deleted state at write time closes
> the window: the UPDATE simply matches nothing.
>
> **If you change the constraint, re-check the guard, and vice versa.**

And because an `UPDATE` matching zero rows *succeeds*, `.returning()` is what turns a
lost race into an explicit `'not found'` instead of `{ ok: true }` for a write that did
nothing — which the UI would report as success.

`revokeCommentary` is deliberately exempt from the `isNull` guard: it only ever writes
`status='draft'`, which no deleted row can violate, so racing a delete there is a
harmless no-op. Its `.returning()` check exists only for uniform `'not found'` semantics.

---

## Testing

Covered: the pure logic — `select.test.ts`, `mutations.test.ts`, `permissions.test.ts`,
`sanitize.test.ts`, `views.test.ts` — plus the RSC boundary
(`components/report-sections/commentary/index.test.tsx`, which inspects the **props
payload** rather than the DOM, since the DOM can't show you what crossed the boundary)
and panel rendering across client/editor/approver (`commentary-panel.test.tsx`).

**Known gap:** the server actions themselves have no tests — their auth gates,
client-scoping, and race guards are unexercised. Tracked in
[`ENGINEERS.md`](../../ENGINEERS.md) under Open Issues / Tech Debt.

---

## History

Three dated specs designed this feature in sequence. They are point-in-time records;
where they differ from this doc, **this doc and the code win**.

| Spec | What it designed | Still accurate? |
|---|---|---|
| `2026-07-06-report-commentary-design.md` | The feature: schema, sanitizer, permissions, draft→approved flow, editor | Mostly — but its **render path is obsolete** (page-level, via `resolveCommentaryView`), and its "no delete UI" non-goal was reversed |
| `2026-07-07-shared-report-parts-commentary-design.md` | Shared parts; commentary as the first one. The render path above | Yes, with two deltas: `resolveSharedParts` takes the registry as a parameter, and `mergePreservingSharedParts` was added later to stop a body-only save dropping a client's pin |
| `2026-07-14-commentary-history-and-soft-delete-design.md` | Approver history log + draft soft-delete | Yes. The code is *stricter* than the doc — server-side attribution stripping and the race guards came after it |
