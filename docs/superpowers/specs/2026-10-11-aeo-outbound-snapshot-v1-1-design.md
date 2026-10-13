# AEO Outbound Snapshot v1.1: everything editable, self-service, correct

Status: draft amendment (2026-10-11), step 2 of my spec regimen. Amendment 5 (§16, 2026-10-12) adds Ryan's answers,
the share link and live progress. It changes the main spec
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
  "Edit" chip on hover and focus (CSS `::after` only: the frame saves `textContent`, so no child element is added), and a banner under the toolbar reads: "Editing. Click any outlined text to change it.
  Changes save automatically. Charts come from Peec: to change them, change the dates and Rerun."
- Clicking something not editable posts `locked`; the editor shows for 3 seconds either "Charts come from Peec data. Change
  the dates and Rerun to update them." (`chart`) or "This part is set automatically." (`fixed`, the exempt items in §3).
- Live and Revoked: the **Edit** button reads **Edit a copy** with the hint "This report is frozen. Editing makes a new
  draft." (the existing `copyAsDraft`, `lib/aeo-outbound/store.ts:120-131`).
- The mode is a client state of the editor. The draft HTML marks every slot with `data-slot` but no `contenteditable`; the
  frame script makes slots editable only in edit mode. Handshake: on load the frame posts `{type:'ready'}`; the parent
  answers `{type:'mode', edit}` and re-sends it on every `ready` (a reload after a structural change, §3). Switching modes
  flushes pending edits first and never reloads the frame. Frame to parent messages: `ready`, `dirty` and `edit` (with
  `path`), `locked` (with `what`: `chart` or `fixed`), `structure` (with `op`: `add` or `remove`, and `path`: the list,
  or the bullet to remove); parent to frame: `mode`, `flush`, `focus` (with `path`). The parent
  keeps its source check (only its own frame) and requires `path` only for `dirty`, `edit` and `structure` (today it drops any message
  without one, `components/aeo-outbound/editor.tsx:125`).
