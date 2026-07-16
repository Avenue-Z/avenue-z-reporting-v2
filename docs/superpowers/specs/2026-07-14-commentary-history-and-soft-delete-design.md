# Commentary: approver history log + draft soft-delete — design

**Date:** 2026-07-14
**Status:** ✅ Implemented in full — **including all three §8 gates.** Accurate.
**Source:** stakeholder feedback round on `feat/report-commentary` (two Should-Haves)
**Revised:** 2026-07-14 after design review (see §8 for the gates it added)

> Current architecture: [`lib/commentary/ENGINEERS.md`](../../../lib/commentary/ENGINEERS.md).
> Every §1–§6 claim shipped as designed, and the §8 gates cleared: the DB CHECK
> constraint (`report_commentary_no_deleted_approved`) and the payload-inspecting
> boundary test both exist. The code is now **stricter** than this doc in ways it
> never contemplated, all consistent with its own reasoning:
>
> - **Attribution is stripped server-side for non-editors** (`toClientSafeEntry`).
>   This is §4's argument — *props cross the boundary regardless of what renders* —
>   applied to a data class §4 only ever applied it to `history`. §4 is incomplete
>   here, not wrong.
> - **The sensitive writes carry `isNull(deletedAt)` race guards.** This doc doesn't
>   model the read-then-write window, and the guard is coupled to the §1 CHECK
>   constraint: without it, approving a row deleted in that window violates the
>   constraint and throws out of the action. See the write-path section of the
>   ENGINEERS doc.
> - **The Approved/Draft badge is hidden from clients**, and `revokeCommentary`
>   returns a uniform `not found` — both below this doc's altitude.
>
> One stale line: §2 says the action file *"only ever selects `status` and
> `client_id`"*. `findCommentaryRow` now also selects `deletedAt`. The invariant that
> sentence protects — never reads `body_html`, never returns rows to a caller — still
> holds.

> 1. *"Right now, the log of edit history is not accessible by the user. Can we make this full log accessible to the approvers only?"*
> 2. *"Ability to soft-delete drafts. If someone creates a draft and then wants to delete it, have a button that they can click to delete the draft. I was thinking 'soft delete' could be a way to do this where if we needed to recall a deleted draft with version control, that would still be possible."*

---

## 0. The framing correction: versioning already exists

The feedback assumed both items require building version control. They don't — **the versioning is already there, it's just invisible.**

Editing an approved entry forks a **new row** rather than overwriting (`planCommentaryWrite`, `lib/commentary/mutations.ts`), so every version that was ever approved is still in `report_commentary`. Nothing has ever been destroyed. The `fix/commentary-supersede-approved` branch *hides* superseded rows from the dropdown; it does not delete them.

So neither feature needs a version table, a revision number, or a history-tracking subsystem:

- **The history log** is a read view over rows that already exist.
- **Soft-delete** is the only schema change, and it's one nullable column pair — because "soft delete" is precisely *"a row that still exists but is filtered out"*, which is the mechanism already running the entire panel.

### Do not let this framing wave you past the risk

The reframing is true, and it is also the most dangerous thing in this document, because "we already have the data model" reads as "this is trivial." It is not trivial. It is: two columns, a filter in the hot read path, a new derivation function, a server action, two UI surfaces, and **one genuine security boundary (§4)**.

Small diff ≠ low risk. The RSC-boundary requirement in §4 is the load-bearing wall; everything else is bookkeeping.

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

### The invariant is enforced in the DB, not just in prose

Only drafts are deletable (§3), so `status = 'approved' AND deleted_at IS NOT NULL` should be unreachable. But that is an *application-code* promise: it holds only as long as the §3 guard holds, for every future caller. Nothing about the schema enforces it.

So the schema enforces it. Drizzle exports `check()` from `pg-core` (verified against the installed `drizzle-orm`), so this is expressible in `lib/db/schema.ts` rather than as hand-written SQL:

```ts
check('report_commentary_no_deleted_approved', sql`${table.deletedAt} IS NULL OR ${table.status} = 'draft'`)
```

