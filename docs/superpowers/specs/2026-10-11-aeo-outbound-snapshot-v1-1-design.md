# AEO Outbound Snapshot v1.1: everything editable, self-service, correct

Status: draft amendment (2026-10-11), step 2 of my spec regimen. It changes the main spec
(`2026-10-08-aeo-outbound-snapshot-design.md`, "the spec") only where it says so; everything else there still governs.
Sources: my requests on 2026-10-11 ("every single thing on the page needs to be able to be edited", an Edit button at the
top, an itinerary of everything sent, 100% self-service, data contracts, the backtest, opens done perfectly) and the
three-auditor review (`aeo-outbound-audit-notes/findings/2026-10-11-three-auditor-review.md`). Code citations are to
`feat/aeo-outbound-parts` at `06e68c0d`.

## 1. Goal and non-goals

Ryan creates, edits, approves, sends and tracks every snapshot himself, for any prospect, without an engineer.
Not in v1.1 (parked, each with its reason in §12): per-recipient links, Google Doc or PDF export, editing chart data.

## 2. Edit mode and the Edit button

- Today: editing is always on in a draft, the only cue is a dashed outline on hover (`lib/aeo-outbound/render.ts:17`),
  and there is no Edit control; Live and Revoked show a read-only preview with no hint.
- New: the editor toolbar has an **Edit** button (primary, first in the toolbar) on a Draft. A draft opens in **Preview**
  (exactly what the prospect will see). **Edit** switches the frame to edit mode and the button becomes **Done editing**.
  In edit mode: every editable element carries a visible resting dashed outline, a solid accent outline and a small
  "Edit" chip on hover and focus, and a banner under the toolbar reads: "Editing. Click any outlined text to change it.
  Changes save automatically. Charts come from Peec: to change them, change the dates and Rerun."
- Clicking text that is not editable (chart data only, §3) shows for 3 seconds: "Charts come from Peec data. Change the
  dates and Rerun to update them."
- Live and Revoked: the **Edit** button reads **Edit a copy** with the hint "This report is frozen. Editing makes a new
  draft." (the existing `copyAsDraft`, `lib/aeo-outbound/store.ts:120-131`).
- The mode is a client state of the editor; the draft HTML is the same document with an `edit` flag sent to the frame by
  `postMessage({type:'mode', edit})`, so switching never reloads the frame or loses an unsaved keystroke.

## 3. Every piece of text is editable

- Today: 25 slots (`render.ts:37-40,89,95-96,100,121,130,136`; path list `lib/aeo-outbound/slots.ts:24`). Fixed in code:
  the brand (`render.ts:61,71,88,157,173,175`), "AI Visibility Snapshot" (`:70,87,154`), the sidebar nav labels (`:74-78`),
  "Data window" (`:89`), the KPI labels and values (`:58`), section labels and titles (`:103-104,111-112,125-126`), chart
  titles (`:107,115`), "Why it matters" (`:120`), table headers (`:129`), the takeaway (`:133`), the Methodology and Next
  step labels (`:136`), and the footer (`:142-163`).
- New: every visible text on the page is a slot. The `Slots` type gains:
  - `brand`: the display name, used everywhere the brand shows (hero, sidebar, `<title>`, meta description, footer,
    roster bolding). Default: Peec's own-brand name.
  - `window_label`: default `data.windowLabel`.
  - `kpis`: `[{label, value}]`, one per KPI card shown. Default: `data.kpis`.
  - `page`: a record of every fixed string, keyed by a closed list of keys (`series`, `nav_1` to `nav_5`,
    `headline_label`, `section_1_label`, `section_1_title`, `section_2_label`, `section_2_title`, `chart_1_title`,
    `chart_2_title`, `why_title`, `opps_label`, `opps_title`, `opps_col_1` to `opps_col_3`, `opps_takeaway`,
    `method_label`, `next_label`, `footer_name`, `footer_desc`, `footer_link`, `footer_series`, `footer_disclaimer`,
    `sidebar_wordmark`, `sidebar_powered`, `sidebar_link`). Defaults: today's literals and `DECISIONS` values (the section
    titles default from settings, §8).
  - Bullet lists: Ryan may remove a bullet (keeping at least 2) or add one (up to 3), per his skill ("two or three").
    Paths `competitive_bullets.add`, `competitive_bullets.2.remove`, and the same for `sources_bullets`.
