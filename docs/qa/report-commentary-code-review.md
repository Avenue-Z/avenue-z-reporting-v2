# Report Commentary + Shared Report Parts — Code Review

Reviewed: the dashboard report commentary work merged into `dev` via **PR #132**
(feat: dashboard report commentary + shared report parts). Review scope is
exactly the diff `d506c460^..8617687e` — the 37 feature commits of PR #132,
merged via `8b91436` — no unrelated code.

Cross-referenced against the source-of-truth product docs: the **Dashboard
Report Commentary PRD**, the **stakeholder Q&A** (Maddie's answers), the
**"Decisions for Approval"** summary, and the **"Ren Comm QA"** test checklist.

This document is the review record (comprehension gate per `CLAUDE.md`
§"Code Review & Merge Process"). It captures how the feature works, the
findings, and how each finding was verified. **No code is changed here** — the
fixes are tracked as follow-ups in §5.

---

## 1. How it works (comprehension summary)

Two stacked pieces ship "client-ready commentary" as a per-client-controllable
block at the top of report views.

**A. Commentary (`report_commentary`).** Avenue Z staff write rich-text
commentary with its own reporting date range; a draft → approved flow gates
client visibility.

- **Entry model** (`drizzle/0017`, `lib/db/schema.ts:247`): one row per entry,
  columns `client_id`, `view_key`, `body_html`, `period_start/end` (own date
  range), `status` (`draft|approved`), `created_by/updated_by`,
  `approved_by/at`, timestamps. **No unique constraint** on `(client_id,
  view_key)` — deliberate, so multiple entries per view can coexist (history +
  the fork model below).
- **Permissions** (`lib/commentary/permissions.ts`, enforced server-side in
  `app/actions/commentary.ts`): `canEditCommentary` = any `@avenuez.com` (write
  and see drafts, on *any* client — deliberately coarse, per the Q&A "any Ave Z
  email… easier for OOO coverage"); `canApproveCommentary` = `@avenuez.com`
  **and** on the `COMMENTARY_APPROVERS` allowlist (Maddie/Dianna). Clients get
  neither capability.
- **XSS boundary** (`lib/commentary/sanitize.ts`): body HTML is sanitized
  **on write** with a tight allowlist (bold/italic/underline, lists, `h3`,
  links; `http/https/mailto` only; forced `rel="noopener noreferrer"
  target="_blank"`). A `javascript:` href a staffer types in Tiptap is stripped
  at save, so the stored HTML is the trusted artifact the viewer renders via
  `dangerouslySetInnerHTML`.
- **Draft isolation** (the "clients never see drafts" guarantee): the RSC
  `CommentarySection` (`components/report-sections/commentary/index.tsx:16`)
  filters `visibleEntries(all, caps)` **server-side** and passes only the
  client-visible set to the client `CommentaryPanel`. For a client (`canEdit`
  false) that is approved-only, so drafts are never serialized to the browser.
- **Fork-on-edit** (`lib/commentary/mutations.ts:19`): editing a *draft* updates
  it in place; editing an *approved* entry inserts a **new draft**, leaving the
  approved row untouched so the client-visible entry is never disturbed
  mid-review.
- **Default + history** (`lib/commentary/select.ts`): `pickDefaultEntry` shows
  the most recent entry by `period_start`, then `updated_at` — matching the
  spec's "most recent entry by its reporting period." Older entries are reached
  through the panel's `<select>` dropdown (shown when > 1 visible). Commentary is
  fetched by `(client, viewKey)` only (`getCommentaryForView`,
  `lib/db/queries.ts:281`), **not** by the dashboard date slider, so it does not
  auto-change when the dashboard range changes (per Decisions #5).

**B. Shared report parts** (commentary as a per-client opt-in part). Commentary
renders through the existing `reportSectionConfig` system rather than hard-wired
routes.

- `SectionOverride.sharedParts` (`lib/report-sections/types.ts:24`), validated
  independently against a `SHARED_PARTS` registry
  (`components/report-sections/shared/parts/registry.tsx`) whose `commentary`
  part's `render` returns the `CommentarySection` RSC.
- `SharedPartsHeader` (`shared/shared-parts-header.tsx`) resolves a client's
  opt-in for a `viewKey` and renders nothing when absent. It is placed once at
  the top of each of the **7 in-scope views** (`peec-ai`, `:pr-influence`,
  `:content-impact`, `paid-search`, `meta-ads`, `linkedin-ads`,
  `organic-social`); page-level rendering was reverted so commentary renders
  exactly once, only where a client opted in.
- Opt-in is keyed per `viewKey`, so the 3 AEO sub-tabs are independent.
- `mergePreservingSharedParts` (`lib/report-sections/mutations.ts:14`) keeps a
  body-only section re-save from dropping a client's commentary opt-in.
- Rollout is gated: migration 0017 + `COMMENTARY_APPROVERS` env + the idempotent
  `enable-commentary-renaissance` opt-in script; every other client shows
  nothing until similarly opted in.

**Tests:** the full suite is green (122 tests including the commentary/shared
-parts units; `tsc --noEmit` clean). The XSS and permission tests cover the real
vectors (`script`, event handlers, whitespace-obfuscated `javascript:`,
`img onerror`, iframe; the `evil@avenuez.com.attacker.io` domain-spoof edge).

---

## 2. Verification method

Every finding below was probed against the live working tree, not just read:

- **Static anchors** — each cited line/symbol confirmed present at the stated
  location in the merged code, and the *absence* findings (no supersede, no
  edit-log, no viewKey validation) confirmed by exhausting every write path in
  `app/actions/commentary.ts` and grepping for demote/supersede/archive.
- **Finding #1 proven by execution** — a temporary probe spec (since removed)
  ran the real shipped `planCommentaryWrite`, `visibleEntries`, and
  `pickDefaultEntry`: it confirmed editing an approved entry forks (`op:
  'insert'`), and that two approved entries for the same period both return from
  `visibleEntries` under client capabilities, with the stale one still present.
- **Full suite executed** — `vitest run` (122 passing) and `tsc --noEmit`
  (clean) reproduced the PR's green claims.
- **PLAUSIBLE findings** — the *code path* is confirmed; the *trigger* is a live
  data/DB condition not confirmable from source (e.g. whether a `default`
  client row exists and is opted in), so they are flagged as needing
  verification rather than asserted.

---

## 3. Findings

Severity: **●** correctness · **○** cleanup/convention. Status: CONFIRMED (proven
in-tree) / PLAUSIBLE (realistic, trigger unverified).

| # | Sev | Status | Location | Finding |
|---|-----|--------|----------|---------|
| 1 | ● | CONFIRMED | `app/actions/commentary.ts:72` + `lib/commentary/mutations.ts:20` | Approving a forked draft does not retire the prior approved row → two approved entries for the same period coexist, both client-visible with identical dropdown labels. Contradicts the QA checklist "newly approved version replaces the old client-visible version cleanly." |
| 2 | ● | PLAUSIBLE | `components/report-sections/peec-ai/index.tsx:138` | AEO Overview passes `clientSlug ?? 'default'` (the other 6 views pass `clientSlug` directly). If a `default` client row exists and is opted into commentary, its commentary renders in a no-client context. |
| 3 | ○ | CONFIRMED | `app/actions/commentary.ts:57` | `saveCommentary` persists `input.viewKey` with no allowlist check against the 7 canonical keys — unvalidated client input stored (harmless in display, but the body-config path validates strictly; this one doesn't). |
| 4 | ○ | CONFIRMED (observed live) | `components/report-sections/commentary/commentary-panel.tsx:91` | History/versioning shows "Last updated by {who}" but never *when* — needs the timestamp added. Confirmed in the live view. |
| 5 | ○ | CONFIRMED | `lib/db/schema.ts:255` | No edit-history log — schema keeps only last `updated_by/at`. The QA checklist's "internal log of edit history" is marked passed, but no such log exists (spec nice-to-have "if not too much work"). |
| 6 | ○ | CONFIRMED (intentional) | `app/actions/commentary.ts` (write model) | No delete or supersede path (v1 excludes delete by design), so forked drafts and superseded-approved rows accumulate with no cleanup — compounds #1's dropdown clutter over time. |
| 7 | ○ | CONFIRMED | `components/report-sections/commentary/commentary-panel.tsx:33` | After a fork-on-edit, the panel keeps the prior `selectedId` (client state survives `router.refresh()`), so the freshly created draft is not surfaced until the user reselects. |
| 8 | ○ | CONFIRMED | `lib/commentary/sanitize.ts:7` | Sanitizer allows `<u>`, but the Tiptap toolbar/StarterKit can't emit underline — dead allowlist surface. Cosmetic. |
| 9 | ○ | CONFIRMED (observed live) | `commentary-panel.tsx:63` | The history/period dropdown is already newest-first in the data, but nothing signals that the top item is the most recent. Make the descending order obvious so most-recent reads as top. Noticed in the live view. |

---

## 4. Detail

### 1 · ● Approve does not supersede the prior approved row — CONFIRMED
The write model forks on edit: `planCommentaryWrite('approved')` returns
`{ op: 'insert' }` (`lib/commentary/mutations.ts:20`), so editing an approved
entry inserts a **new draft** and leaves the old approved row in place — correct
and intended for keeping the client's live entry stable mid-review. But
`approveCommentary` (`app/actions/commentary.ts:72`) only flips the one target
row to `approved` (line 79); nothing demotes the previously-approved row for the
same `(client, view_key)`. Grepping every status write confirms there is no
supersede/demote/archive anywhere. So after "edit an approved entry → approve
the new draft," **two rows are `approved` for the same view**, and
`visibleEntries` (`lib/commentary/select.ts:4`) returns *all* approved rows to a
client. When the edit was a correction of the same reporting period, both rows
carry an identical `period_start–period_end` label in the client's dropdown
(`commentary-panel.tsx:71`), so the client sees two indistinguishable options
and can select the stale pre-edit content.

**Proven by execution:** a probe running the real `planCommentaryWrite`,
`visibleEntries`, and `pickDefaultEntry` confirmed `op: 'insert'` on approved,
and that `[A_approved, B_approved]` (same period) both return under client
capabilities with `pickDefaultEntry` → `B` while `A` remains present.

This is why it passes a quick live test — the newest sorts to the top, so it
*looks* replaced — but it maps directly onto the QA checklist item "Approve the
new draft and confirm the newly approved version **replaces the old
client-visible version cleanly**," which is not met: the old approved version is
not retired.

**Suggested fix:** in `approveCommentary`, within a transaction, demote any
other `approved` row for the same `(client_id, view_key)` back to `draft` (or a
new `superseded` state) before/with approving the target — so exactly one entry
per view is client-visible at a time. Decide with the team whether "supersede"
means same-period only or any prior approved for that view.

### 2 · ● AEO Overview `'default'` slug fallback — PLAUSIBLE
`peec-ai/index.tsx:138` renders `<SharedPartsHeader viewKey="peec-ai"
clientSlug={clientSlug ?? 'default'} />`; the other six views pass `clientSlug`
directly. `SharedPartsHeader` → `getClientBySlug('default')`: if no such client
row exists it returns null → renders nothing (harmless). But if a `default`
client row exists **and** is opted into `peec-ai` commentary, the AEO Overview
would render that client's commentary when `clientSlug` is undefined (a preview/
no-client context). The code path is confirmed; whether a qualifying `default`
row exists is a DB condition not checkable from source.

**Suggested fix:** pass `clientSlug` unchanged like the other six views (let the
null-client case render nothing), or make the fallback explicitly render no
shared parts.

### 3 · ○ Unvalidated `viewKey` on write — CONFIRMED
`saveCommentary` inserts `viewKey: input.viewKey` (`commentary.ts:57`) straight
from the client payload. The type is `CommentaryViewKey`, but types are erased
at runtime and this is a server action, so a crafted request can persist an
arbitrary `view_key`. It is harmless in display (a header only renders where a
matching `viewKey` exists), but it is unvalidated input reaching the DB, and it
diverges from the sibling `saveReportSectionConfig` path, which validates
strictly (`validateSectionOverride`). `resolveCommentaryView`/the 7-key union
already exists and isn't consulted here.

**Suggested fix:** reject a `viewKey` not in the 7 canonical keys (reuse the
`CommentaryViewKey` set) before insert.

### 4 · ○ "Who" without "when" — CONFIRMED (observed live)
The panel renders `Last updated by {selected.updatedBy}`
(`commentary-panel.tsx:91`) but never renders `updatedAt`. Confirmed in the live
view: the history/versioning area shows who changed the commentary but not when.
The Q&A lists "who changed it and when" as a nice-to-have; the code delivers who,
not when, so it needs addressing.

**Suggested fix:** append the formatted `updatedAt` next to `updatedBy`.

### 5 · ○ No edit-history log — CONFIRMED
The schema stores only the *last* editor/time (`updated_by/updated_at`,
`schema.ts:255`); there is no history table, no per-edit log, and fork-on-edit
overwrites a draft in place. The PRD/Q&A list an "internal edit log… only if not
too much work" as a nice-to-have, so its absence is acceptable for v1 — **but**
the "Ren Comm QA" checklist marks "Confirm there is an internal log of edit
history" as passed, which the code does not support. Worth reconciling so the
checklist reflects reality.

**Suggested fix (if wanted later):** append-only `report_commentary_revisions`
row on each write; otherwise, un-mark that checklist item.

### 6 · ○ No cleanup path for stale rows — CONFIRMED (intentional)
v1 deliberately ships no delete button (Decisions #7). Combined with #1 (no
supersede) and fork-on-edit, superseded-approved rows and abandoned drafts
accumulate per view with no way to remove them, and every approved one stays in
the client's dropdown. Not a v1 blocker on its own, but it compounds #1 and will
grow the dropdown over a client's lifetime.

**Suggested fix:** ships with #1 (supersede on approve). A staff-only "archive"
(soft delete) is the natural follow-up when delete is added.

### 7 · ○ Stale panel selection after a fork — CONFIRMED
`CommentaryPanel` seeds `selectedId` from `initialId` once via `useState`
(`commentary-panel.tsx:33`), and `refresh()` uses `router.refresh()` (a soft
nav that preserves client-component state). After editing an approved entry —
which forks a new draft server-side — the panel re-renders with new `entries`
but keeps the old `selectedId`, so the new draft isn't surfaced until the user
opens the dropdown and selects it. Minor UX.

**Suggested fix:** after a successful save, select the returned/newest entry
(e.g. reset `selectedId` when the `initialId`/entries identity changes, or have
the save action return the new id).

### 8 · ○ `<u>` allowed but non-emittable — CONFIRMED
`sanitize.ts:7` allows `u`, but the editor's toolbar and StarterKit don't
produce underline, so the tag is dead allowlist surface. Cosmetic — no behavior
impact.

**Suggested fix:** drop `u` from `allowedTags`, or add an underline control if
underline is wanted.

### 9 · ○ History dropdown ordering not obvious — CONFIRMED (observed live)
The period/history dropdown maps `entries` in order (`commentary-panel.tsx:63`),
and that array is already newest-first — `getCommentaryForView` orders by
`period_start DESC, updated_at DESC` (`lib/db/queries.ts:287`). So the data is
correct, but the UI gives no cue that the top item is the most recent; the
options are bare date ranges. Noticed in the live view: the descending order
isn't clear.

**Suggested fix:** signal the ordering — e.g. label the first option "Latest",
sort/pin most-recent to the top explicitly, or add a "most recent first" hint on
the dropdown.

---

## 5. Follow-ups (not fixed here)

Tracked separately so this stays a pure review record:

- **Correctness:** #1 (supersede on approve — the one client-visible gap vs the
  QA checklist) and #2 (AEO Overview `'default'` fallback).
- **Needs a live/DB check first:** #2's trigger (does a `default` client row
  exist and is it opted in?).
- **Convention / hardening:** #3 (validate `viewKey` on write).
- **Observed live (address these):** #4 (show *when*, not just who) and #9 (make
  the history dropdown's most-recent-on-top ordering obvious).
- **Spec-checklist reconciliation:** #5 (edit-log marked passed but not
  implemented) — a nice-to-have; reconcile the checklist or schedule it.
- **Cleanup:** #6 (stale-row accumulation, ships with #1), #7 (stale panel
  selection), #8 (drop `<u>`).

None block the merged, opt-in-gated feature (it is off until a client is opted
in). **#1 is the highest-value follow-up** — it is the one item that reaches a
client and directly contradicts a checklist item marked passed. The core
permission model, XSS boundary, draft isolation, and date-decoupling all verify
as correct and are well-tested.