which generates:

```sql
ALTER TABLE report_commentary
  ADD CONSTRAINT report_commentary_no_deleted_approved
  CHECK (deleted_at IS NULL OR status = 'draft');
```

Cheap, and it converts a documented assumption into an enforced one. A future caller that tries to soft-delete an approved row now fails loudly at the DB instead of silently producing a state the history log cannot describe.

### Provenance of `deleted_by`

`deleted_by` is the **authenticated actor**, read server-side from `session.user.email` inside the action — exactly like `updated_by` and `approved_by`. It is never client-supplied: `deleteCommentaryDraft(clientSlug, id)` takes **no actor parameter**, so there is no channel through which a caller could assert a different identity. This matters because the whole point of an approver-visible audit log is that its attribution is trustworthy.

Corresponding fields on `CommentaryEntry` (`lib/commentary/types.ts`): `deletedAt: string | null`, `deletedBy: string | null`, mapped in `toCommentaryEntry` (`lib/db/queries.ts`) like the other timestamps.

---

## 2. Selection logic — one choke point, in `select.ts`

### The choke point is genuinely single — verified, not assumed

The entire safety of "deleted rows never reach a client" rests on *every* read path funnelling through `visibleEntries`. A single raw query elsewhere (an export, a PDF job, an analytics task) would leak deleted and superseded content regardless of what `select.ts` does. Verified 2026-07-14:

| Symbol | Production consumers |
|---|---|
| `getCommentaryForView` | **1** — `components/report-sections/commentary/index.tsx:16` |
| `visibleEntries` | **1** — `components/report-sections/commentary/index.tsx:17` |
| `reportCommentary` (table) | `lib/db/queries.ts` (the one query above) and `app/actions/commentary.ts` |

The action file only ever selects `status` and `client_id` for its guards — it never reads `body_html` and never returns rows to a caller. No export, PDF, or analytics path touches commentary at all.

**This is an invariant, not a fact to be assumed on the next change.** It is true today because there is exactly one reader. Any new consumer of `getCommentaryForView` MUST go through `visibleEntries` (or `historyEntries`), and a reviewer adding one should treat that as a hard requirement — the filter is the only thing standing between a deleted draft and a client's screen.

Two changes in `select.ts`:

**`visibleEntries`** drops deleted rows first, then behaves exactly as it does today:

```ts
const alive = entries.filter((x) => !x.deletedAt)
```

That one filter fixes the client view and the staff dropdown simultaneously.

**`historyEntries(entries, caps)`** is new. Returns `[]` unless `caps.canApprove`; otherwise returns every row — superseded, drafts, and deleted — grouped by reporting period, each tagged with a derived label.

**The tags are ordered, and the order is part of the contract.** A row that was approved and then deleted must resolve to `deleted`, not `superseded` — so `deleted` is checked *before* the approved-winner logic. This is a precedence rule, not a list; implement it as an explicit early return and test the collision directly (§5):

| # | Tag | Rule | Checked |
|---|---|---|---|
| 1 | `deleted` | `deletedAt != null` | **first — wins over everything below** |
| 2 | `live` | wins `mostRecentApprovedPerPeriod` (reuses the existing function) | |
| 3 | `superseded` | approved, but not the winner | |
| 4 | `draft` | anything else | fallback |

To be precise about *why* rule 1 matters, since it's easy to argue it away: the `live` winner is computed by `mostRecentApprovedPerPeriod`, which is only ever fed rows with `status === 'approved'`. A deleted row keeps `status = 'draft'` (§1), so it cannot enter the winner set — and the CHECK constraint now makes `approved + deleted` unreachable in the DB besides. **So the collision is not reachable through the app.**

Rule 1 is therefore defense-in-depth, and it is still worth having: it makes `historyEntries` correct *independent of how the winner set happens to be constructed*, so a later refactor that widens the input (say, ranking over all rows rather than approved ones) cannot silently relabel a deleted row as `live`. The test in §5 hand-constructs the forbidden `approved + deletedAt` row precisely because the pure function must be robust to input the DB will not produce.