- Path grammar (closed, `slots.ts:24` extended): the existing paths plus `brand`, `window_label`, `kpis.<i>.label`,
  `kpis.<i>.value`, `page.<key>` for the listed keys, and the add and remove paths. Unknown paths stay a 400.
- Limits: `page.*` labels, `kpis.*`, `brand`, `window_label`: 1 to 120 characters; `footer_desc` and
  `footer_disclaimer`: 1 to 1,000; existing limits unchanged.
- Stored rows from before v1.1 have none of the new keys: a missing key reads its default, so old rows render
  exactly as before and become editable (no migration of the jsonb).
- Not editable: chart data (bars, slices, values). Chart titles are editable. Links keep their fixed destination; their
  text is editable.
- Numbers Ryan types are allowed, and never silently: the grounding check (spec §6) also runs on `brand`, `kpis.*.value`
  and `window_label` against the Peec values, and a KPI value that differs from Peec's adds the checklist item "AI
  visibility shows 16% but Peec says 15.5%". It does not block Approve (my "zero drift" rule is met by making every
  difference visible before sending).

## 4. "Before you send" replaces Notes

- Today: a closed-by-default drawer of raw strings (`components/aeo-outbound/editor.tsx:310-318`), slot paths shown as
  paths, internal ids, and Notes copied from props only once (`editor.tsx:56-57`), so it can go stale.
- New: a panel open by default on a draft, toolbar button "Before you send (N)" with a live count of open items:
  1. **Fill these in** (blocks Approve): each "Needs validation" field.
  2. **Check these** (does not block): grounding flags, KPI or brand changes from Peec, the high-visibility warning, a
     missing metric, no competitors tracked, long dashes.
  3. **Ryan's own checks** (manual ticks, from his skill's QA gate): "Every claim matches the numbers on the page"; "No
     mention of the discovery call, pricing or other agencies"; "Findings and hypotheses are kept apart". Ticks are kept
     per editor session (not stored) and do not block.
  4. **About this data** (collapsed): "Peec project: {name} ({pitch | pitch ended}). Covers {window in words}.
     Models: {list}. Rank compares {brand} with the {n} brands tracked in Peec. Project id {id} (for support)."
- Every item names the field in plain words from one label map (for example `competitive_bullets.0.lead` reads
  "{section 1 title}, bullet 1, bold lead-in"), shared by the panel, grounding flags and save errors. Clicking an item
  enters edit mode, scrolls the frame to the field, focuses it and flashes its outline (`postMessage({type:'focus', path})`).
- Notes become structured: `{kind, path?, text}`; stored string notes from older rows show under "Check these".
- The panel and the Approve state re-sync from the server whenever the row's status or revision changes (fixes the
  stale state). Approve stays clickable; with open "Fill these in" items it opens the panel at the first one and says
  "Fill in N items first" (no disabled button without a reason).

## 5. The hub is an itinerary

- Header subtitle: "One-page AI visibility snapshots for prospects. Generate, edit, approve, send and track."
- Status tabs with counts: All, Drafts, Sent (live), Revoked, Failed. One search box over brand, Peec project, sent to
  and created by. Sortable columns. 50 rows a page, client-side.
- Columns: Brand, Peec project, Status, Created (date and time, by whom), Sent (link created: date and time), Sent to,
  Opens, Actions. Created by and approved by come from existing columns (`created_by`, `approved_by`).
- Empty states: first use "No snapshots yet. Pick a Peec project above and click Generate."; no results "No snapshots
  match. Clear filters."
- Failed rows show their reason as visible text, in plain words with the next step (§7), and get an **Open** action.
- Every row's requested range shows under the project name when Ryan picked one.

## 6. Opens, done properly

- Mechanism today (unchanged as the counting rule): a GET of `/snapshot/{token}` counts once unless it is a HEAD, a staff
  session, or one of the listed link-preview bots (`app/snapshot/[token]/route.ts:38-61`,
  `lib/aeo-outbound/opens.ts:16-21`), stored as `open_count`, `first_opened_at`, `last_opened_at` (`store.ts:113-117`).
- New: every counted open is also stored as an event in a new table `aeo_outbound_opens` (`report_id`, `opened_at`,
  `ua_family` text such as "Chrome on Mac", `likely_automated` boolean, `reason` text). No IP address and no full user
  agent are stored.
