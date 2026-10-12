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
  documents, answers a Cloudflare 404 and is never used. The origins are constants in `config.ts`.
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
