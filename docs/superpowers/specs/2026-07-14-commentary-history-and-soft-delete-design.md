# Commentary: approver history log + draft soft-delete — design

**Date:** 2026-07-14
**Status:** approved, pending implementation
**Source:** stakeholder feedback round on `feat/report-commentary` (two Should-Haves)

> 1. *"Right now, the log of edit history is not accessible by the user. Can we make this full log accessible to the approvers only?"*
> 2. *"Ability to soft-delete drafts. If someone creates a draft and then wants to delete it, have a button that they can click to delete the draft. I was thinking 'soft delete' could be a way to do this where if we needed to recall a deleted draft with version control, that would still be possible."*

---

## 0. The framing correction: versioning already exists

The feedback assumed both items require building version control. They don't — **the versioning is already there, it's just invisible.**

Editing an approved entry forks a **new row** rather than overwriting (`planCommentaryWrite`, `lib/commentary/mutations.ts`), so every version that was ever approved is still in `report_commentary`. Nothing has ever been destroyed. The `fix/commentary-supersede-approved` branch *hides* superseded rows from the dropdown; it does not delete them.

So neither feature needs a version table, a revision number, or a history-tracking subsystem:

- **The history log** is a read view over rows that already exist.
- **Soft-delete** is the only schema change, and it's one nullable column pair — because "soft delete" is precisely *"a row that still exists but is filtered out"*, which is the mechanism already running the entire panel.

This is the single most important thing for a reviewer to understand: the diff is small **because the data model was already right**.

---

## 1. Data model

One migration on `report_commentary`:

```sql
ALTER TABLE report_commentary
  ADD COLUMN deleted_at timestamptz,
  ADD COLUMN deleted_by text;
```

- Deleted means `deleted_at IS NOT NULL`.
- The `commentary_status` enum stays `draft | approved`. A deleted row **keeps** `status = 'draft'`, so the history log can still report *what it was* when it was deleted. Adding a `'deleted'` status would destroy that information.
- Only drafts are ever deletable (§3), so `status = 'approved' AND deleted_at IS NOT NULL` is not a state the app can produce.

Corresponding fields on `CommentaryEntry` (`lib/commentary/types.ts`): `deletedAt: string | null`, `deletedBy: string | null`, mapped in `toCommentaryEntry` (`lib/db/queries.ts`) like the other timestamps.

---

## 2. Selection logic — one choke point, in `select.ts`

Every view already funnels through `visibleEntries`. Two changes there:

**`visibleEntries`** drops deleted rows first, then behaves exactly as it does today:

```ts
const alive = entries.filter((x) => !x.deletedAt)
```

That one filter fixes the client view and the staff dropdown simultaneously.

**`historyEntries(entries, caps)`** is new. Returns `[]` unless `caps.canApprove`; otherwise returns every row — superseded, drafts, and deleted — grouped by reporting period, each tagged with a derived label:

| Tag | Rule |
|---|---|
| `deleted` | `deletedAt != null` |
| `live` | wins `mostRecentApprovedPerPeriod` (reuses the existing function) |
| `superseded` | approved, but not the winner |
| `draft` | anything else |

Derivation is pure and testable, and adds **no new DB query** — it re-reads the rows `getCommentaryForView` already fetched.

---

## 3. Server action — `deleteCommentaryDraft(clientSlug, id)`

- Gated by `canEditCommentary`: **any Avenue Z editor** may delete **any** draft. Deleting is not a greater power than editing — an editor can already gut a draft's contents by editing it. Ownership (`createdBy`) is deliberately *not* checked; commentary enforces no row ownership anywhere today, and requiring it would block the ordinary case of a teammate clearing an abandoned draft.
- Refuses anything that is not a live draft (`status === 'draft' && !deletedAt`), so an approved entry can never be deleted out from under a client, and a double-delete is a no-op.
- Verifies row-to-client ownership via `authorizeRowForClient` (added in `fix/commentary-action-client-scoping`).
- Sets `deletedAt` / `deletedBy`, then `revalidateTag('db', 'max')`.

The draft/deleted guard is a **pure predicate** in `lib/commentary/mutations.ts` beside `planCommentaryWrite`, so it is unit-testable without a DB. This follows the convention set by `lib/report-sections/mutations.ts`: a `'use server'` module may only export async actions, so testable cores live outside it.

---

## 4. UI — both inside the existing panel

**Delete button** — next to Edit, shown only when `canEdit && selected.status === 'draft'`, behind a confirm step.

**History disclosure** — at the bottom of the panel, collapsed by default, rendered only when `canApprove`. Read-only: each version shows its tag, author, timestamp, and body. **No restore button** (see §6).

### The one non-obvious constraint

The RSC must compute the history **server-side** and pass an **empty array** to non-approvers.

Props cross the RSC→client boundary into the browser bundle. Gating the log by hiding the JSX alone would still ship every superseded and deleted body to anyone who opens devtools. The gate belongs in `components/report-sections/commentary/index.tsx`, not in the panel — the panel's `capabilities` checks are defense-in-depth, not the boundary.

---

## 5. Testing

Pure-logic tests carry most of it (`lib/commentary/select.test.ts`, `mutations.test.ts`):

- deleted rows excluded from `visibleEntries` for **both** client and staff
- the four-way tag derivation (`live` / `superseded` / `deleted` / `draft`)
- `historyEntries` returns `[]` for a non-approver
- the delete guard rejects approved rows and already-deleted rows

Panel render tests (`commentary-panel.test.tsx`, the harness added in `fix/commentary-hide-client-timestamp`) cover button/section visibility across the three viewer types: client, editor, approver.

---

## 6. Explicitly out of scope

- **No restore/undelete UI.** The history log is read-only by decision. Recall of a deleted draft is a DB operation — which matches how the feedback framed it (*"if we needed to recall"*). The row survives; nothing in the UI resurrects it.
- **No history for clients or non-approver editors.** `canApprove` only.
- **No hard delete.** Nothing in this feature removes a row.

---

## 7. Dependencies

This work sits on top of two branches that must merge into `feat/report-commentary` first:

- **`fix/commentary-supersede-approved`** (PR #149) — edits the same `visibleEntries` function, and the `superseded` tag is only meaningful once it lands.
- **`fix/commentary-action-client-scoping`** (PR #150) — provides `authorizeRowForClient`, which `deleteCommentaryDraft` reuses rather than duplicating.

(`fix/commentary-hide-client-timestamp`, PR #148, is independent but provides the panel test harness.)