- In edit mode the frame script cancels clicks inside links and the sidebar nav, so clicking to edit never navigates; in
  Preview links work (the frame's sandbox adds `allow-popups allow-popups-to-escape-sandbox`).

## 3. Every piece of text is editable

- Today: 25 to 29 slots (2 or 3 bullets a list; `render.ts:37-40,89,95-96,100,121,130,136`; path list `lib/aeo-outbound/slots.ts:24`). Fixed in code:
  the brand (`render.ts:61,71,88,157,173,175`), "AI Visibility Snapshot" (`:70,87,154`), the sidebar nav labels (`:74-78`),
  "Data window" (`:89`), the KPI labels and values (`:58`), section labels and titles (`:103-104,111-112,125-126`), chart
  titles (`:107,115`), "Why it matters" (`:120`), table headers (`:129`), the takeaway (`:133`), the Methodology and Next
  step labels (`:136`), and the footer (`:142-163`).
- New: every visible text on the page is a slot. The `Slots` type gains:
  - `brand`: the display name, used everywhere the brand shows (hero, sidebar, `<title>`, meta description, footer,
    roster bolding, the long-name rule now read from the slot, and the own brand's bar label). Each save of `brand` also
    writes `brand_name`, so the hub, toolbar, frame title, dialogs and search use it. Default: Peec's own-brand name. When
    it differs from Peec's and the Peec name still appears in other slots, a "Check these" item reads "The copy still says
    {Peec name} in N places".
  - `window_label`: default `data.windowLabel`.
  - `kpis`: `[{label, value}]`, one per KPI card shown. Default: `data.kpis`.
  - `page`: a record of the page's fixed words, keyed by a closed list. One key drives every place its words appear:
    `series` ("AI Visibility Snapshot": hero series, sidebar, and the footer series shown uppercase); `headline_label`
    (sidebar nav 01 and the headline label); `section_1_title` and `section_2_title` (sidebar nav 02 and 03, the section
    label after "02 / " and "03 / ", and the section heading); `opps_label` (sidebar nav 04 and the label after "04 / ");
    `method_nav` (sidebar nav 05); `category_label`, `market_label`, `window_prefix` ("Category:", "Market:", "Data
    window:"); `chart_1_title`, `chart_2_title`; `why_title`; `opps_title`; `opps_col_1` to `opps_col_3`; `opps_takeaway`;
    `method_label`; `next_label`; `prepared_label` ("Prepared"); `footer_name`; `footer_desc`; `footer_link`;
    `footer_disclaimer`; `sidebar_wordmark`; `sidebar_powered`; `sidebar_link`.
  - One editable spot per key, the others mirror it: `series` is edited in the hero; each section title in its section
    heading; `headline_label` in the headline label; `opps_label` in the section label; the brand in the hero. The other
    copies render as plain text carrying `data-mirror="{path}"` (no `data-slot`, never editable); after a save the frame
    updates every mirror of that path from the saved value (the footer series uppercased by CSS-free `toUpperCase` at
    render). Clicking a mirror posts `locked` with `what: 'fixed'` and the message "Edit this where it first appears on the
    page." The frame keeps exactly one element per editable path (today's `els[p]=el`, `render.ts:18`, stays correct).
  - Fixed by design, and shown as `fixed` when clicked: the nav numbers 01 to 05 and the "02 / " style prefixes
    (numbering), the Prepared date (set at approval), the share button (final page only, AIVx's own block). The `<title>`
    and meta description are built from `brand` and `series`.
  - Defaults are resolved when the row is created: generation writes every new key into `slots` (section titles and the
    wordmark from settings at that moment, §8); Edit a copy copies them. A row from before v1.1 with missing keys resolves
    each to the `config.ts` constants and today's literals, never to live settings, so a settings change never alters an
    existing draft or copy.
  - Bullet lists, per his skill ("two or three"): an **Add bullet** control under a list of 2, a **Remove** control on
    each bullet of a list of 3. Paths `<list>.add` and `<list>.<i>.remove` (i = 0 to 2), `value` the literal
    `"structure"` (ignored; keeps the §9a non-empty rule). A new bullet's lead and text are "Needs validation", which
    blocks Approve until filled. The controls are inside the frame (edit mode only); a click posts `structure`. The editor
    hands it to the save queue as a structural item: the queue first sends every pending edit, then sends the structural
    PATCH as its next request with the queue's current revision, and on the 200 takes the returned revision exactly like any
    save (so the next keystroke carries the right revision). The PATCH response for a structural path also carries
    `slots`; the editor then re-fetches the frame (which posts `ready`, so the mode is re-sent) and drops per-session "Looks
    right" ticks for that list. While a structural item is queued or in flight, the frame is read-only. Notes and
    grounding recompute with the new indices.
- Path grammar (closed, `slots.ts:24` extended): the existing paths plus `brand`, `window_label`, `kpis.<i>.label`,
  `kpis.<i>.value`, `page.<key>` for the listed keys, and the add and remove paths. Unknown paths stay a 400.
- The AIVx look is unchanged: preview and final emit no `data-slot` and no wrapper element, so the final HTML of a
  pre-v1.1 row equals v1.0's apart from the deliberate §9 changes (a golden test). In draft, a text that shares an
  element with other text gets a wrapping `<span data-slot>` that `EDITOR_STYLE` resets to `display:inline; font:inherit;
  color:inherit` (so AIVx's `.sidebar-industry span` rule does not restyle it), and editable table headers get
  `user-select:text`.
- Limits: `page.*` labels, `kpis.*`, `brand`, `window_label`: 1 to 120 characters; `footer_desc` and
  `footer_disclaimer`: 1 to 1,000; existing limits unchanged.
- Stored rows from before v1.1 have none of the new keys: a missing key reads its `config.ts` default, so old rows render
  as before apart from the deliberate §9 changes, and become editable (no migration of the jsonb).
- Not editable: chart data (bars, slices, values). Chart titles are editable. Links keep their fixed destination; their
  text is editable.
- Numbers Ryan types are allowed, and never silently. The grounding check (spec §6) runs on every slot, with
  `avenuez.com` always an allowed domain. A KPI value is compared with Peec's after removing `%`, `#` and commas, as a
  number at Peec's displayed precision ("16%" vs Peec 15.5% differs; "15.5" equals). The rank card ("#3 of 12 brands") is
  compared by its number tokens in order: both must match Peec's (3 and 12), and the item reads "Competitive rank shows #2
  of 12 brands but Peec says #3 of 12 brands". A KPI label is not compared; `window_label` is compared as text
  with Peec's label. A difference adds the "Check these" item "AI visibility shows 16% but Peec says 15.5%". It does not
  block Approve (my "zero drift" rule is met by making every difference visible before sending).

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
  4. **About this data** (collapsed): "Peec project: {name} ({pitch | pitch ended}, stored in `data` from version 2).
     Covers {window in words}. Models: {list}." then the rank-basis note exactly as metrics writes it (it already
     handles a rank-among cut, `metrics.ts:111-113`), then "Project id {id} (for support)."
- Every item names the field in plain words from one label map (for example `competitive_bullets.0.lead` reads
  "{section 1 title}, bullet 1, bold lead-in"), shared by the panel, grounding flags and save errors. Clicking an item
  enters edit mode, scrolls the frame to the field, focuses it and flashes its outline (`postMessage({type:'focus', path})`).
- Notes become structured: `{kind, path?, text}` with full paths. Kinds and groups: Fill these in: `needs_validation`.
  Check these: `number_not_in_data`, `domain_not_in_data`, `long_dash`, `kpi_changed`, `brand_changed`, `high_visibility`,
  `missing_metric`, `no_competitors`, `no_data_brands`. About this data: `rank_basis`, `requested_range`, `project`,
  `peec_warning`, `own_domains`, `empty_source_mix`, `no_profile`. Every existing note in `metrics.ts:105-180` and
  `pull.ts` maps to one kind (the plan lists each). The PATCH response becomes `{revision, notes: Note[],
  needsValidation: string[]}`; the editor accepts Note objects and, from older rows, plain strings (shown under "Check
  these"). New rows store `Note[]` in `data.notes` under `schema_version` 2 (§10).
- N counts open "Fill these in" items plus "Check these" items not yet marked **Looks right** (a per-session tick on each
  check item) and still produced by the latest save.
- The panel and the Approve state re-sync from the server whenever the row's status or revision changes (fixes the
  stale state). Approve stays clickable; with open "Fill these in" items it opens the panel at the first one and says
  "Fill in N items first" (no disabled button without a reason).

## 5. The hub is an itinerary

- Header subtitle: "One-page AI visibility snapshots for prospects. Generate, edit, approve, send and track."
- Status tabs with counts: All, Drafts, Sent (live), Revoked, Failed. One search box over brand, Peec project, sent to
  and created by. Sortable columns. 50 rows a page, client-side.
- Columns: Brand, Peec project, Status, Created (date and time, by whom), Sent (link created: date and time), Sent to,
  Opens, Actions. `hubColumns` (`store.ts:133-148`) adds `createdBy`, `approvedBy`, `requestedStart`, `requestedEnd`,
  `errorCode`. Tab counts come from one count query per status, so they cover every row; the list keeps every live row
  and the 500 newest others, with "Show older" loading the next 500.
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
- `likely_automated` when: within 60 seconds of the link being created (`approved_at`, now selected by the live-token
  read); within 10 seconds of the previous open of the same link; or a user agent in no browser family. `ua_family` comes
  from a fixed pattern list (Edge, Chrome, Safari, Firefox, Opera, each with Mac, Windows, iOS, Android or Linux), else
  "Other". Reason recorded ("Opened within a minute of the link being created").
- One statement (a CTE) inside the existing 1.5s budget updates the counter and inserts the event with its classification
  read in the same statement, so the counter and the events agree. Two opens in the same instant may both miss each other
  (best effort, stated in the caveat). Opens before v1.1 have no events: the hub shows "{n} not classified" for the
  difference.
- Shown: hub "3 opens: 1 likely person, 2 likely automated", with first and last opened as date and time; the editor
  shows the open list for Live and Revoked rows. The caveat is visible text: "Email security scanners can open links
  automatically. Opens marked automated are likely scanners."
- The counter columns stay as they are; the events are the detail.

## 7. Generation that explains itself

- Stages: the generating row stores its current step in a new column `progress_step`, written from the existing `onStep`
  callback (`lib/aeo-outbound/pull.ts:54-60`) by one unawaited `UPDATE ... SET progress_step = $n WHERE id = $id AND
  status = 'generating' AND progress_step < $n` that never throws and logs one line on error, so it cannot slow the run
  or land out of order. Pull emits steps 1 to 6 and 8 (there is no step 7); `generate.ts` writes 9 before the Glean call.
  The column is `integer not null default 0`.
  How progress is shown, step 10 and the live poll are in §16.3 ("Usually 35 to 45 seconds": measured 34.7s in the dev
  run, 35.8s and 40.6s in the trials).
- Different projects can generate in parallel (the partial unique index allows one per project,
  `lib/db/schema.ts:527`). The hub tracks pending generation per project: Generate is disabled only for a project already
  generating, and Rerun only on its own row.
- A finished generation shows "Draft ready: {brand}. Open" on its row; the hub opens the editor only when Ryan is still on
  the hub. The client never jumps Ryan to a page he left.
- Whether a generation survives a closed tab is unverified (spec §7a); until the first preview deploy proves it, the copy
  says "Keep this tab open until it finishes."
- Failure reasons in plain words, each with a next step. A failed row stores a new `error_code` beside the existing
  `error` text. The code travels on the error object (`PeecError` gains an optional `code`; `generateSnapshot` returns
  `{ok:false, error, code}`), never by matching message text; the UI maps the code to display text (it knows the row id). Codes: `no_project` (`pull.ts:57`): "This Peec
  project isn't available any more. Pick another."; `own_brand_count` (`:62`): "In Peec, mark exactly one brand as the
  client's own brand, then Rerun."; `no_data` (`:87`): "Peec has no data for this project in that period. Pick other
  dates."; `own_brand_no_row` (`:93`) and `zero_retrievals` (`:117`): "Peec's report for this period is empty. Pick other
  dates or check the project in Peec."; `history_too_long` (default range, step 4 timeout or row cap): "Peec took too long
  on the full history. Pick a start and end date (90 days at most) and generate again."; `timeout` (any other timeout):
  "Peec or the copy writer took too long. Rerun."; `copy_failed` and `copy_outside_sources`: "Writing the copy failed.
  Rerun. If it fails twice, send engineering this id: {id}."; `peec_error`: "Peec returned an error. Rerun in a few
  minutes."; `contract_violation`: "Peec's data changed shape ({field}). Send engineering this id: {id}."; `stale` (`store.ts:20`): "It stopped before finishing. Rerun."; `internal`: "Something went wrong on our side.
  Rerun, or send engineering this id: {id}." A row without a code (before v1.1) shows its stored text.

## 8. Self-service settings

- Today: who can use the tool is the env var `AEO_OUTBOUND_USERS` (`lib/aeo-outbound/permissions.ts:5-18`); Ryan's
  decisions are code constants (`lib/aeo-outbound/config.ts` `DECISIONS`).
- New: a **Settings** page in the tool (`/tools/new-business/settings`) for tool admins, stored in a new single-row table
  `aeo_outbound_settings` (key column `id boolean primary key default true check (id)`), with every change also appended
  to `aeo_outbound_settings_log` (who, when, which field, old and new value). Fields and limits, validated on save:
  users and admins (lists of emails, each trimmed, lowercased, `@avenuez.com`, at most 200 characters, at most 50 each);
  section titles (1 to 60 characters each); next-step sentence (none, or 1 to 300 characters); rank among (all tracked, or
  an integer 2 to 50); most opportunities from Peec recommendations (0 to 3, a ceiling, §16.1); methodology states
  prompts and models (yes or no); sidebar wordmark (AIVx or Avenue Z, default Avenue Z per §16.1; the default for
  `page.sidebar_wordmark`). `pitchOnly` stays in code: the full-history bound
  was measured on pitch projects only.
- Access: one async `outboundAccess(user)` replaces `outboundEmail` everywhere (pages, routes, actions). It keeps the
  staff and `@avenuez.com` checks for every email; a user is on `AEO_OUTBOUND_USERS` or the settings users; an admin is on
  `AEO_OUTBOUND_USERS` or the settings admins. If the settings read fails, access falls back to `AEO_OUTBOUND_USERS` only
  and logs one line. Settings are read once per request and passed as parameters to metrics, prompt, grounding (which
  today builds a constant from `DECISIONS` at module load, `grounding.ts:14`), render and the editor props (which today
  reads `DECISIONS` in the client, `editor.tsx:140`).
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
- `/actions/list` pages until it has 10 PENDING actions, runs out, or reaches 5 pages (`pull.ts:123`).
- The donut hover reads "Retrievals" (`charts.ts:79`): a deliberate difference from AIVx, so the donut golden test removes
  `hovertemplate` before comparing, as the bar test already does.
- Smaller: a missing Peec key answers 502 JSON, not a crash (`app/api/aeo-outbound/generate/route.ts:64`); a 400
  bad-request shows its own message; the date inputs get `min` (today minus 400 days) and `max` (today) and the range
  error clears when a date changes; the white frame flash becomes the report's black with "Loading report…".
- Browser safety: the editor frame, the view route and the public page use exactly `sandbox allow-scripts allow-popups
  allow-popups-to-escape-sandbox` (CSP header and iframe attribute) so the avenuez.com links open; `contenteditable` falls back to `true` with plain-text paste where `plaintext-only` is unsupported; the
  AIVx table sort (which strips text cells to digits) is removed from the opportunities table, in every mode, by cloning
  its header after the AIVx script runs and before the edit script runs (render order: AIVx script, the clone, then the
  editor script; the editor script also binds through one delegated listener on `document`, so a cloned or re-rendered
  node never loses its handlers).

## 10. Data contracts

- Today no Peec response is validated (casts only, `pull.ts:60,92,116`), stored jsonb is cast (`store.ts:16`), and a
  missing `visibility` publishes "NaN%" (proven offline by the data audit).
- contract-core is Python and can't run in this Node runtime, so its model is applied with `zod` (a new direct dependency
  pinned to 4.3.6, already in the lockfile as a transitive dependency; my decision 2026-10-11; this amends the plan's
  "Never edit `package.json`" constraint and the main spec's "No change to `package.json`"): one declared schema per boundary in `lib/aeo-outbound/contracts.ts`: each Peec endpoint used
  (only the fields read: proportions 0 to 1, counts non-negative integers, unused fields passed through), the Glean reply
  slots, the generate and slots request bodies, the settings row, and the stored `data`, `slots` and notes with a
  `schema_version`.
- `checkContract(boundary, schema, value)`: per-boundary mode observe, warn or enforce (in settings defaults), a kill switch
  env `CONTRACT_DISABLED`, one log line per violation naming the boundary, field and issue, never a value. Enforce throws a
  `PeecError` naming the field, so a drift fails the generation with a reason instead of publishing a wrong number.
- Field rules follow main spec §7: `visibility` is a required number 0 to 1; `share_of_voice` and `position` may be absent
  or null (position was missing on up to 25 of 52 brands, main spec line 224); counts are null or non-negative integers.
  Peec boundaries start in enforce for these fields and in observe for the rest.
- Failure by boundary: a Peec violation in enforce throws a `PeecError` naming the field and carrying the code
  `contract_violation` (generation fails with that code and the field in `error`); a Glean reply violation is a shape problem fed to the existing retry once (`generate.ts:59-60`); a
  request body violation keeps today's 400 bodies and messages; a stored row that fails its contract shows "This snapshot
  was saved by an older version and can't be shown. Rerun it." in the editor and a 404 on the public link is never
  produced by it (approved rows serve their frozen HTML, which is not re-validated).
- Stored `data` gains `schema_version` (absent = 1). `dataBlock` and render read both shapes: a version 1 row keeps the
  version 1 own-site line and notes, so grounding on its saves is unchanged (tested by saving a version 1 row).

## 11. Copy link, dialogs, picker

- The link itself (domain and brand name) is built as §16.2 says.
- Copy link awaits the clipboard: "Copied" for 2 seconds with a live-region announcement; on failure, "Couldn't copy.
  Select the link and copy it." with the URL in a read-only field. After Approve the link shows in a read-only field next
  to Copy.
- In-app dialogs replace every `window.confirm` (Revoke, Discard, Rerun over a draft): they name the brand, the recipient
  and the consequence, use verb buttons ("Revoke link", "Keep link"), focus the safe button, trap focus, close on Escape
  and return focus. Approve's button reads "Approve and create link".
- The project picker is a searchable combobox; each project shows its status and "{n} snapshots, last {date}"; while
  loading it says "Loading Peec projects…".
- Unsaved edits are protected on leave: the Back link and in-app navigation open the in-app dialog ("You have unsaved
  edits. Leave anyway?") and navigate only on Leave; closing the tab keeps the browser's `beforeunload` prompt.

## 12. Parked, with reasons

- Per-recipient links (a second link over the same frozen page): wait for Ryan's feedback on v1.1; Edit a copy covers it.
- Google Doc or PDF export: his skill asks for a Docs-ready page; ask him whether the link replaces that.
- Editing chart data: charts are Peec data by design; dates and Rerun change them.

## 13. Migrations

`0027`: the `aeo_outbound_opens` table, the `progress_step` and `error_code` columns, the `aeo_outbound_settings` table
and its log table. Additive only. Dev first on my written go, the same host-guarded procedure as `0026`
(`MIGRATIONS-PENDING.md`). Dry runs: dev must show exactly `0027` (it already has `0026`); staging shows `0026` and
`0027`; production shows `0025`, `0026` and `0027` and needs `0025` first on my go. `0026` is applied on dev, so it can no
longer be renumbered at merge (main spec §4): if `dev` gains another `0026`, mine keeps its number and the other is
renumbered.

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
Settings: env floor, admins only, the log table, defaults when absent, validation limits, a settings read failure falling
back to the env list, a settings change not altering an existing draft. Frame: the ready, mode and locked handshake;
links cancelled in edit mode; add and remove with edits pending; a version 1 row saving unchanged; the exact CSP header;
the donut golden carve-out; the progress_step guard; the open counter equal to the event count. Data: own brand on chart, own domains paired,
single-brand card dropped, decimals, gap cap, actions paging, hover label, contracts (each boundary, modes, kill switch, no
values in logs, NaN path refused).

## 16. Amendment 5 (2026-10-12): Ryan's answers, the share link, live progress

Sources: Ryan's answers to the main spec §13 questions (his Google Doc, 2026-10-12, and his Slack reply on Q10 at 9:53 AM;
recorded in `aeo-outbound-audit-notes/findings/2026-10-12-ryan-answers.md`), and my requests the same day: lock the link's
domain, put the brand name in the link, and show clear, step-by-step progress while a snapshot generates. Code citations
are to `feat/aeo-outbound-parts` at `0ac4b5b9`. Where this section and an earlier one disagree, this section governs.

### 16.1 Ryan's answers

Each answer is a `DECISIONS` value in `lib/aeo-outbound/config.ts:3-28`. Q1, Q2, Q5, Q6, Q7 and Q10 are settings
defaults under §8; Q3, Q4, Q8 and Q9 stay code constants (§8). Q1, Q2, Q4, Q6, Q8 and Q9 match today's values and change
nothing. Q4's answer adds "only confirmed Peec numbers": the Data block carries only Peec's figures (`prompt.ts:45-58`),
and a number Ryan types that is not in it is a "Check these" item before sending (§3, §4 `number_not_in_data`). Four answers change:

- **Q3, a specific category: `writeSpecificCategory` becomes `true`.** The prompt already asks for `category` when it is
  on (`prompt.ts:90`); Task 3b adds "at most 80 characters" to that line. Generation uses Glean's `category` only when it is
  a string that is 1 to 80 characters after `cleanValue` (`slots.ts:26`; `MAX_LEAD`, `slots.ts:21`). Anything else,
  including a missing key, keeps Peec's category or "Needs validation" (`generate.ts:30`) and is never a retry or a
  failure: today a non-string is ignored (`generate.ts:59`), and a category problem must not fail a run whose other
  fields are good (`generate.ts:61,70`). Ryan's edit limit for `category` becomes 80 too (today 1,000, `slots.ts:41`).
  Numbers and domains in `category` are already checked on every row (`grounding.ts:36-37`); the only exemption is the
  long-dash check (`CODE_SET`, `grounding.ts:14,38`). On a version 2 row `category` keeps that exemption only while it
  equals the code value (`data.category ?? NEEDS_VALIDATION`, which Glean can't fix), so a long dash in a written or
  edited category is flagged; a version 1 row keeps the exemption always.
- **Q5, Peec recommendations only when relevant: `peecOpportunityRows` keeps the value 1 but becomes a ceiling.** The
  prompt's rule (`prompt.ts:88`, today "exactly N of the 3 must be based on those actions") becomes: "If the Peec
  recommended actions list is not "none", you may base at most N of the 3 on those actions, and only where an action fits
  the data. Never force one. An opportunity based on an action has a signal that starts with "Peec recommends"." With 0
  the prompt says nothing about actions, as today. Nothing else checks the count (the phrase "Peec recommends" appears in
  no code outside the prompt and a test fixture). The §8 setting reads "Most opportunities from Peec recommendations (0 to
  3)".
- **Q7, one next step for every report: `fixedNextStep` becomes the sentence from Ryan's own example:** "A comprehensive
  AEO audit can validate these patterns across prompt demand, citations, source influence, owned content, earned media,
  and technical readiness." That it is this sentence is my reading of his "This looks repeatable, yes"; it is unconfirmed
  with him and is one settings value to change (§8). Generation already writes a fixed sentence into `next_step`
  (`generate.ts:32`). `next_step` skips the long-dash check only while it equals the row's fixed sentence; once Ryan edits
  it, a long dash he types is flagged. A version 1 row reads `V1_SETTINGS_USED.fixedNextStep`, frozen to null
  (`metrics.ts:18`), so its checks are unchanged. Ryan can still edit the sentence on any draft.
- **Q10, no AIVx on the report: `showAivxName` becomes `false`.** The only visible "AIVx" on the page is the sidebar
  wordmark (`render.ts:66`); the favicon is the Avenue Z "Z". The wordmark default, and so `page.sidebar_wordmark` on every
  new report, is "Avenue Z". The §8 setting keeps both choices so Ryan can change it later. The "Powered by Avenue Z" line
  under the wordmark (`page.sidebar_powered`) is rendered only when the wordmark text, trimmed and compared without case,
  is not "Avenue Z", so the page never says Avenue Z twice. The rule is applied when the page is rendered: editing the
  wordmark in the frame shows or hides the line on the next render, not live. While the line is hidden its slot is not
  checked by grounding (as `context` is skipped when hidden, `grounding.ts:33`). A row from before v1.1 takes its page
  words from the same defaults, so a version 1 draft also loses AIVx: two deliberate differences in the version 1 list in
  `v1-compat.test.ts` (the wordmark text, and the removed `<div class="powered">`,
  `__fixtures__/v1-0-final.html:1158-1159`). Approved rows serve their frozen HTML and never change.

### 16.2 The share link

- **Domain.** The link's origin comes from the server, never the browser address. `shareOrigin()` reads
  `VERCEL_TARGET_ENV`: `production` gives `https://reporting.avenuez.com`; `staging` gives
  `https://staging.reporting.avenuez.com`; any other value, or none, gives null, and the editor and hub then use the
  page's own origin and label the link "Test link: it works on this environment only." `VERCEL_TARGET_ENV` is a server
  variable (no `NEXT_PUBLIC_` prefix), so the server pages call `shareOrigin()` and pass the result to the hub and editor
  as a prop; the client never reads the variable. It is added to `.env.example` beside `VERCEL_ENV`. Evidence, 2026-10-12: the Vercel
  project's domains are `reporting.avenuez.com` (production), `staging.reporting.avenuez.com` (the custom environment
  `staging`, branch `staging`) and `avenue-z-reporting-v2.vercel.app`; system environment variables are exposed
  (`autoExposeSystemEnvs: true`); Vercel documents `VERCEL_TARGET_ENV` as "the system or custom environment that the app
  is deployed and running on", with a custom environment's name as its value. `reports.avenuez.com`, named in two repo
  documents, answers a Cloudflare 404 and is never used. The origins are constants in
  `lib/aeo-outbound/share-origin.ts`, a server-only module (built in Task 3c).
- **Path.** `/snapshot/{slug}-{token}`, where the token is unchanged (`token.ts:4`, 24 URL-safe characters). The slug
  comes from the row's `brand_name` only (null gives no slug; never the Peec project name, which the pages show in its
  place, `app/tools/new-business/page.tsx:14`): Unicode NFKD, combining marks removed, lowercased, every run of characters outside
  `a-z` and `0-9` replaced by one `-`, leading and trailing `-` removed, cut to at most 40 characters, and a trailing `-`
  removed again. An empty slug gives `/snapshot/{token}`. One shared pure function, `shareUrl(origin, brandName, token)`, builds every
  link (hub, editor, Copy link); `snapshotUrl` (`components/aeo-outbound/status.ts:26`) is replaced by it.
- **Route.** `app/snapshot/[token]/route.ts` resolves the segment to a token: a segment of token shape
  (`isShareTokenShape`, `token.ts:5`) is the token; otherwise a segment of at least 26 characters whose character before
  the last 24 is `-`, whose prefix matches `^[a-z0-9]+(-[a-z0-9]+)*$` and is at most 40 characters, and whose last 24
  characters have token shape gives those 24 characters; anything else answers the existing unknown-token 404. The slug
  is not checked against the row: the token is the credential and an approved row's brand is frozen. A bare-token link
  sent before this change keeps working. HEAD uses the same rule. The token, the database, the opens and the logs are
  unchanged; the route still never logs the segment.

### 16.3 Live progress

- **Steps.** `progress_step` (§7) gains step 10, written in the attempt loop (`generate.ts:39`) after the check that can
  skip the second attempt (`generate.ts:41`) and before its Glean call, unawaited and forward-only like the others. Labels: 1 "Finding the project in Peec", 2 "Reading
  the brands tracked", 3 "Reading the project profile", 4 "Finding the days with data", 5 "Loading brand visibility and
  AI models", 6 "Loading the sources AI used", 8 "Loading Peec's recommendations", 9 "Writing the copy", 10 "Writing the
  copy, second attempt". Each label matches the work at its `onStep` call (`pull.ts:55,59,64,72,91,115,119`; 9 and 10
  in generate). There is no step 7.
- **Shown.** A checklist of eight rows (steps 1 to 6, 8 and 9; at step 10 the last row reads "Writing the copy, second
  attempt"): finished rows ticked, the current row with a spinner, later rows muted. Step 0 (the row exists, Peec not
  yet called), and the time before the row exists, show every row muted with "Starting…". Above it: a bar filled to
  finished rows ÷ 8, the elapsed clock (m:ss; in the tab whose request started the run, from the click, so it never
  jumps back when the row appears; anywhere else from the row's `created_at`; a browser clock behind the server shows
  0:00, never a negative), and "Usually 35 to 45 seconds". After 90 seconds the line
  under it reads "Taking longer than usual. It stops by itself after 4 minutes 30 seconds." (`GENERATION_DEADLINE_MS`,
  `config.ts:31`). "Keep this tab open until it finishes." stays. A one-line form, the current step's label then "…" and the
  clock ("Reading the brands tracked… 0:04"; "Starting… 0:01" at step 0), remains for hub rows Ryan did not start in
  this tab. This replaces the two-stage text the plan's Task 9 specifies.
- **Live.** A read-only `GET /api/aeo-outbound/progress` takes exactly one of `id` (must pass `isReportId`) or
  `projectId` (a non-empty string of at most 200 characters); access is checked first: no session or no access answers 403
  `{ error: 'forbidden' }` (`outboundAccess`, §8), then both, neither or a malformed value answers 400
  `{ error: 'bad-request' }`. A database error answers 503 `{ error: 'unavailable' }` and logs one line,
  `[aeo-outbound] progress read failed reason=<errorLabel>` (`lib/aeo-outbound/log.ts`), with no ids or emails. Otherwise 200,
  `Cache-Control: no-store`, with `{ id: string, step: number, createdAt: string (ISO) }` for the matching row while
  `status = 'generating'` and it is younger than `STALE_GENERATING_MS` (`config.ts:32`; an older one is shown as failed
  by `displayStatus`, `store.ts:271-272`, so it is never reported as running), else `{ step: null }`. At most one
  generating row exists per project (`lib/db/schema.ts:530`). Each poll costs the session read, the settings read in
  `outboundAccess` and one select of one row.
- **Who polls.** Today the hub does not refresh while its own Generate request runs: the 5-second refresh only starts
  when a listed row is already generating (`hub.tsx:85-91`), so nothing moves for about 35 seconds. New: whoever sends
  a Generate request (the hub's Generate and Rerun, and the editor's Rerun, `editor.tsx:199-200`, which creates a new
  row with a new id) polls by `projectId` every second while that request is in flight; the editor of a row that is
  itself generating polls by `id`. The row is created several seconds after the click (after the session, body, rerun
  and Peec project checks, `app/api/aeo-outbound/generate/route.ts:33-76`), so `{ step: null }` before any row has been
  seen means "not started yet" and polling continues; a row whose `createdAt` is more than 5 seconds before the click is
  another tab's run and is ignored the same way (until the request answers 409 and the hub opens that row,
  `route.ts:79-81`). Polling by `projectId` stops when the request answers; when `{ step: null }` follows a row that was
  seen (it finished); or 300 seconds after the poll started (the deadline plus 30 seconds). Polling by `id` starts from a
  row already known to be generating, so any `{ step: null }` means it finished. While the editor's Rerun request is in
  flight, the checklist replaces the editor's action bar until the request answers. A
  failed poll keeps the last shown state and tries again on the next tick. When the editor's poll by `id` sees the row
  finish it calls `router.refresh()` at once instead of waiting for its 5-second refresh (`editor.tsx:134-139`).