Derivation is pure and testable, and adds **no new DB query** — it re-reads the rows `getCommentaryForView` already fetched.

---

## 3. Server action — `deleteCommentaryDraft(clientSlug, id)`

> ### ✅ DECIDED — any Avenue Z editor may delete any draft
>
> **Decided by Paul, 2026-07-14**, with the design review's objection explicitly in front of him.
>
> The rationale: deleting is not a greater power than editing, since an editor can already gut a draft by editing its contents to nothing; and commentary enforces no row ownership (`createdBy`) anywhere today, so adding one here would be novel and would block the ordinary case of clearing a teammate's abandoned draft.
>
> **Signed off by Tina (the stakeholder for this feedback round) on 2026-07-14, as-is**, after being shown the trade-off and the two alternatives (author-only-plus-approvers, or approver-only). Design review had flagged this as a product decision that Paul could not take alone; that gate is now properly closed.
>
> The trade-off she accepted, recorded because it remains true: to this guard, *clearing an abandoned draft* and *binning a colleague's in-progress draft* are the same operation. If that ever becomes a problem in practice, both alternatives are small changes to this one guard, not a redesign.

- Gated by `canEditCommentary`: any Avenue Z editor may delete any draft.
- Refuses anything that is not a live draft (`status === 'draft' && !deletedAt`), so an approved entry can never be deleted out from under a client.
- **A double-delete returns an explicit failure, not a silent success.** Re-deleting an already-deleted row returns `{ ok: false, error: 'not found' }` — the same shape every other rejection uses. A silent `{ ok: true }` would let the UI report "deleted" for an operation that did nothing, which is exactly the kind of lie a confirm dialog must not tell.
- Verifies row-to-client ownership via `authorizeRowForClient` (added in `fix/commentary-action-client-scoping`).
- Sets `deletedAt` / `deletedBy`, then `revalidateTag('db', 'max')`.

The draft/deleted guard is a **pure predicate** in `lib/commentary/mutations.ts` beside `planCommentaryWrite`, so it is unit-testable without a DB. This follows the convention set by `lib/report-sections/mutations.ts`: a `'use server'` module may only export async actions, so testable cores live outside it.

---

## 4. UI — both inside the existing panel

**Delete button** — next to Edit, shown only when `canEdit && selected.status === 'draft'`, behind a confirm step.

**History disclosure** — at the bottom of the panel, collapsed by default, rendered only when `canApprove`. Read-only: each version shows its tag, author, timestamp, and body. **No restore button** (see §6).

### The load-bearing wall

The RSC must compute the history **server-side** and pass an **empty array** to non-approvers.

Props cross the RSC→client boundary into the browser bundle. Gating the log by hiding the JSX alone would still ship every superseded and deleted body to anyone who opens devtools. The gate belongs in `components/report-sections/commentary/index.tsx`, not in the panel — the panel's `capabilities` checks are defense-in-depth, not the boundary.

Two hardening rules follow, and both are testable:

**1. The test must inspect the payload, not the DOM.** A render-only assertion — *"the history section doesn't appear for a client"* — passes while the data leaks. That test is worse than none, because it manufactures confidence. The real test mocks `CommentaryPanel`, renders the RSC, captures the props it actually received, and asserts `history` is `[]`. **This is the one test to block the PR on.**

**2. The panel must never fetch history client-side.** If the boundary passes `[]` but the panel has *any* path to fetch its own history, the gate is gone. Verified 2026-07-14: `CommentaryPanel` has no fetch path — it only invokes server actions and `router.refresh()`. Keep it that way; this is one careless `useEffect` from being false.

> **The `rsc-boundary` CI check does NOT cover this.** Its name invites exactly that assumption. `scripts/check-rsc-props.ts` guards *serializability* — a Server Component passing a **function** prop to a Client Component, which throws "Functions cannot be passed directly to Client Components" at render time. It is a **crash guard, not a confidentiality guard**: it has no opinion about a Server Component shipping data the viewer should not see. Green CI says nothing about the leak described in this section. Gate 3 needs its own test.