- `likely_automated` when: within 60 seconds of the link being created; 2 or more opens within 10 seconds; or a user
  agent with no browser family. Reason recorded ("Opened within a minute of sending").
- Shown: hub "3 opens: 1 likely person, 2 likely automated", with first and last opened as date and time; the editor
  shows the open list for Live and Revoked rows. The caveat is visible text: "Email security scanners can open links
  automatically. Opens marked automated are likely scanners."
- The counter columns stay as they are; the events are the detail.

## 7. Generation that explains itself

- Stages: the generating row stores its current step (new column `progress_step`, 1 to 9, 9 = writing copy), written by
  the existing `onStep` callback (`lib/aeo-outbound/pull.ts:54-60`). The hub and editor show "Pulling Peec data (step 3 of
  8)… 0:18" then "Writing the copy… 0:41", and "Usually about a minute."
- Different projects can generate in parallel (the one-per-project index already allows it, `store.ts:24-25`).
- When the hub is left, the result lands on its row; the client never jumps Ryan to a page he left.
- Whether a generation survives a closed tab is unverified (spec §7a); until the first preview deploy proves it, the copy
  says "Keep this tab open until it finishes."
- Failure reasons in plain words, each with a next step: step 4 timeout or row cap: "Peec took too long on the full
  history. Pick a start and end date (90 days at most) and Rerun."; own-brand count: "In Peec, mark exactly one brand as
  the client's own brand, then Rerun."; no data: "Peec has no data for this project in that period."; copy failures:
  "Writing the copy failed. Rerun. If it fails twice, send engineering this id: {id}."

## 8. Self-service settings

- Today: who can use the tool is the env var `AEO_OUTBOUND_USERS` (`lib/aeo-outbound/permissions.ts:5-18`); Ryan's
  decisions are code constants (`lib/aeo-outbound/config.ts` `DECISIONS`).
- New: a **Settings** page in the tool (`/tools/new-business/settings`) for tool admins, stored in a new single-row table
  `aeo_outbound_settings`: users (emails), admins (emails), default section titles, default next-step sentence (or none),
  rank among (all tracked, or N), Peec opportunity rows, methodology states prompts and models, allow customer projects
  (today's `pitchOnly`, inverted), sidebar wordmark. Every change records who and when.
- The env var stays the floor: an email in `AEO_OUTBOUND_USERS` is always a user and an admin (so nobody is ever locked
  out); the settings list adds users. Admins are those env emails plus the settings admins.
- `config.ts` values become the defaults used when the settings row is absent.
- The no-access page names who to ask: "Ask a New Business admin ({admin names}) to add you."

## 9. Data correctness

Fixes from the data audit, each with a test:
- The prospect always shows on its own Competitive Visibility chart: when it is outside the top 10, it replaces the 10th
  bar (`lib/aeo-outbound/charts.ts:45`), and the Data block's top-5 line adds it the same way (`prompt.ts:30`).
- Several own domains: each own domain is listed with its own retrieved chats and its own percentage; no summed count is
  paired with one domain's percentage (`metrics.ts:145-147`).
- A project with no competitors drops the share-of-voice card and its Data block value (it is 100% by construction), with
  a note.
- Gap points always print one decimal ("1.0 points") (`prompt.ts:31`); the gap list is capped at the 5 nearest brands
  above.
- `/actions/list` pages until it has 10 PENDING actions or runs out (`pull.ts:123`).
- The donut hover reads "Retrievals" (`charts.ts:79`).
- Smaller: a missing Peec key answers 502 JSON, not a crash (`app/api/aeo-outbound/generate/route.ts:64`); a 400
  bad-request shows its own message; the date inputs get `min` (today minus 400 days) and `max` (today) and the range
  error clears when a date changes; the white frame flash becomes the report's black with "Loading report…".
- Browser safety: the frame and the public page allow `allow-popups allow-popups-to-escape-sandbox` so the avenuez.com
  links open; `contenteditable` falls back to `true` with plain-text paste where `plaintext-only` is unsupported; the
  AIVx table sort (which strips text cells to digits) is removed from the opportunities table by cloning its header after
  the AIVx script runs.

## 10. Data contracts

- Today no Peec response is validated (casts only, `pull.ts:60,92,116`), stored jsonb is cast (`store.ts:16`), and a
  missing `visibility` publishes "NaN%" (proven offline by the data audit).
- contract-core is Python and can't run in this Node runtime, so its model is applied with `zod` (a new direct dependency,
  my decision 2026-10-11): one declared schema per boundary in `lib/aeo-outbound/contracts.ts`: each Peec endpoint used
  (only the fields read: proportions 0 to 1, counts non-negative integers, unused fields passed through), the Glean reply
  slots, the generate and slots request bodies, the settings row, and the stored `data`, `slots` and notes with a
  `schema_version`.