### 16.4 Where this lands in the build, and what it overrides

The plan (`docs/superpowers/plans/2026-10-11-aeo-outbound-snapshot-v1-1.md`) was written before this amendment. Tasks 1
to 3 are built. The plan gains three tasks and its later tasks are edited where they hard-code what §16 changes:

- **New Task 3b, Ryan's answers (built next, before Task 4).** Flips the four `DECISIONS` values; the Q5 prompt sentence
  and the "at most 80 characters" category line (`prompt.ts:88,90`); the category accept rule (`generate.ts:59`) and its
  80-character edit limit (`slots.ts:41`); grounding's dash exemption per row (`grounding.ts:14`: `category` only on
  version 1, `next_step` only while it equals the fixed sentence); the "Powered by" rule in today's `render.ts:66-67`;
  the two version 1 golden differences (`v1-compat.test.ts`); and updates `prompt.test.ts:123` ("exactly 2 of the 3").
  Flipping the values in this task, before Tasks 5 to 7, is why it also changes the places that read `DECISIONS`
  directly today (`render.ts:66`, `grounding.ts:14`). `generate.ts:32` also reads `DECISIONS.fixedNextStep`: from Task
  3b until Task 5 passes settings through (plan:2704), new rows get the fixed sentence while their `settingsUsed` still
  records null, so the prompt still asks Glean for a `next_step` that is discarded. That gap is on the branch only and
  closes in Task 5.
- **New Task 3c, the share link (built after 3b).** `shareOrigin()`, the origin constants, `shareUrl`, the slug, the
  route's segment rule for GET and HEAD, the pages passing `shareOrigin` and the nullable `brand_name`, today's hub and
  editor callers, `status.test.ts:24-25`, and `.env.example`.
- **Task 4 edits:** step 10, after the skip check (`generate.ts:41`); and its wholesale `generate.ts` replacement keeps
  Task 3b's category accept rule (plan:2100 restores the old one).
- **Task 9 edit:** `progress.ts` becomes the §16.3 labels, the checklist model and the one-line form, replacing
  `PULLING`/`WRITING` and their tests (plan:4394, 4443-4451, 4637-4660).