---

## 5. Testing

**The one that blocks the PR** — the RSC boundary payload (§4). Mock `CommentaryPanel`, render `commentary/index.tsx` as a non-approver, capture the props it receives, assert `history` is `[]`. Not a DOM assertion: a render-only test goes green while the bodies still cross into the bundle.

Pure-logic tests carry the rest (`lib/commentary/select.test.ts`, `mutations.test.ts`):

- deleted rows excluded from `visibleEntries` — asserted **separately for the client view and the staff dropdown**, since §2 claims one filter fixes both paths. Prove both; don't infer the second from the first.
- the four-way tag derivation (`live` / `superseded` / `deleted` / `draft`)
- **the precedence collision (§2):** a hand-constructed `status: 'approved'` + `deletedAt` row — a state the DB now forbids — must tag `deleted`, never `live`. The pure function has to be robust to input the app cannot produce.
- `historyEntries` returns `[]` for a non-approver
- the delete guard rejects approved rows and already-deleted rows, returning an explicit failure (§3)

Panel render tests (`commentary-panel.test.tsx`, the harness added in `fix/commentary-hide-client-timestamp`) cover button/section visibility across the three viewer types: client, editor, approver.

---

## 6. Explicitly out of scope

- **No restore/undelete UI.** The history log is read-only by decision. Recall of a deleted draft is a DB operation — which matches how the feedback framed it (*"if we needed to recall"*). The row survives; nothing in the UI resurrects it.
- **No history for clients or non-approver editors.** `canApprove` only.
- **No hard delete.** Nothing in this feature removes a row.

---

## 7. Dependencies — ✅ SATISFIED 2026-07-14

Both hard dependencies are merged into `feat/report-commentary`:

- **`fix/commentary-supersede-approved`** (PR #149, merged `2aa779a`) — edits the *same* `visibleEntries` function this feature edits; the `superseded` tag is meaningless without it.
- **`fix/commentary-action-client-scoping`** (PR #150, merged `c9afda5`) — provides `authorizeRowForClient`, which `deleteCommentaryDraft` reuses rather than duplicating.

The feature branch must therefore be cut from `feat/report-commentary` at `c9afda5` or later. (These two conflicted on merge — both edited the `approveCommentary` docstring — resolved in `46821c3`.)

**Still open: `fix/commentary-hide-client-timestamp` (PR #148).** Not a correctness dependency, but it adds `commentary-panel.test.tsx`, the render-test harness the §5 panel tests build on. If it has not merged when implementation starts, the feature branch creates that file itself and PR #148 will conflict on it.

---

## 8. Gates before implementation

Added by design review, 2026-07-14. The first three are engineering and are now specified above; the fourth is not an engineering decision.

| # | Gate | Status |
|---|---|---|
| 1 | DB CHECK constraint enforces `deleted ⇒ draft` (§1) | **Specified** — `check()` confirmed available in installed `drizzle-orm` |
| 2 | Prove `visibleEntries` is genuinely the only read path (§2) | ✅ **Verified 2026-07-14** — 1 consumer of `getCommentaryForView`, 1 of `visibleEntries`, no export/PDF/analytics path touches commentary |
| 3 | RSC-boundary leak has a test that inspects the **payload**, not the DOM (§4, §5) | **Specified — still to write. Blocks the PR.** Note the existing `rsc-boundary` CI check does *not* cover it (§4) |
| 4 | Product signs off on any-editor-deletes-any-draft (§3) | ✅ **Closed 2026-07-14** — **signed off as-is by Tina**, the stakeholder, after being shown the trade-off and both alternatives (§3) |
| 5 | Hard dependencies #149 / #150 merged (§7) | ✅ **Closed 2026-07-14** — both in `feat/report-commentary` |

**All gates are closed except #1 and #3, which are implementation work.** Nothing external now blocks starting.