- `checkContract(boundary, schema, value)`: per-boundary mode observe, warn or enforce (in settings defaults), a kill switch
  env `CONTRACT_DISABLED`, one log line per violation naming the boundary, field and issue, never a value. Enforce throws a
  `PeecError` naming the field, so a drift fails the generation with a reason instead of publishing a wrong number.
- Rollout: every boundary starts in enforce for the fields that reach the page (visibility, share of voice, position,
  retrieved chats, retrieval counts) and observe for the rest.

## 11. Copy link, dialogs, picker

- Copy link awaits the clipboard: "Copied" for 2 seconds with a live-region announcement; on failure, "Couldn't copy.
  Select the link and copy it." with the URL in a read-only field. After Approve the link shows in a read-only field next
  to Copy.
- In-app dialogs replace every `window.confirm` (Revoke, Discard, Rerun over a draft): they name the brand, the recipient
  and the consequence, use verb buttons ("Revoke link", "Keep link"), focus the safe button, trap focus, close on Escape
  and return focus. Approve's button reads "Approve and create link".
- The project picker is a searchable combobox; each project shows its status and "{n} snapshots, last {date}"; while
  loading it says "Loading Peec projects…".
- Unsaved edits are protected on leave (existing) and in Preview mode (switching modes flushes first).

## 12. Parked, with reasons

- Per-recipient links (a second link over the same frozen page): wait for Ryan's feedback on v1.1; Edit a copy covers it.
- Google Doc or PDF export: his skill asks for a Docs-ready page; ask him whether the link replaces that.
- Editing chart data: charts are Peec data by design; dates and Rerun change them.

## 13. Migrations

`0027`: the `aeo_outbound_opens` table, the `progress_step` column, the `aeo_outbound_settings` table. Additive only.
Dev first on my written go, the same host-guarded procedure as `0026` (`MIGRATIONS-PENDING.md`).

## 14. Edge cases

| Case | Behavior |
|---|---|
| A row saved before v1.1 | Renders as before from defaults; editable; old string notes show under "Check these". |
| Ryan clears a field | Refused ("This field can't be empty."), as today; removing a bullet is the add/remove path. |
| Ryan changes a KPI value | Saved; "Check these" item naming Peec's value; Approve not blocked. |
| Ryan changes the brand | Used everywhere the brand shows, including the roster bolding and grounding exemptions. |
| Two tabs edit | Unchanged: the second save gets 409 and stops with Reload. |
| An open within 60s of sending | Counted and marked likely automated with its reason. |
| Settings row missing | `config.ts` defaults; env users only. |
| Last admin removes themself | Refused: the env admins always remain. |
| Peec field missing or wrong type | Enforced boundary: generation fails naming the field; observed boundary: a log line. |

## 15. Tests (written before the code)

Slots: every new path saves, validates its limit and refuses unknown keys; defaults fill a pre-v1.1 row; add and remove
bullets keep 2 to 3. Render: every visible text in draft carries `data-slot` except chart data; preview and final carry
none; brand used in all six places. Editor: Edit and Done editing switch mode without reloading the frame; the banner;
the locked-text message; Live shows Edit a copy; the checklist groups, labels, counts and click-to-focus; Approve with
open items opens the panel; re-sync on status change; copy feedback and failure field; dialogs (focus, Escape, verbs).
Hub: tabs and counts, search, sort, paging, empty states, failed reason visible, Open on failed. Opens: event rows and the
three automated rules; no IP stored. Generation: progress step written per step; parallel projects; plain failure texts.
Settings: env floor, admins only, audit fields, defaults when absent. Data: own brand on chart, own domains paired,
single-brand card dropped, decimals, gap cap, actions paging, hover label, contracts (each boundary, modes, kill switch, no
values in logs, NaN path refused).