- **New Task 11b, live progress (after Task 11).** The progress endpoint, the checklist component, polling in the hub
  (Generate and Rerun) and in the editor (Rerun, and by id while generating), and the refresh when the row finishes.
- **Edits to Tasks 5, 6, 7, 10, 11 and 12:** the settings defaults test (plan:2266: `fixedNextStep`, `sidebarWordmark`
  'Avenue Z') and its `INPUT` (plan:2259-2261, compared with the defaults at plan:2286); Task 6's wholesale `slots.ts`
  keeps the 80-character `category` limit (`limitFor`, plan:2998-3002, and its test, plan:2818-2826); Task 12's tests
  built from the defaults (plan:7332-7333, 7374-7381, 7406-7408, 7451); the settings label (plan:2474, test plan:7453) becomes "Most opportunities from Peec recommendations";
  the Task 6 `codeSet` (plan:3238) takes the per-row rule from Task 3b; the Task 7 render (plan:4046-4047) keeps the
  "Powered by" rule and skips grounding the hidden line; the Task 10 and 11 link code and tests (plan:5501, 5762, 6674,
  6959, 7194 and the `snapshotUrl` callers at plan:5421, 6866) use the `shareOrigin` prop and `shareUrl`; the Task 12
  settings page test (plan:7455) expects 'Avenue Z'.

### 16.5 Edge cases

| Case | Behavior |
|---|---|
| Brand with no Latin letters or digits | Empty slug: `/snapshot/{token}`. |
| Brand longer than 40 slug characters | Cut at 40, no trailing `-`. |
| A well-formed but wrong slug (another brand's name) | Still resolves by its token; the slug is decoration. |
| A slug with uppercase, `_` or over 40 characters | The unknown-token 404 (the route's shape rule). |
| A link sent before this change | Bare token, still resolves. |
| Preview deployment or local dev | Page origin, labelled as a test link. |
| Glean skips `category` or returns one over 80 characters | No retry, no failure: Peec's category or "Needs validation". |
| A written category with a number not in Peec's data | A "Check these" item, as on every row today (`grounding.ts:37`). |
| The hub's first polls, before the row exists | "Starting…" with the click's clock; polling continues. |
| Another tab already generating this project | Its row is ignored by the poll; the request's 409 opens it (`route.ts:79-81`). |
| An abandoned generating row older than 6 minutes | Not reported as running; the hub follows the new row once it exists. |
| Peec has actions but none fits | No opportunity based on one; nothing fails. |
| Wordmark edited to "avenue z " | Treated as Avenue Z: no "Powered by" line. |
| Progress poll fails or times out | The last state stays; the Generate request still decides the outcome. |
| Generate never answers (closed laptop) | Polling stops after 300 seconds; the stale rule (`markStaleGeneratingQuery`, `store.ts:19`, run by the next Generate for that project) frees the row. |

### 16.6 Tests (written before the code)

Answers: the four `DECISIONS` values; the Q5 prompt sentence with 1 and with 0; a generated category over 80
characters, missing or not a string keeps Peec's category with no retry and no failure; an edited category over 80 is
refused; a long dash in `category` flagged on a version 2 row and not on a version 1 row; a long dash typed into an edited
`next_step` flagged, the untouched fixed sentence not; the fixed sentence
lands in `next_step`; the wordmark reads "Avenue Z" with no "Powered by" line, and "AIVx" brings the line back; the hidden line is
not grounded; the two version 1 golden differences. Link: slug cases (accents, symbols, emoji only, 41 or more characters, empty); the route
resolves slugged and bare segments and gives the unknown-token 404 for a bad slug shape, a 25-character segment and a
bad token; `shareOrigin` for production, staging, preview and unset; the hub and editor use the prop, not the page origin, when it
is set, and label a test link when it is null; a null `brand_name` gives a bare-token link. Progress: step 10 written before the second attempt
only; every label; the checklist's ticked, current and muted rows and the bar for each step; the over-90-seconds line;
the endpoint's 400 (both, neither, malformed), 403, 503, `{ step: null }` (none, and a row older than 6 minutes) and row
answers; null before any row keeps polling; a poll by id stops on the first null and refreshes; another tab's row is
ignored; the clock counts from the click in the starting tab and never jumps back; a Peec category with a long dash is not
flagged on a version 2 row; the hub and the editor's Rerun poll only while their request is in flight
and stop on each of the three rules; the editor polls by id only while generating and refreshes when the row finishes.

## 17. Amendment 6 (2026-10-12): testing on dev, the phone layout, and four fixes

Sources: my dev test on 2026-10-12 (migration 0027 applied on dev, a real pitch-project draft) and the phone trial
(`aeo-outbound-audit-notes/findings/2026-10-12-mobile-trial.md`). Code citations are to `feat/aeo-outbound-parts` at
`068b4976`. Where this section and an earlier one disagree, this section governs.

### 17.1 The 01 to 05 menu scrolls inside the report

- Bug: in the editor the report is a `srcdoc` frame (`components/aeo-outbound/editor.tsx:460`), so its menu links
  (`href="#headline"` and the rest, `lib/aeo-outbound/render.ts:151-155`) resolve against the editor's own address and load
  the dashboard inside the sandboxed frame, which has no session: the sign-in page appears. The public page is a top-level
  document and is not affected.
- Fix: one page script, exported as the string constant `PAGE_JS` (like `FRAME_SCRIPT_JS`, so the frame harness can run
  it), emitted in every mode immediately after `HEADER_CLONE` and before the share block and the frame script
  (`render.ts:252`). It adds a capture-phase click listener on `document`, registered before the frame script's own
  capture listener (`render.ts:57-62`), so it runs first. For a click inside an `a[href^="#"]` whose target id exists:
  if the page is in edit mode (any `[data-slot][contenteditable]` exists) it does nothing, because clicks there are for
  editing and the frame script's rule cancels the link; otherwise it calls `preventDefault()` and
  `scrollIntoView({ behavior: 'smooth', block: 'start' })`. A hash with no matching id is left alone.
- The public page runs `PAGE_JS` too: the menu scrolls smoothly instead of jumping, and the address bar no longer gains the
  `#section` hash (so a copied link is the page link). Approved rows serve their frozen HTML (`view/route.ts:41-44`), so a
  report approved before this change keeps its old menu behaviour in the editor; only newly approved reports carry
  `PAGE_JS`.

### 17.2 The report on a phone (`(max-width: 900px)`, as AIVx), desktop unchanged apart from long KPI values

AIVx's own phone rules (hide the sidebar, stack columns, two KPI columns when there are four) stay. "Phone" below means
the media query `(max-width: 900px)`, the one AIVx uses (900px included). A stylesheet `PAGE_CSS`, emitted right after
`AIVX_CSS` (`render.ts:245`) in every mode, adds the rules below (all inside that media query except `aeo-long` and the
default `.aeo-share-mobile { display: none }`); the
title, card, table, donut and button looks were checked in the trial, the share click was not:
- Phone: the brand title `font-size: clamp(40px, 11vw, 64px) !important; line-height: 1.1` (the `!important` beats the
  long-name inline 72px).
- Phone: a 3-KPI strip goes to two columns. Render adds `data-kpis="3"` to the strip only when it has exactly 3 cards
  (its inline `repeat(3, 1fr)`, `render.ts:135`, beats AIVx's phone rule), and `PAGE_CSS` has
  `.kpi-strip[data-kpis="3"] { grid-template-columns: repeat(2, 1fr) !important }`. One card stays full width and two stay
  two columns, as today; four use AIVx's own rule.
- At every width: a KPI value longer than 7 characters (after trimming) gets the class `aeo-long`
  (`font-size: 24px; line-height: 1.15`), so the rank card fits one line on desktop and two on a phone. The class is set at
  render from the slot value. This is the one deliberate desktop change (AIVx's 32px).
- Phone: the opportunities table becomes stacked cards: `thead` hidden; the table, `tbody`, rows and cells shown as
  blocks; each row a rounded bordered card; each cell headed by its column title through `td::before { content:
  attr(data-label) }` (`::before`, so it never meets the Edit chip, which uses `::after`, `render.ts:22`), from a
  `data-label` attribute that render sets on every opportunities cell (the escaped `page.opps_col_1` to `3` words) in
  every mode. `data-label` and `aeo-long` are set at render and refresh on the next render (a reload or a structural
  change); in the edit frame a heading change shows in the cards on the next render. The editor's frame is normally wider
  than 900px, where the headings are the editable table header.
- Phone: a second Share button, in the final mode only, rendered from the exported constant `SHARE_MOBILE` exactly as
  `<div class="aeo-share-mobile"><button class="aeo-share-mobile-btn" type="button" aria-label="Copy shareable link to this
  report">Share Report</button></div>` immediately before the footer (not `SHARE_BUTTON`, and not the class `share-btn`,
  which AIVx's script and the view route key on). `.aeo-share-mobile-btn` copies AIVx's `.share-btn` declarations (`width: auto; margin: 0` instead of AIVx's full width
  and bottom margin), and the block is `display: none` by default and `display: flex; justify-content: center; padding:
  24px` inside the phone query. `PAGE_JS` makes a click on it call `click()` on the sidebar's `.share-btn` (the element AIVx's share
  block binds, `aivx/share.ts`), so AIVx's own pinned block does the copy and shows its toast; the "Copied!" flash is on the
  hidden sidebar button, so a phone user sees the toast only. The view route's preview of an approved row removes the
  exact `SHARE_MOBILE` string when it occurs once, treats its absence as fine (rows approved before this change have
  none), and uses its `HIDE_SHARE` fallback, which also hides `.aeo-share-mobile`, only when it occurs more than once
  (`app/api/aeo-outbound/reports/[id]/view/route.ts:17-25`).
- Phone, the donut (`#aeo-chart-sources`, drawn by `embedFigure`'s inline `newPlot`, `charts.ts:92`): on `load`,
  `PAGE_JS` takes deep copies of the element's `data` and `layout` once (they keep the template and `marker.colors`,
  `charts.ts:78,84`) and keeps them as the originals. On `load` and on every change of `matchMedia('(max-width: 900px)')`:
  when the query matches it calls `Plotly.react` with a fresh copy of the originals in which `texttemplate` is an array,
  `'%{percent:.1%}'` for a slice whose value is at least 5% of the total (unrounded) and `''` otherwise; `labels` are
  each original label, one space and `(100 * value / total).toFixed(1)` with `%` ("Reference 4.8%"); `customdata` is the
  original labels; and the hover template has `%{label}` replaced by `%{customdata}` (it is
  `'<b>%{label}</b><br>Retrievals: %{value}<extra></extra>'`, `charts.ts:82`). When it stops matching it calls
  `Plotly.react` with the originals. Every call is caught both as a throw and as a rejected promise; on a failure it calls
  `Plotly.react` once with the originals, also caught. If `Plotly` or the element is missing it does nothing.
  `Plotly.restyle` is not used (it throws on this figure, trial). Verified in the browser on 2026-10-12 with Plotly 3.5.0
  on a real report: the slice texts read "60.3%" and "23.3%" with the small slices blank, the legend reads "Reference 4.8%",
  and the originals restore AIVx's donut exactly. Unverified: the hover text after the `customdata` swap (the tests prove
  the template string, not Plotly's hover). The page's figure JSON stays AIVx's, so the chart goldens
  are unchanged.
- The version 1 golden (`v1-compat.test.ts`) gains these as deliberate differences: the `PAGE_CSS` style element, the
  `PAGE_JS` script, the `data-label` attributes, the `aeo-long` class where a value is long, and `SHARE_MOBILE`.

### 17.3 The calendar on the date fields

The hub's two `type="date"` inputs (`components/aeo-outbound/hub.tsx:291,295`) get `color-scheme: dark` (so the calendar
icon shows on the dark background) and open the browser's calendar on any click: `onClick` calls
`e.currentTarget.showPicker?.()` inside a `try` (a browser that refuses still lets Ryan type the date).

### 17.4 Before you send can be minimized

The panel stays where it is (over the report's right edge, `components/aeo-outbound/before-you-send.tsx:55`). Its header
gains a "Minimize" button that closes it; while it is closed on a draft, a small pill reading "Before you send (N)" sits at
the report's top-right corner and reopens it, where N is the toolbar button's count (`openCount`, `editor.tsx:248`). On
Live and Revoked (closed by default, `editor.tsx:86`) there is no pill; the toolbar button still toggles it everywhere. Docking it beside the report was rejected: on a
common laptop width the frame would drop under AIVx's 900px breakpoint and switch the report to its phone layout while
editing. Open by default on a draft and the generating-to-draft rule (§4, Task 10) are unchanged.

### 17.5 The report name and the top-left name as settings

- The top-left name (`sidebarWordmark`) becomes free text, 1 to 60 characters after `cleanValue`, no U+2013 or U+2014
  (today a choice of AIVx or Avenue Z, `lib/aeo-outbound/settings.ts:129`, contract `contracts.ts:121`). Default
  "Avenue Z". Label "Top-left name". Errors: "Use 1 to 60 characters." (replacing `SETTINGS_ERRORS.wordmark`, `:33`) and
  the long-dash error. Touch points: the `schema.ts` settings table (near `:564`), `SettingsValues.sidebarWordmark` and the
  new `series` in `settings-store.ts:16`, the `GenerationSettings` pick (`settings.ts:11`), `SETTINGS_FIELD_LABELS` and
  `FIELDS` (`settings.ts:41-51`), the `pageDefaults` parameter type (`slots.ts:73`), the contract, `resolveSettings`,
  `validateSettingsInput`, `settingsToInput`, `saveSettingsSql` and the form.
- "Powered by Avenue Z" (§16.1) shows only when the top-left name does not already contain "avenue z" (trimmed, any
  case): it shows under "AIVx" or a new name such as "AEO Lens", and not under "Avenue Z" or "Avenue Z AEO".
  `showsPowered` changes to that rule.
- Grounding skips the number and domain checks for `page.series` and `page.sidebar_wordmark` (they come from settings or
  Ryan's own edit, not from Glean), so a name with a digit or a domain never adds a "Check these" item. The long-dash check
  still runs on both, as on every slot.
- A new setting `series`, label "Report name", the same rules, default "AI Visibility Snapshot" (`PAGE_WORDS_V1.series`).
  It is the default for `page.series` on every new report (`pageDefaults`, `lib/aeo-outbound/slots.ts:73`, called at
  `generate.ts:88`), which drives the title, the hero, the sidebar and the footer series.
- Storage: migration `0028` adds `series text not null default 'AI Visibility Snapshot'` to `aeo_outbound_settings`
  (additive; the column default fills an existing row). Each environment only on my written go, dev first. Every run has
  a host guard that refuses any host but the one named for that run (dev: `ep-still-tree-aqs8ui6d`). `MIGRATIONS-PENDING.md`
  gains a 0028 entry with the dry runs: dev exactly `0028`; staging `0026`, `0027` and `0028`; production `0025` to `0028`,
  with `0025` first on my go. §13 is extended the same way. Any build whose `schema.ts` has `series` must not reach an
  environment before `0028` is applied there: Drizzle names every column, so the settings read throws (42703).
- A settings change never alters an existing draft (unchanged rule).

### 17.6 Edge cases

| Case | Behavior |
|---|---|
| A menu hash with no matching section | Not intercepted; nothing happens. |
| Plotly missing or the donut re-render throws | The chart stays as AIVx drew it. |
| A phone in landscape over 900px | Desktop layout (AIVx's breakpoint). |
| A KPI value of exactly 7 characters | No `aeo-long`. |
| showPicker unsupported or refused | Typing the date still works. |
| Settings name with a long dash | Refused: "Use a period or comma instead of a long dash." |
| 0028 not applied where the code runs | The settings read throws; access falls back to `AEO_OUTBOUND_USERS` only (`access.ts:25-35`), so users and admins listed only in Settings lose access, and every save is refused with the read-failed message. Hence the deploy gate above. |
| A top-left name or report name with a digit | Allowed; not grounded. |
| A phone rotated across 900px | The donut switches version on the media-query change; the CSS follows the query. |
| Live or Revoked report in the editor | No pill; the toolbar button opens the panel. |

### 17.7 Tests (written before the code)

Render: a menu click on `#headline` calls `scrollIntoView` on that section and prevents the default in preview and final,
and in a draft outside edit mode (frame test running `PAGE_JS`); in edit mode it neither scrolls nor overrides the frame
script; a hash with no target is not prevented; the phone Share click calls `click()` on the sidebar `.share-btn` and,
with the real `AIVX_SHARE_BLOCK` and a stubbed clipboard, shows the toast; a missing `Plotly` and a throwing
`Plotly.react` each leave the donut untouched; every `PAGE_CSS` rule except `aeo-long` sits inside `(max-width: 900px)`;
the phone `.kpi-strip` rule for a 3-KPI page and none on 1, 2 or 4; the view route removes `SHARE_MOBILE` in preview, an
old approved row without it is served without the fallback or its log line, and the fallback hides `.aeo-share-mobile`;
the donut's hover template uses `%{customdata}`; a media-query change that stops matching restores the originals; a
rejected `Plotly.react` restores the originals once; `PAGE_CSS` and `PAGE_JS` present in draft, preview and final; `data-label`
on every opportunities cell equal to its column word; `aeo-long` on an 8-character value and not on a 7-character one; the
phone Share block in final only; the donut re-render keeps labels for slices of 5% or more and adds percentages to the
legend under 900px and does nothing at 901px (a test with a stubbed `Plotly` and `matchMedia`); the version 1 golden with
the new deliberate differences. Hub: `color-scheme` on both date inputs; a click calls `showPicker`; a throwing
`showPicker` doesn't break typing. Editor: Minimize closes the panel and shows the pill with the count on a draft; the pill reopens it; no pill on Live and
Revoked.
Settings: free-text top-left name and report name accepted at 1 and 60 characters, refused at 0 and 61 ("Use 1 to 60
characters.") and with a long dash; the form's labels; `series` defaults, round trip, change log and SQL text;
`pageDefaults` sets `series`; `showsPowered` for "AIVx", "AEO Lens", "Avenue Z" and "Avenue Z AEO"; grounding skips the
number and domain checks on `page.series` and `page.sidebar_wordmark` and still flags a long dash in them; `0028` adds only that column; a settings read on a database without the column
falls back to the env list (the access test with a throwing read already covers the path).

### 17.8 Less empty space beside the two charts (added 2026-10-12 after my dev QA)

On my dev draft (1280 wide, measured in the browser; finding `findings/2026-10-12-dead-space-trial.md` in the notes repo):
each chart card in Category data and Competitive visibility is 484px tall, while the bullet box beside it holds two bullets
(148px and 245px), top-aligned, so up to 348px of empty black sits under the bullets; and 121px and 153px separate a chart
card from the next section's label and the "Why it matters" box. Those come from AIVx's CSS: `.insight-box` margin
`12px 0`, `.chart-wrap` margin `24px 0`, `.two-col` margin-bottom `32px`.

The charts do not change (my rule: don't distort the charts): the figures, their layout margins, the legends, and the
chart card's size, padding and border are untouched. Only spacing outside the card changes: the card's outer bottom
margin (24px to 0), the row's bottom margin, and the bullet box. All through `PAGE_CSS` (every mode), scoped to
`#category-data` and `#competitive-visibility` (ID specificity beats AIVx's class rules regardless of order):

```
#category-data .two-col,#competitive-visibility .two-col{margin-bottom:0}
#category-data .two-col>div:first-child,#competitive-visibility .two-col>div:first-child{display:flex}
#category-data .insight-box,#competitive-visibility .insight-box{flex:1;margin:24px 0 0;display:flex;flex-direction:column;justify-content:center}
#category-data .insight-box>.aeo-ctl,#competitive-visibility .insight-box>.aeo-ctl{align-self:flex-start}
#category-data .chart-wrap,#competitive-visibility .chart-wrap{margin-bottom:0}
```

Result in the trial: the bullet box's top and bottom line up with the chart card (0px difference both ends, both
sections), the bullets sit centred in it, both figures stay 420 by 415px, the gaps become 65px and 97px (the page's usual
section rhythm), and the page is 112px shorter. Under 900px the columns stack as before (AIVx's
`.two-col{grid-template-columns:1fr}`), with the box 12px lower than before and no sideways scroll. With three long
bullets the box can be taller than the chart card: the row grows, the card keeps its own height, top-aligned, and the
spare space sits under the chart instead. The draft's "Add bullet" button keeps its own width (`align-self:flex-start`), not stretched.

These rules sit outside the phone media query on purpose, so the §17.7 test "every `PAGE_CSS` rule except `aeo-long` sits
inside `(max-width: 900px)`" changes to allow exactly these five rules (and the existing `.aeo-share-mobile{display:none}`).
Tests: `PAGE_CSS` contains each of the five rules verbatim; none of them names `.plotly`, `.js-plotly-plot`, `svg` or an
`aeo-chart-` id; the `.chart-wrap` rule's whole body is `margin-bottom:0`; no rule outside the media query sets `height`,
`min-height`, `padding`, `border` or `overflow`; `charts.ts` output is unchanged (the chart goldens stay byte for byte);
the version 1 golden needs no change (it swaps in the whole `PAGE_CSS`).

### 17.9 UI pass: Settings, the hub table, and a branded not-found page (added 2026-10-12 after my dev QA)

I asked for a UI/UX pass before testing further. Each part was mocked on the live dev page and approved from screenshots.
No data, query, action or permission changes: layout, grouping and copy only.

**Settings** (`components/aeo-outbound/settings-form.tsx`; today `max-w-2xl`, one card, no way back):
- A sticky top bar like the editor's (`editor.tsx:392`, same classes): `← Back` to `/tools/new-business`, the word
  "Settings", then on the right the saving / saved / error text and the **Save settings** button. The h1 and note stay below.
- Full width of the tools layout (`app/tools/layout.tsx`, `max-w-7xl`), in `grid items-start gap-6 lg:grid-cols-2`, one
  column under `lg`. Left: card **Report words** ("Names and titles printed on every new report.": Top-left name and
  Report name side by side, then First and Second section title) and card **Report content** ("What each new report says
  and how it ranks the brand.": Next step with a 4-row sentence box, Rank the brand among, Most opportunities from Peec,
  the Methodology checkbox). Right: card **Who can use it** ("People who can open the tool, and who can change these
  settings.": both people lists) and card **Recent changes**.
- Leaving with unsaved changes asks first, as the editor does: unsaved means the form differs from the last loaded or
  saved values. The editor's guard (`editor.tsx:304-330`: `beforeunload`, and a capture click listener on same-origin
  links) moves into a shared hook used by both, with the editor's behaviour and tests unchanged; the dialog is the
  existing `ConfirmDialog` with `LEAVE_UNSAVED`, `LEAVE`, `STAY`.
- Every field keeps its id, label, limits and error; the save path is unchanged.

**Hub table** (`components/aeo-outbound/hub.tsx:319-400`; today 8 columns, buttons and dates wrap to 3 or 4 lines):
- 6 columns: **Brand** (brand in bold, then the Peec project name and the requested window in small muted text), Status,
  **Created** (date on one line, creator on a muted line cut with an ellipsis at 180px, full address in `title`),
  **Sent** (sent date on one line, then "to {recipient}" muted), **Opens**, Actions. The "Peec project" and "Sent to"
  sort headers go; search still covers both (`searchWhere`, `lib/aeo-outbound/store.ts:185-188`, server-side).
- Opens: the count in medium weight ("1 open", "3 opens", or "No opens yet"), then the breakdown in small muted text
  ("1 likely person, 2 likely automated", plus ", 1 not classified" when any), then the first and last opened lines.
  `opensSummary` keeps its exact output (its callers and tests); a sibling splits it into head and detail.
- Actions: **Open** always; **Copy link** when the row has a link to copy (today's rule); every other action (Revoke,
  Edit a copy, Rerun, Discard) in a **More** menu button, shown only when the row has at least one. The menu: a button
  with `aria-haspopup="menu"` and `aria-expanded`, a list with `role="menu"` of `role="menuitem"` buttons running exactly
  today's handlers (the Revoke and Discard dialogs unchanged, focus returning to More when they close); the list is
  positioned `fixed` from the button so the table card's horizontal scroll cannot clip it; it closes on Escape (focus back
  to the button), on a click outside, on scroll or resize, and after an item is chosen; one menu open at a time.
- The scanner note and the test-link note move under the table.
- Pending rows (a Generate in flight) span the new 6 columns.
- Measured in the mock at 1440 wide: the table fits its card (scroll width = card width, 1,118px), rows 67 to 145px tall.

**Not found** (`app/tools/new-business/[reportId]/page.tsx` calls `notFound()` for a bad id or a missing row, which today
shows Next's white 404): the page renders a `SnapshotNotFound` card instead (`components/aeo-outbound/snapshot-not-found.tsx`),
after its access check, inside the dark tools layout. Not a `not-found.tsx`: `lib/auth/protected-pages.test.ts` forbids
that file name in protected areas because it would run without the page's check. The answer is 200, not 404, which is
accepted for this staff-only page. The card is titled "This snapshot no
longer exists", the line "It may have been discarded, or the link is wrong.", and a **Back to New Business** link to
`/tools/new-business`.

Tests: Settings: the bar has Back (href `/tools/new-business`) and Save; the four card headings; every existing field test
still passes; with unsaved changes, Back opens the dialog and Leave navigates, Stay keeps the page; with none, Back
navigates; `beforeunload` is registered only while unsaved; after a successful save the form is clean. Editor: its
existing leave-guard tests pass unchanged. Hub: 6 header cells; the brand cell shows the project; the sent cell shows "to
{recipient}"; Open and Copy link are direct buttons; Revoke, Edit a copy, Rerun and Discard appear only after opening More
and run their handlers (Revoke and Discard still open their dialogs); Escape closes the menu and refocuses its button; a
row with no secondary action has no More; `opensSummary` output unchanged; the notes sit after the table. Not found: the
page renders the title, the line and the Back link.

### 17.10 Findings as evenly spread rows, and a dark scrollbar (added 2026-10-12 after my dev QA)

After §17.8 the bullet box matched the chart card (484px) but held about 123px of text, centred, so it still read as empty
(measured on dev draft `ed7a587f`, 1280 wide). Approved from a mock on that draft:

- Each finding is its own row: the lead becomes a small uppercase heading above its sentence, the sentence 16px (AIVx's box
  text is 14px), thin dividers between rows, and the rows spread evenly down the box (`justify-content:space-evenly` on the
  list, which grows to fill the box). The box keeps its yellow left rule and matches the chart card as in §17.8. The list's
  inline style from `render.ts:16` (`margin-top:10px;padding-left:20px;display:flex;flex-direction:column;gap:4px`) stays.
  Measured in the mock: Category data's list 416px in a 484px box, no overflow; Competitive visibility's three longer
  findings fill it the same way. A box whose findings run longer than the chart grows the row, as in §17.8.
- `html{color-scheme:dark}` so the browser draws the report's own scrollbar dark: in the editor that is the frame's
  scrollbar, white today; on a sent report it is the page scrollbar on AIVx's black page.

In `PAGE_CSS`, outside the phone media query, scoped to the two sections like §17.8. §17.8's `.insight-box` rule loses
`justify-content:center` (the list now fills the box) and gains `padding:28px 32px`:

```
html{color-scheme:dark}
#category-data .insight-box,#competitive-visibility .insight-box{flex:1;margin:24px 0 0;display:flex;flex-direction:column;padding:28px 32px}
#category-data .insight-box ul,#competitive-visibility .insight-box ul{flex:1;justify-content:space-evenly;list-style:none}
#category-data .insight-box li,#competitive-visibility .insight-box li{font-size:16px;line-height:1.6;padding:14px 0;border-bottom:1px solid rgba(255,255,255,0.08)}
#category-data .insight-box li:last-child,#competitive-visibility .insight-box li:last-child{border-bottom:none}
#category-data .insight-box li strong,#competitive-visibility .insight-box li strong{display:block;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:4px}
```

The charts still do not change. §17.8's test that no rule outside the media query sets `height`, `min-height`, `padding`,
`border` or `overflow` was broader than its purpose (guarding the chart card); it narrows to rules whose selector names
`.chart-wrap`, `plotly`, `svg` or `aeo-chart-`, which must still set none of those. Tests: the rules verbatim and in place;
the outside-rules list exact; the narrowed chart guard; each rule once per mode; the draft's Add bullet and Remove buttons
still render inside the box.

### 17.11 No Share button on a sent report (added 2026-10-12, my decision)

The link is for one prospect. The Share Report button (AIVx's sidebar button and toast script, and §17.2's phone button)
invites forwarding, so a sent report no longer carries it. This does not lock the link: anyone with the URL can still
open it and pass it on (no login, §7 of the base spec); the recipient field stays Ryan's label; **Revoke** stays the
control. Ryan's own **Copy link** in the hub is unchanged.

- `renderSnapshotHtml` in final mode stops emitting `SHARE_BUTTON` (`render.ts:213`), `SHARE_MOBILE` (`:271`) and
  `AIVX_SHARE_BLOCK` (`:308`). Draft and preview already carry none of them.
- `PAGE_CSS` drops `.aeo-share-mobile{display:none}` and the two phone rules for `.aeo-share-mobile` and
  `.aeo-share-mobile-btn`; `PAGE_JS` drops its phone-share proxy line (`render.ts:121`). New pages have no share markup
  for them to act on.
- `SHARE_BUTTON`, `SHARE_MOBILE` and `AIVX_SHARE_BLOCK` stay exported: reports approved before this change are frozen HTML
  that still contains them (dev only so far; nothing has been sent from staging or production), and the editor's preview
  of a sent row (`app/api/aeo-outbound/reports/[id]/view/route.ts:23-31`) still strips them from those rows.
- That preview's `withoutShare` gains a first case: when none of the three strings occurs, it returns the page unchanged
  with no warning (a row approved after this change). The existing cases (each once: removed; any repeated: CSS fallback
  with its warning) are unchanged.
- Already-sent links keep their button (frozen pages are never rewritten).

Tests: a final page contains none of the three strings, `share-btn`, `share-toast` or `aeo-share-mobile`; draft and preview
unchanged; `PAGE_CSS` has no `aeo-share-mobile` and the outside-rules list loses `.aeo-share-mobile{display:none}`; `PAGE_JS`
has no `aeo-share-mobile-btn`; the preview of a new final page (no share strings) is the stored page with the frame
header changes only and no warning; an old row with the strings is still stripped exactly as before; the version 1 golden
comparison records the removal as a deliberate difference.

### 17.12 The menu highlights 05 at the bottom of the page (added 2026-10-12 after my dev QA)

AIVx's scroll-spy (`lib/aeo-outbound/aivx/js.ts`, verbatim and pinned) marks as active the last `.section[id]` whose top
is at most 120px from the top of the window. Methodology is the last section and short, so at the bottom of the page its
top never reaches 120px and the menu stays on 04. AIVx's file is not changed; `PAGE_JS` (every mode) adds, after AIVx's
listener so it runs second on each scroll:

- at the bottom of the page (`innerHeight + scrollY >= scrollHeight - 2`), the last menu link (`05`) is the active one;
- a menu click that `PAGE_JS` already handles (preview, final, and a draft outside edit mode, §17.1) marks the clicked link
  active at once, so a click on 05 when already at the bottom (no scroll event) still highlights it;
- once on load, the bottom rule runs (a short page that is already at the bottom).

Uses AIVx's own selectors and class (`.sidebar-nav a[href^="#"]`, `active`). Reports already sent keep the old behaviour
(frozen pages). Tests (frame, stubbed scroll metrics): at the bottom the last link alone is `active`, also after AIVx's
handler ran; not at the bottom AIVx's choice stands; a click on 03 marks 03; in edit mode a click marks nothing.

### 17.13 Methodology gets a section heading, Next step its own line (added 2026-10-12, approved from a mock)

AIVx shows Methodology as a lone `.method-note` box (base spec row 9), while sections 02 to 04 carry a "0X / NAME" label and
a title, so 05 read as orphaned. The section (`render.ts:270-272`) becomes:

```
<section id="methodology" class="section">
  <div class="section-label">${fixed('05 / ')}${mirror('page.method_nav', p.method_nav)}</div>
  <h2 class="section-title">${mirror('page.method_nav', p.method_nav)}</h2>
  <div class="method-note"><div>${slot('strong', 'page.method_label', p.method_label)} ${slot('span', 'methodology', s.methodology)}</div><div style="margin-top:10px">${slot('strong', 'page.next_label', p.next_label)} ${slot('span', 'next_step', s.next_step)}</div></div>
</section>
```

The label and title mirror the menu word (`page.method_nav`, edited in the menu where it first appears), as section 02's
label mirrors its title. No new page word, no new slot, no change to the methodology or next-step text. Nothing in
`aivx/*` changes. Tests: the section has the label "05 / {method_nav}" and an `h2.section-title` with the menu word in every
mode; in draft both are `data-mirror="page.method_nav"` and the existing "every visible text is a slot, mirror, fixed or
chart" and "one editable element per path" tests pass; the methodology and next-step slots sit in two separate blocks; the
version 1 golden records the new markup as a deliberate difference.

### 17.14 Methodology styled like Ryan's example, and every written date checked against the window (added 2026-10-12)

**Style (my decision from Ryan's PDF, "Peec - Z_OS One Page Audit Example.pdf", page 2):** his last section is headed
"Methodology and next step", with two plain paragraphs ("Methodology: ..." and "Next step: ..."), not italic, not boxed.
Ours (§17.13) uses AIVx's `.method-note` (`aivx/css.ts`: 13px italic, 50% white, boxed). Changes, `aivx/*` untouched:
- A new page word `method_title`, default `Methodology and next step` (`PAGE_KEYS`, `PAGE_WORDS_V1`, `PAGE_LABELS`
  "Methodology title"). The section's `h2.section-title` becomes `slot('h2', 'page.method_title', p.method_title,
  'section-title')`; the label stays `05 / ` plus the menu word mirror. Rows without the key get the default
  (`withDefaults`), as for every page word.
- The second block's inline `style="margin-top:10px"` goes; `PAGE_CSS` (outside the phone query) adds
  `#methodology .method-note{background:none;border:none;border-radius:0;padding:0;margin-top:16px;max-width:none;font-style:normal;font-size:15px;line-height:1.75;color:rgba(255,255,255,0.75)}`,
  `#methodology .method-note>div+div{margin-top:14px}` and
  `#methodology .method-note strong{color:var(--white);font-weight:800;font-style:normal}`
  (15px, 1.75 and 75% white are "Why it matters"' paragraph, measured on dev).

**Dates (closes a gap found reading `grounding.ts`):** today a written date is checked by its digits only
(`grounding.ts:68`, `:110`), so "Aug 17 to Aug 29" passes for a Sep 17 to Sep 29 window. `groundingFlags` adds a date
check on every slot it already checks for numbers (so not `brand`, `window_label`, KPI values, `page.series`,
`page.sidebar_wordmark`):
- Matches: `Month D, YYYY` and `Month D` (month full or three-letter, optional period, `Sept` too, capitalised), `Month
  YYYY`, and `YYYY-MM-DD`.
- With a year: the day (or for `Month YYYY` the month) must fall within `d.window.start` to `d.window.end` inclusive.
  Without a year: the month and day must fall within the window in at least one of the window's years.
- Otherwise a new note kind `date_not_in_window` (group "check", so it shows under Check these with a Looks right
  tick, like the number flags) with text `"{match}" is outside the data window ({d.windowLabel})` and the slot's path.
- An impossible date ("Feb 30") is flagged the same way. The existing number check is unchanged.
`NOTE_KINDS` gains the kind (additive: stored rows stay valid).

Tests: the section's h2 is "Methodology and next step" and editable as `page.method_title`; a renamed title shows; the
three CSS rules verbatim and outside the phone query; the second block has no inline style; grounding: "Sep 17, 2026",
"Sep 29", "September 2026" and "2026-09-20" pass for a Sep 17 to 29, 2026 window; "Aug 17, 2026", "Aug 17", "Oct 2026",
"2026-10-01" and "Feb 30" are flagged with the path; a date in `window_label` or `page.series` is not date-checked; the
note's group is "check".

### 17.15 Opportunities as Ryan's table, cyan header (added 2026-10-12, approved from mocks)

Ryan's example (page 2) shows a solid header bar, three equal columns and alternating row shading. Approved translation
into our dark page, header option B, measured in the mock on dev draft `47b8a9ef`: at 1440 and 1024 wide no cell's
`scrollWidth` exceeds its `clientWidth`, the table is exactly its wrapper's width, nothing scrolls sideways, an unbroken
70-character domain wraps inside its cell, and the first header cell's left edge equals the section label's (0px).
Phones keep the stacked cards of §17.2, so every rule sits in a desktop query. Appended to `PAGE_CSS` as its own block
after the phone block:

```
@media (min-width: 901px){
#opportunities .leaderboard-wrap{border:none;border-radius:0;overflow:visible;margin:24px -3px 0}
#opportunities .leaderboard{table-layout:fixed;width:100%;font-size:15px;border-collapse:separate;border-spacing:3px}
#opportunities .leaderboard thead tr,#opportunities .leaderboard tbody tr{border-bottom:none}
#opportunities .leaderboard th{width:33.333%;background:rgba(96,255,234,0.08);color:#60FFEA;-webkit-text-fill-color:#60FFEA;box-shadow:inset 0 -2px 0 #60FFEA;font-size:14px;font-weight:800;letter-spacing:0;text-transform:none;padding:12px 16px;white-space:normal;cursor:default;vertical-align:bottom}
#opportunities .leaderboard th:hover{color:#60FFEA}
#opportunities .leaderboard td{padding:14px 16px;vertical-align:top;line-height:1.6;color:rgba(255,255,255,0.88);overflow-wrap:anywhere}
#opportunities .leaderboard tbody tr:nth-child(odd) td{background:rgba(255,255,255,0.08)}
#opportunities .leaderboard tbody tr:nth-child(even) td{background:rgba(255,255,255,0.035)}
#opportunities .leaderboard tbody tr:hover{background:none}
#opportunities .chart-takeaway{border-top:none;padding:16px 0 0;margin:0;color:rgba(255,255,255,0.6)}
}
```

No markup, text or AIVx file changes (the header sort was already removed by `HEADER_CLONE_JS`, `render.ts:69`).
Tests: the block verbatim, after the phone block, every rule inside `(min-width: 901px)`; the existing PAGE_CSS structure
tests updated for two media blocks (the phone block's rules unchanged, the outside-rules list unchanged); once per mode.

### 17.16 Every menu item editable, in sync with its section (added 2026-10-12, my decision)

Today menu items 01 to 04 are copies (`data-mirror`) of words edited on the page, and 05 is edited in the menu
(`render.ts:211-215`); clicking a copy in Edit mode posts `locked` (`FRAME_SCRIPT_JS`). Every menu item becomes editable
where it is, and an edit there and an edit on the page change the same stored word, so they always match:

- In draft, the four menu copies (`page.headline_label`, `page.section_1_title`, `page.section_2_title`,
  `page.opps_label` inside `.sidebar-nav`) also carry `data-mirror-edit`. 05 is unchanged (its menu item is the slot).
- Frame script: in Edit mode `[data-mirror-edit]` elements are `contenteditable` like slots. Input in one writes its text
  into the path's slot element (`slotEl(p).textContent`) and every other copy of that path, then schedules the same
  debounced `send(p)` as a slot edit (posting `dirty` first). `mirror(p, v)` never overwrites the element that has focus,
  so the caret never jumps. Enter blurs, paste inserts plain text and drop is blocked, as for slots. A click on a
  `[data-mirror-edit]` neither posts `locked` nor navigates. Copies elsewhere (section labels, the sidebar series and
  brand) stay locked.
- `EDITOR_STYLE`: `[data-mirror-edit]` gets the slots' dashed outline, hover and focus outline and Edit chip; the
  not-allowed cursor applies to `[data-mirror]:not([data-mirror-edit])`.
- Before you send's jump-to-field still goes to the page's slot.

Tests (frame, real scripts): typing in menu 02 updates the section 02 title, the 02 section label copy and posts one edit
for `page.section_1_title` after the debounce; typing in the section title updates the menu item; the focused element is
never rewritten while typing; a click on a menu copy in Edit mode posts no `locked`; a click on a section-label copy still
does; Enter, paste and drop behave as for slots; preview and final pages carry no `data-mirror-edit`; the "one editable
element per path" render test becomes "one slot per path, and the only other editable elements are the four menu copies".

### 17.17 Two layout fixes found while taking screenshots (added 2026-10-13, my decision)

- **Phone, headline signal:** AIVx's phone block (`aivx/css.ts`, `@media (max-width: 900px)`) sets `.section`, `.hero` and
  `.footer` to 24px side padding but not `.exec-summary`, which keeps its desktop `56px 64px`, so at 390 wide its text
  starts at 64px while every other section starts at 24px (measured). `PAGE_CSS`'s phone block adds
  `.exec-summary{padding:40px 24px}` (the same as AIVx's phone `.section`).
- **Hub, brand names wrapping:** at 1440 wide the Brand column gets 133px and "A Place for Mom" wraps, while the Opens
  column's dates wrap too (rows up to 141px tall). The brand name gets `whitespace-nowrap`, the "First opened" and "Last
  opened" lines get `whitespace-nowrap`, and the creator line's cap goes from 180px to 160px. Measured in a mock: the table
  is exactly its card's width at 1440 (1,103px both), rows 63 to 109px. Below about 1,400px the table scrolls sideways
  inside its card (as `overflow-x-auto` already allows) instead of squeezing rows to 269px tall, which is what 1280 wide
  does today. The opens breakdown line still wraps.

## 18. Amendment 7 (2026-10-13): Paul's second review (PRs 361, 366, 368)

Paul reviewed 2026-10-13 15:36 UTC: #361 at `3790a912` (3 comments), #366 at `6e516337` (2), #368 at `0a2b22e3` (6), plus
one question (any allowlisted user can approve, revoke, discard or copy any report: **intended**, my answer, a shared team
tool; no code change). Every mechanism below was read at those heads. Each fix lands on the PR that owns the file; #368
then merges the updated #361 and #366 branches (as `1ff4310b` merged #366) and carries the same change in its own copy of
any file it rewrote (`metrics.ts`, `pull.ts`, `peec.ts`, `save-queue.ts`), so #368 still contains both PRs.

### 18.1 The rank card and the leader gaps always agree (#361 `metrics.ts:126-135`, #368 `metrics.ts:170-179`)

Rank counts brands with a higher **displayed** visibility (`metrics.ts:99`), but `leaderGaps` keeps a rival only when its
exact gap, rounded to 0.1 (`pyRound((rival - own) * 100, 1)`), is above 0. Own 0.12349 (12.3%) and a rival at 0.12351
(12.4%) give `#2 of 3 brands` and no gap, so the copy can say the brand trails nobody. Fix: keep the existing filter
(`hasRow && pct > own.visibilityPct`, so every brand that outranks the own brand is listed and nobody else), compute the
gap as today, then `visibilityPoints = Math.max(0.1, gap)`, and drop the `> 0` filter. Since `pct1` never decreases as
visibility rises, a higher displayed value means a positive exact gap, so only a gap that rounds to 0.0 changes, to 0.1.
`sovPoints` is unchanged. The comment above it (#361 `metrics.ts:123-124`, #368 `:167-168`) is updated to say so. Spec §5a row 17 ("competitor minus own, exact values") still holds except at that boundary.

### 18.2 Own-site retrievals count subdomains and Peec's OWN rows (#361 `metrics.ts:137-143`, #368 `metrics.ts:182-190`)

`ownRows` matches an own domain exactly (`ownDomains.includes(bare(r.domain))`), but the gap filter treats a subdomain of
any roster domain as that brand's site (`isRosterSite`, `d === rd || d.endsWith('.' + rd)`, #361 `metrics.ts:161`, #368 `:207`) and
also drops rows Peec classifies `OWN` (#361 `:164`, #368 `:210`). So a `blog.brand.com` row is neither a gap nor own, and the notes can say "No
retrievals of the brand's own site." Fix: a row is own when its bare domain equals an own domain or ends with `.` plus
one, **or** its `classification` is `OWN`. Everything downstream (`ownRetrievedChats`, `ownRetrievedPct`, #368's `ownSites`
and the notes) reads `ownRows` and is unchanged. `ownDomains` (the brand's configured list, used by grounding's allowed
domains, `grounding.ts:103`) is unchanged. An empty own-domain entry is skipped, as the roster list already does
(#361 `metrics.ts:160`, #368 `:206`, `.filter(Boolean)`), so it can never match by suffix.

### 18.3 A per-call timeout on an optional Peec call is a warning (#361 `pull.ts:94,103,118,126`, `peec.ts`)

`PeecError.timeout` is true for the overall deadline (`peec.ts:77`) and for the per-call timer (`timeoutErr`, `:80`, which
fires after `min(CALL_TIMEOUT_MS = 45s, left)`). The four optional calls (model breakdown, `/model-channels`,
`/actions/list`, `/prompts`) rethrow any timeout, so one 45s stall with 150s of budget left fails the generation. Fix: a
subclass `PeecDeadlineError extends PeecError` (constructor `(message)`, calls `super(message, true)`, keeps `name =
'PeecError'`), thrown when the deadline is reached at the top of `call()` and when the per-call timer was capped by the
deadline (`left <= CALL_TIMEOUT_MS` when the attempt started). A subclass, not a new constructor argument, because #361's
constructor is `(message, timeout)` and #368's is `(message, timeout, rowCap, code)`: a positional flag added on #361 would
mean `rowCap` after the merge. `timeout` keeps its meaning, so
`generate.ts:104` still reports any timeout on a required call as "Timed out at step N". New `isPeecDeadline(e)` (`e instanceof PeecDeadlineError`). `history_too_long` (#368 `pull.ts:92`) is unchanged. The
optional calls rethrow only `isPeecDeadline` (and, in #368, a contract violation, `pull.ts:51`); a per-call timeout becomes
that call's existing warning.

### 18.4 A save whose answer is lost no longer locks the editor (#366 `save-queue.ts:66,82`; #368 the slots route, `editor.tsx:156-182`)

Today a retry resends the revision the lost attempt already used. `saveSlotsQuery` updates only `WHERE revision = shown`
(`store.ts:62-70`), so if the lost PATCH committed, the retry gets 409 `stale` and the queue stops ("This snapshot changed.
Reload."), dropping everything queued and typed after it. Comparing values can't tell our landed write from another tab's,
and a bullet add or remove can't be compared at all, so each write says who wrote it and in what order:

- **Writer and sequence (queue, #366 and #368):** each `SaveQueue` gets a `writer` UUID when it is built
  (`crypto.randomUUID()`, injectable for tests). An item (an edit, and in #368 a structure item, whose `structural` list
  becomes `{ path, seq? }[]`) gets the next `seq` (1, 2, 3, ...) the first time it is sent and keeps it on every retry, so
  `seq` order is send order. `send` receives `(path, value, revision, { writer, seq, signal })`.
- **Retry the same item first (queue):** after a `retry` result, the next attempt is that item again: a structure item
  stays first even when edits are pending (today edits always go first, `save-queue.ts:81` at #368); an edit sends whatever
  is now pending for the same path (the same item, or the newer value that replaced it, which gets its own `seq`). Only
  after that attempt resolves (200, 400 or stop) does the queue go back to its normal order.
- **Storage (#368):** migration `0029` adds `aeo_outbound_reports.last_writer uuid NULL` and `last_seq integer NULL`.
  `saveSlotsQuery` (the only statement that bumps `revision`; generation and Edit a copy write revision 0, and
  `copyAsDraftQuery` lists its columns) sets both on **every** save, to the request's values or to NULL when the request
  has none, so a save from an old tab clears them.
- **Request (#368):** the PATCH body adds optional `writer` (a UUID string) and `seq` (an integer, 1 or more, at most
  2^31 - 1), both or neither. `SLOTS_BODY` accepts them, and the route's structural guard (`route.ts:27-29`, which runs even
  under `CONTRACT_DISABLED`) checks the same rules; any violation is 400 `bad-request`, before the report is read.
- **Route (#368):** a loop of at most 3 row reads, the route's existing `getReport` (`route.ts:33`) being the first:
  1. Not a readable draft: 409 `not-draft` as today (approved, discarded or unreadable between attempts).
  2. The request has `writer` and `last_writer` equals it: if `last_seq = seq` this item already landed, so answer 200
     with the row's revision, stored notes, `needsValidation` and, for a structure path, its slots, writing nothing; if
     `last_seq > seq` a later item of ours landed and this is a late attempt, so 409 `stale` (its fetch was aborted;
     nobody reads it). This runs **before** the patch is applied, because a landed bullet add or remove would make
     `applyStructure` refuse its own retry (`slots.ts:119,122`, 400 before any update, `route.ts:45-46`).
  3. Apply the patch to the row as read; a refusal is 400 as today.
  4. The revision to update from: the request's when it equals the row's (today's case); else the row's when step 2 found
     `last_writer` ours with `last_seq < seq` (an earlier item of ours is the last write); else 409 `stale` as today.
  5. Conditional update. A match answers 200 as today. A miss reads the row again and goes back to step 1; after the
     third read, 503 `unavailable` (the queue's `retry`).
- **Hung saves (#366 queue, #368 editor):** each attempt races `send` against `SAVE_TIMEOUT_MS = 15000`; on expiry the
  attempt's `AbortController` aborts and the result is `retry` (so Approve, disabled while `saving`, comes back once a retry
  lands, and "Couldn't save, retrying" shows). The editor passes the signal to `fetch`. 15s is a decision, not a
  measurement: a save is four Neon queries, normally well under a second; 15s leaves room for a cold start.
- **Deploy order:** once `schema.ts` has the two columns, Drizzle names them in every select, so `getReport` fails with
  42703 on a database without 0029. `MIGRATIONS-PENDING.md` says 0029 is applied in each environment before the build that
  carries it, like 0028's entry. On dev that also means before my local QA server runs this branch.

Why this is safe: every write is a compare-and-set on `revision`, so a write lands only on the row it read. A foreign
write (another tab, an old tab) sets `last_writer` to something else, after which step 4 sends every stale attempt of ours
to 409. When `last_writer` is ours, the last write was ours and `last_seq` names it; `seq` rises in send order, and a
retried item is sent before any later one, so an aborted attempt that lands late either misses the compare-and-set or meets
step 2's `last_seq > seq`. So a structure item is answered by step 2 on its retry and never applied twice, and an older
value never lands over a newer one.

### 18.5 Counting an open never delays the page (#368 `app/snapshot/[token]/route.ts:41-66`)

`GET` awaits `countOpen` (up to `OPEN_BUDGET_MS = 1500`) before responding, and when the budget wins the record keeps
running with nothing holding the function alive. Fix: `GET` responds at once and schedules `countOpen` with `after()` from
`next/server` (Next 16.3.8 docs, `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md`: it runs for
the route's max duration, and a Route Handler may read cookies and headers inside it, which `auth()` needs). `countOpen`
awaits the session read and the write with no race, so a slow write is never cut off, and logs `reason=session` or
`reason=error` for a real failure. If the work has not settled after `OPEN_SLOW_MS = 10000` it logs one line
`open slow id=…` and keeps waiting (so a hang is visible and an open that lands late is never logged as lost).
`OPEN_BUDGET_MS`, the `expired` flag and `reason=timeout` go. HEAD is unchanged (never records). The PR text that says the budget never delays
the page is corrected.

### 18.6 The editor's Prepared date is the one the prospect will see (#368 view route `:56`)

Draft and preview render `fmtEasternDay(row.data.generatedAt)`, approve freezes `fmtEasternDay(now)`
(`app/actions/aeo-outbound.ts:62`). Fix: the view route renders a draft and its preview with `fmtEasternDay(new Date())`,
the date approving now would print. The editor fetches the page when it opens and after each structure save or
status change (`editor.tsx:150`), so a draft left open across Eastern midnight shows yesterday until then: accepted. Spec v1.0 §5 row 10 changes from "the generation date in a draft" to "today's date in a
draft or preview, the date approving now would freeze". The frozen page is unchanged.

### 18.7 A worse second Glean attempt never replaces a better first one (#368 `generate.ts:89-91`)

`groundedFallback` is overwritten by attempt 2 whatever its flag count. Fix: attempt 2 replaces the fallback only when it
has no more flags than the fallback (`flags.length <= groundedFallback.flags.length`); a tie takes attempt 2. With no
fallback yet (attempt 1 failed shape, searched, or could not be read) attempt 2 is kept as today.

### 18.8 Hub: typing during a search, and Show older after a refresh (#368 `hub.tsx:149-164`, `:231-232`)

- **Search:** the `q` effect (`:154`) resets the box and cancels the timer on every `q` change, including the one this tab's
  own `router.push` causes, so " co" typed while `?q=acme` renders is lost. Fix: a ref holds, in order, the cleaned values this tab
  pushed that have not arrived yet, and `target` is the last value pushed (or the last `q` re-synced). When `q` arrives
  equal to a pending value, the effect drops that value and every one pushed before it and leaves the box and timer alone.
  Any other `q` (Back, Forward) re-syncs as today, empties the list and sets `target = q`. The timer pushes when the box's
  cleaned text differs from `target` (today it compares with `qRef`, `hub.tsx:162`), so clearing the box while "acme"
  renders still pushes the empty search. Both sides use `cleanSearch`
  (`app/tools/new-business/page.tsx:19`, `hub.tsx:161`), so equal text compares equal.
- **Show older:** `older` is pinned to `q` only. A refresh that adds a row pushes the first page's last row past the old
  cursor, and it is in neither list. Fix: `older` also records the first page's cursor it continued from, as the string
  `before|beforeId` (by value: `router.refresh()` makes a new object every time). It is taken at the first Show older and kept on
  later clicks. When the current first-page cursor differs, `olderRows` is empty and `nextCursor` is the current cursor, so Show older starts again from the right place.

### 18.9 A fast browser clock no longer hides this tab's run (#368 `use-generation-progress.ts:59`, the progress route)

The hook compares the server's `createdAt` with the browser's `clickedAt` minus `OTHER_RUN_MS` (5s); a browser clock more
than 5s ahead hides every poll. Fix: the progress route adds `now` to both 200 bodies, read from Postgres in the
same query (`now()`), the clock that sets `createdAt` (`insertGeneratingQuery` leaves it to `defaultNow()`, `store.ts:36-39`);
the "no row" body reads it with a one-line `select now()`; per poll the
hook takes `offset = Date.parse(now) - Date.now()` (0 when `now` is missing or unreadable) and compares `createdAt` with
`clickedAt + offset - OTHER_RUN_MS`. Network delay only makes the check more lenient.

### 18.10 Edge cases

| Case | Expected |
|---|---|
| Rival 12.4% (0.12351), own 12.3% (0.12349) | `#2 of 3`, `leaderGaps` lists the rival at 0.1 points |
| Rival and own both show 12.3% | rival not in `leaderGaps`, rank unchanged (tie) |
| Rows `brand.com`, `blog.brand.com`, `other.com` (OWN), `notbrand.com` | own rows are the first three; `notbrand.com` is not |
| `/prompts` per-call timeout with 150s left | warning, generation continues |
| `/prompts` timeout with 30s left (timer capped by the deadline) | rethrown, "Timed out at step 8" |
| Lost 200 on edit A, Ryan keeps typing A | the newer value goes next with a higher `seq`; `last_seq` is A's, so step 5 applies it on top, no stop |
| Lost 200 on edit A, A resent unchanged | step 3: 200, nothing written twice |
| Lost 200 on a bullet add (list now 3), an edit queued meanwhile | the add is resent first; step 2 answers 200 with the row's slots before the patch (which would refuse it); then the edit |
| Lost 200 on a bullet remove (list now 2), then retry | step 2: 200 with the row's slots, no second remove |
| A step-4 apply hangs, is aborted, then lands; the retry arrives | step 2 on the re-read (at most 3 reads) |
| Three reads all miss | 503, the queue retries |
| An aborted attempt arrives after a newer item of ours landed | step 2: 409 nobody reads, nothing written |
| Another tab, or an old tab with no `writer`, saved after our lost attempt | step 4: 409 `stale`, stop (today's behaviour) |
| Row approved or discarded between our attempts | step 1: 409, stop |
| `writer` not a UUID, `seq` 0 or a string, or only one of them | 400 `bad-request`, the report is never read |
| PATCH hangs | after 15s the fetch aborts, retry with backoff, then lands |
| Old editor tab sends no `writer` | behaves exactly as today, and clears `last_writer` |
| Open counting fails | page already sent; one `reason=session` or `reason=error` line |
| Open counting takes over 10s | one `open slow` line, the work keeps going and may still record |
| Draft generated Oct 1, opened Oct 13 | editor and preview say Oct 13 |
| Attempt 1 one flag, attempt 2 four flags | attempt 1's copy and its one flag are saved |
| Type during the push's render; then Back | text kept; Back re-syncs the box |
| Two pushes ("acme", "acme co"), "acme" renders first | box kept; "acme co" arriving later is also kept |
| Box cleared while "acme" renders | the empty search is pushed after the pause |
| Show older twice, then Generate adds a row | older rows clear, Show older resumes after the new last row |
| Browser clock 60s ahead | this tab's run shows its steps |
| Progress answer with no `now` | offset 0, as today |

### 18.11 Tests (written before the code)

One per edge-case row above, at the unit that owns it: `metrics.test.ts` (rows 1 to 3, in #361 and #368's copy),
`peec.test.ts` (`PeecDeadlineError` only when the deadline is reached or caps the timer; a plain per-call timeout stays a
`PeecError` with `timeout`), `pull.test.ts` (rows 4 and 5 for each of the four optional calls), `save-queue.test.ts`
(one `writer` per queue; `seq` on first send, kept on retry, increasing in send order; a retried item goes first, a
structure item ahead of pending edits; the timeout result and abort; the newer value after a retry gets a new `seq`),
the slots `route.test.ts` (steps 1 to 5 each; a retried landed add on a list of 3 and a retried landed remove on a list
of 2 both answer 200 with the slots; three misses answer 503; the guard rows; no `writer`), `store.test.ts`
(`last_writer` and `last_seq` set in the update, NULL when absent; Edit a copy leaves them out), the migration journal
test (0029 after 0028), `snapshot/[token]/route.test.ts` (`after` mocked: the response is returned before the open work
runs; failure and slow lines), the view `route.test.ts` (draft and preview use today's Eastern day, approved unchanged),
`generate.test.ts` (attempt 1 kept over a worse attempt 2, and the tie), `hub.test.tsx` (the search and Show older rows),
the progress `route.test.ts` (`now` from the query in both bodies) and `use-generation-progress.test.ts` (the clock rows).
Every existing test keeps passing unless a part names the expectation it changes.

No scratch trial: every behaviour here is deterministic and runs in these tests. The one part they cannot run is Postgres
accepting `0029`, which the dev apply's read-back checks (on my written go).

### 18.12 Ryan can add up to 6 findings per box, and remove down to 1 (my decision, 2026-10-13; to be specced in full)

Today each of the two finding boxes holds 2 or 3 bullets, enforced in `slots.ts:47-49` (paths and `STRUCTURE`, index
`[0-2]`), `applyStructure` (`slots.ts:119,122`), and the stored and generated contracts (`contracts.ts:101,152`,
`.min(2).max(3)`). My decision: Ryan can add bullets up to **6** per box and remove down to **1**; Glean still writes 2 or
3. The layout must stay clean at every count on desktop and phone. Before this is specced in full: a mock at 1, 3 and 6
bullets in each box, desktop (1280, 1440) and phone (390), for me to look at. Built together with 18.4, which edits the
same structure path.
