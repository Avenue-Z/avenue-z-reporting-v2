# AEO Outbound Snapshot: design spec

**Status:** draft, review round 1 fixes applied. **Branch:** `docs/aeo-outbound-audit-spec` → `aeo-outbound-audit` (deliverable) → `dev`.
**Base read:** this repo at `dev` `15b778de`; AIVx at `Avenue-Z/aivx-reports` `main` `ff18697`; Peec docs read 2026-10-08.
**User:** Ryan Cadigan (New Business). **Reviewers:** Paul and me.

Every claim about existing code cites `file:line`. `aivx:` means the AIVx repo at `ff18697`. Peec API facts cite the doc page.
Anything not provable by reading is marked **UNVERIFIED** and is covered by a scratch trial in §12.

## 1. What this is

A tool in the dashboard's Tools area that produces a one-page **AI Visibility Snapshot** of a prospect's brand from a
Peec pitch project, in the AIVx report design, for New Business outbound. Ryan picks a Peec project, the tool pulls Peec
data and writes the copy, Ryan edits the copy on the page itself, approves it, and sends a link. The link shows that one
frozen report and nothing else. He can revoke the link at any time.

It replaces Ryan's Glean skill "AEO Outbound Audit One-Pager". That skill's content rules (section order, data rules,
writing rules, QA gate) become this tool's generation rules (§6). Nothing runs in Glean except the copy-writing call.

**Non-goals:** PDF export, editing numbers or charts, other users (allowlist only, §8), changes to AIVx, changes to the
existing dashboard share links, scheduled or automatic generation.

## 2. Ryan's workflow (the whole UX)

1. Open **Tools → New Business** (`/tools/new-business`). The hub lists every snapshot with its status.
2. Pick a Peec project from the dropdown (pitch projects by default) and click **Generate**. A row appears as
   *Generating*. When it finishes (§12 T3 measures how long), it becomes *Draft* and opens.
3. **Edit.** The editor shows the real report exactly as the prospect will see it. Click any sentence and type. Changes
   save on their own ("Saving…" then "Saved" in the toolbar). Numbers and charts are locked. There is no form and no
   separate admin screen.
4. **Check the side panel.** It lists anything that needs a human look: missing inputs (`Needs validation`), numbers in
   the copy that don't match the Peec data, and source notes. These notes never appear on the report.
5. **Approve.** One button. It asks to confirm ("Approving freezes this report. You can't edit it after this. To change
   it, rerun."). After approval the report is frozen for good and the link exists.
6. **Copy link** and send it. The recipient opens it with no login and sees only that report.
7. **Revoke** (optional, confirm dialog). The link stops working immediately and permanently.
8. **Rerun** makes a fresh snapshot of the same Peec project as a new draft. The old one is untouched, so an approved
   report stays live until it is revoked.
9. **Discard** removes a draft or failed snapshot from the hub.

## 3. Where each piece comes from

| Piece | Source | How it is used |
|---|---|---|
| Look: stylesheet | `aivx:agent/renderer.py:170-1311` (`CSS` string), byte-identical to every published report's `<style>` and the locked reference `aivx:reports/aivx-digital-banks-2026-05.html` (I checked: equal, CSS SHA-256 `2925c9bd76410aaa8e6ea832a7fd9e20d981efcb65fa68958545cf3b251c833e`) | Copied verbatim into `lib/aeo-outbound/aivx/css.ts`. A test pins the SHA-256. |
| Look: page JS (scroll-spy nav, sortable tables) | `aivx:agent/renderer.py:1317-1373` (`JS`) | Copied verbatim. |
| Look: markup blocks | `aivx:agent/renderer.py` builders (§5 lists each one) | Re-implemented as TS string builders with the same class names and structure. |
| Look: head, fonts, favicon, Plotly | `aivx:agent/renderer.py:2530-2541` (Avenir via `@font-face` to `avenuez.com` at `:171-175`, inline favicon, `plotly-3.5.0.min.js` from `cdn.plot.ly`) | Same tags. **Not** `report-editor.css` or `report-editor.js` (`:2540`, `:2556`), which are the AIVx admin editor. |
| Charts | `aivx:agent/agent.py:46-55` `PLOTLY_BASE`, `:32` `BRAND_COLORS`, `:2477-2500` legend and contrast helpers, `:2572-2631` `build_sov_donut`, `:2696-2763` palette and `build_earned_breakdown_chart` | TS builders emit the same trace and layout JSON, including the default `template` that Python embeds (seen in the reference report's figure JSON). Parity is proven by golden fixtures (§10, T2). |
| Peec HTTP client | `aivx:lib/peec-client.ts:17-139` (base URL, `x-api-key`, 45s timeout, 4 attempts, 429 retry on `X-RateLimit-Reset` clamped to 0-120s, key scrubbing) | Ported into `lib/aeo-outbound/peec.ts`, with the retry numbers tightened to fit the time budget (§7a). The dashboard's `lib/peec` is not used: its HTTP helpers are not exported (`lib/peec/client.ts:25,52`) and its only export takes a client slug (`:842`). |
| Peec paging | `aivx:agent/peec_api_export.py:106-198` (`limit`/`offset`, stop on the first **empty** page, abort on a repeated natural key, row cap) | Ported. |
| Data window | `aivx:lib/peec-client.ts:186-246` `resolveWindow` (400-day discovery, min/max of days with retrievals). Peec returns zero rows without dates (live measurement recorded at `:186-194`); the docs default both dates to `2026-01-01` (get-domains-report page) | Ported. Every report call sends the same explicit window. |
| Guards | `aivx:agent/peec_api_export.py:326-389` `run_guards`; `aivx:agent/peec_api_transform.py:15-32,98-109` | Ported subset (§7). |
| Copy rules | Ryan's Glean skill (kept in my private notes) | Rewritten as the prompt template in `lib/aeo-outbound/prompt.ts` (§6). |
| LLM call | `lib/glean.ts:39-100` `gleanChat`; JSON extraction pattern `lib/peec/synopsis.ts:63`; grounding check with 2 attempts `lib/peec/content-impact-synopsis.ts:58-100,203-255` | Reused as-is (import only). |
| Page guard | `lib/auth/page-access.ts:25-33` `requireStaff`; shape enforced by `lib/auth/protected-pages.test.ts:16,35-47,57-68` | Every page under `/tools` follows it. |
| One-user allowlist | `lib/commentary/permissions.ts:2-29` (comma-separated env, `@avenuez.com` only, fail closed) | Same pattern, new env var `AEO_OUTBOUND_USERS`. |
| Public tokened page | `app/share/[token]/page.tsx:9-19` (outside the proxy matcher `proxy.ts:24-26`, `noindex`), token `randomBytes(18).toString('base64url')` (`app/actions/dashboard.ts:257-258`) | Same token recipe. A route handler instead of a page, so the root layout and `globals.css` (`app/layout.tsx:2,31`) never touch the AIVx HTML. |
| One-way approve of exactly what was shown | `lib/organic-social/chart-notes/mutations.ts:58-79` (UPDATE matches `status='draft'` plus the shown content) | Same idea with a `revision` number. |

## 4. Architecture

All new code lives in new folders. Nothing else in the app imports it.

| Path | Kind | Purpose |
|---|---|---|
| `app/tools/new-business/page.tsx` | page (staff + allowlist) | Hub. A static folder shadows `app/tools/[teamSlug]/page.tsx` for this slug, the same way `app/tools/reporting/page.tsx` does today. |
| `app/tools/new-business/[reportId]/page.tsx` | page (staff + allowlist) | Editor: toolbar, report iframe, notes panel. |
| `app/api/aeo-outbound/projects/route.ts` | GET (staff + allowlist) | Peec project list for the hub dropdown: `200 [{id,name,status}]`, or `502 {error}` when Peec fails. Loaded client-side, so a Peec outage never blocks the hub table, Revoke or Copy link. |
| `app/api/aeo-outbound/generate/route.ts` | POST, `maxDuration = 300` (precedent `app/api/cache-warm/route.ts:39`) | Contract in §7a. |
| `app/api/aeo-outbound/reports/[id]/view/route.ts` | GET (staff + allowlist) | Returns the report HTML as `text/html`, `Cache-Control: no-store`: the draft with editing hooks, or the frozen HTML. 404 for unknown or discarded ids. Only the editor's own `fetch` calls it (§10). |
| `app/api/aeo-outbound/reports/[id]/slots/route.ts` | PATCH (staff + allowlist) | Autosave of one text slot. Contract in §9a. |
| `app/actions/aeo-outbound.ts` | server actions | `approve`, `revoke`, `rerun`, `discard`. Each re-checks session and allowlist. |
| `app/snapshot/[token]/route.ts` | GET, **public** | Serves the frozen HTML. Outside the proxy matcher (`proxy.ts:24-26`). |
| `lib/aeo-outbound/*` | lib | `peec.ts`, `pull.ts`, `metrics.ts`, `charts.ts`, `render.ts`, `aivx/css.ts`, `aivx/js.ts`, `prompt.ts`, `generate.ts`, `grounding.ts`, `store.ts`, `permissions.ts`, `token.ts`. |

Route handlers sit outside `app/tools`, because `protected-pages.test.ts:54,60` forbids `route` files there. `/api` and
`/snapshot` are outside the proxy matcher, so every handler checks auth itself, like `app/api/export/pdf/route.ts:47`.

**Shared files touched (append-only):**
1. `lib/db/schema.ts`: the new table (§9).
2. `drizzle/0026_*.sql`, `drizzle/meta/0026_snapshot.json`, `drizzle/meta/_journal.json`: the generated migration (latest today is `0025`).
3. `MIGRATIONS-PENDING.md`: an entry.
4. `.env.example`: `AEO_OUTBOUND_USERS`.
5. `lib/constants.ts` `TEAMS` (`:269-318`): one new team `{ slug: 'new-business', name: 'New Business', tools: [{ slug: 'aeo-outbound-snapshot', name: 'AEO Outbound Snapshot', url: '/tools/new-business' }] }`.
6. `vitest.config.ts` include list (`:13-79`): `'lib/aeo-outbound/**/*.test.{ts,tsx}'`, `'app/api/aeo-outbound/**/*.test.{ts,tsx}'`, `'app/snapshot/**/*.test.{ts,tsx}'`.

No change to `proxy.ts`, `auth.ts`, `lib/auth/*`, `lib/peec/*`, `lib/glean.ts`, `app/share/**`, `app/globals.css`,
`components/layout/sidebar.tsx`, `package.json` or the `clients` table.

**Known quirk (accepted, no shared edit):** the team sidebar opens tool links in a new tab (`components/layout/sidebar.tsx:964-973`).
The hub itself renders in-app, because `/tools/new-business` shows `TeamSidebar` for slug `new-business` (`sidebar.tsx:75-87`),
and with the `TEAMS` entry it reads "New Business" (`:924-925`).

## 5. The report page (AIVx design)

One HTML document. `<head>` follows `aivx:renderer.py:2530-2541` exactly, except: title `AI Visibility Snapshot: {brand} | Avenue Z`;
no canonical link; no `report-editor.css` or `report-editor.js`; `<meta name="robots" content="noindex,nofollow">`. The body is
`.sidebar` plus `.main`, as at `aivx:renderer.py:2542-2554`. Sections in order, each mapped to an existing AIVx block:

| # | Ryan's section | AIVx block (builder) | Content |
|---|---|---|---|
| 0 | (navigation) | `.sidebar` (`:1379-1411`) | `.aivx-brand` "AIVx", `.powered` "Powered by Avenue Z", `.sidebar-industry` "AI Visibility Snapshot" with `<span>{brand}</span>`, nav 01-05 to the sections below, the share button and the `avenuez.com` link, as-is. |
| 1 | Brand header | `.hero` (`:1414-1467`) | `.hero-series` "AI Visibility Snapshot"; `h1.hero-industry` = `<span class="grad-text">{brand}</span>`, with the 72px rule for names over 24 characters (`:1439-1458`); `.hero-subtitle` = `Category: {category} · Market: {market} · Data window: {start} to {end}`. |
| 2 | Headline signal | `.exec-summary` (`:1470-1518`) | `.exec-label` "Headline signal"; `.exec-headline` = **headline** slot; `.exec-subheadline` = **summary** slot (one sentence). |
| 3 | Metric strip | `.kpi-strip` with 4 `.kpi-card` (`:1593-1610` markup, CSS `:485-539`) | AI visibility · AI share of voice · Average answer position · Competitive rank (§7). |
| 4 | Competitive context | `.insight-box` (CSS `:862-877`, usage `:2215-2219`) | **context** slot. Brand names in `<strong>`. |
| 5 | Competitive visibility | `section.section` + `.section-label` / `h2.section-title` (`:1582-1584`), `.two-col` (`:2241`) | Left: `.insight-box` with a `<ul>` styled exactly as `:2313`, holding **competitive_bullets** (2-3). Right: `.chart-wrap` + `.chart-title` "Share of Voice: Top 5 Brands" + SOV donut (§7). |
| 6 | Sources | same layout | Left: **sources_bullets** (2-3). Right: `.chart-wrap` "Where Do AI Answers Get Their Sources?" + source-type donut (§7). |
| 7 | Why it matters | `.rec-global-bottom-line` (`:2382-2392`, same inline styles) | Title "Why it matters"; **why** slot. |
| 8 | Three opportunities to explore | `.leaderboard` table inside `.leaderboard-wrap` (`:2223-2240`) | Headers `Signal` · `Opportunity to explore` · `Likely workstream`; 3 rows of **opportunities**; then `.chart-takeaway` with the fixed line "These are opportunity hypotheses for discussion, not a full roadmap." |
| 9 | Methodology and next step | `.method-note` (CSS `:1176-1187`, usage `:2322`) | `<strong>Methodology:</strong>` **methodology** slot, then `<strong>Next step:</strong>` **next_step** slot. |
| 10 | Footer | `.footer` (`:2464-2498`) | Same markup. Series label "AI VISIBILITY SNAPSHOT"; `{brand}<br>{generated date}`; the disclaimer says the data is a Peec snapshot for the stated window and is directional. |

Each bullet is `<li><strong>{lead}</strong> {text}</li>`. Headings in rows 5 and 6 are fixed text, pending R3 (§13).

**Escaping:** every string that reaches the HTML is escaped on render (`& < > " '`, as in `aivx:renderer.py:15` `esc`). That
covers slots and also every Peec-sourced string: brand, competitor and domain names, classification labels, action titles
and the project name. Plotly figures are embedded as `JSON.stringify(figure)` with every `<` written as `<`. Python's
Plotly output does the same, which you can see in the reference report's figure JSON (`<b>` in the SOV
`hovertemplate`). So no Peec or model text can close a `<script>` or inject markup.

## 6. Copy generation (Glean)

One `gleanChat(prompt, { saveChat: false })` call (`lib/glean.ts:39-42`). The prompt carries:
- Ryan's writing rules, restated: concise, neutral, client-facing; Peec terminology; findings, hypotheses and
  recommendations kept distinct ("explore", "investigate", "test"); no inferred prompt count, models, timeframe, market,
  sentiment or causality; strengths and gaps kept distinct; no pricing or agency comparisons; never mention the internal process.
- The strict number rules from `lib/peec/content-impact-synopsis.ts:225-227`, plus "no em dashes".
- A **Data** block: only the computed values from §7, already formatted the way they display.

The output is strict JSON of these slots: `headline`, `summary`, `context`, `competitive_bullets[2..3]{lead,text}`,
`sources_bullets[2..3]{lead,text}`, `why`, `opportunities[3]{signal,opportunity,workstream}`, `methodology`, `next_step`.
It is parsed with the fenced, direct and brace-span strategy (`lib/peec/synopsis.ts:63` pattern) and then validated:
every key present, every value a non-empty string, counts in range.

**Grounding check** (`lib/aeo-outbound/grounding.ts`, modeled on `content-impact-synopsis.ts:58-100`): every number in the
copy must equal a number in the Data block after formatting. On a parse, shape or grounding failure it retries once with
the violations quoted back (`:216-218`). It stops at 2 attempts (`:203`).
- If **shape** still fails, the snapshot is marked *Failed*.
- If only **grounding** still fails, it saves as *Draft* with each violation listed in the notes panel. Ryan fixes or keeps the number.

**Retrieval (UNVERIFIED):** `gleanChat` sends only `messages` and `saveChat` (`lib/glean.ts:54-65`). Whether Glean chat also
searches company documents by default is not provable by reading. If it does, internal material could leak into copy for an
external prospect. Mitigations:
- The prompt says to use only the Data block and no other source.
- T3 (§12) tests it with a probe question whose answer exists only in internal docs.
- If retrieval is on and can't be turned off from this tool's own call, I'll bring it back to you as a decision before planning.

The **domain check** flags any domain-like token (`word.tld`) in the copy that isn't in the Data block.

`category` and `market` are not written by the model. They come from `/project-profile` (§7). When missing they read
`Needs validation` and are editable slots.

## 7. Data: calls, fields and math

Env: `PEEC_AI_CUSTOMER_TOKEN` (`.env.example:48`), sent as `x-api-key` (docs: authentication page). Every report call
carries `project_id`, `start_date` and `end_date` from step 4. The model filter is set by R2 (§13). The default is no
filter. That this means all models is **UNVERIFIED**, and T3 checks it.

| Step | Call | Fields used | Rule |
|---|---|---|---|
| 1 | `GET /projects`, paged | `id`, `name`, `status` (enum includes `PITCH`, `PITCH_ENDED`; list-projects page) | Dropdown shows `status = PITCH` first. A toggle shows all. Resolved by **id** from the dropdown, so there is no name guessing. |
| 2 | `GET /brands?project_id`, paged | `id`, `name`, `is_own`, `domains[]` (list-brands page) | Exactly one `is_own`, or fail (`aivx:lib/peec-client.ts:169-176`). Every other brand is a competitor. |
| 3 | `GET /project-profile?project_id` | `profile.industry` → category; `profile.target_markets[].location` joined → market (get-project-profile page) | `profile: null` → both `Needs validation`. |
| 4 | `POST /reports/domains`, `dimensions:["date"]`, 400-day discovery | `date`, `retrieved_chat_count` | Window = min/max date with retrievals > 0 (`aivx:lib/peec-client.ts:195-248`). No such day → fail. |
| 5 | `POST /reports/brands`, no dimensions, paged | `brand.id`, `brand.name`, `visibility` (0-1), `share_of_voice` (0-1), `position` (lower is better) | Own row must exist, or fail. |
| 6 | `POST /reports/domains`, no dimensions, paged | `domain`, `classification`, `retrieved_chat_count`, `mentioned_brands` | `sum(retrieved_chat_count) > 0`, or fail (`aivx:peec_api_export.py:356-360`). |
| 7 | No call. Computed from step-6 rows. | `domain`, `retrieved_chat_count`, `mentioned_brands[].id` | Competitor domain gap = a row whose `mentioned_brands` holds no own-brand id and at least one competitor id. The top 4 by `retrieved_chat_count` feed the Data block. The Peec docs list a `gap` filter but don't define it, so it isn't used. What `mentioned_brands` means on a domain row is **UNVERIFIED**, and T3 checks it on real rows. |
| 8 | `POST /actions/list`, default `order_by` `impact` desc, `limit 10` (list-actions page) | `title`, `impact`, `group`, `target` | Feeds the opportunities, pending R7. An empty list is fine. |

**Formatting and metrics** (stated here as the rounding convention Ryan's skill requires):
- **AI visibility** = `round(visibility × 100, 1)%`. **AI share of voice** = `round(share_of_voice × 100, 1)%`. Same rule as `aivx:agent/agent.py:1312-1314`.
- **Average answer position** = `#` + `position` to 1 decimal.
- **Nulls:** Peec requires only `brand`, `mention_count`, `visibility`, `visibility_count` and `visibility_total` on a brands-report row; `share_of_voice` and `position` may be absent (OpenAPI `/reports/brands`). AIVx keeps those as None (`aivx:agent/agent.py:1312-1316`). Here a missing SOV or position displays `n/a` in its KPI card, gets a note in the notes panel, and is left out of the Data block. A brand with a missing SOV counts as 0 for the donut.
- **Competitive rank** = `#{i} of {n} brands`, where rows are sorted by `(-visibility, brand.id)` (`aivx:peec_api_transform.py:98-109`) and `n` = rows returned in step 5.
- **SOV donut** = `build_sov_donut` logic (`aivx:agent.py:2572-2631`): top 5 by SOV %, an "All Other Brands ({n-5})" slice when the remainder is over 0.5, and a centre label of the rank-1 brand and its SOV %.
- **Source-type donut** = `build_earned_breakdown_chart` (`aivx:agent.py:2721-2763`) over step-6 rows grouped by `title_classification` (`aivx:peec_api_transform.py:15-32`, `OWN`→`You`) and weighted by `retrieved_chat_count`. Slice set pending R6; the default is all classifications, per Ryan's "use classifications exactly as returned".
- **Data block for Glean:** the 4 KPIs; the top 5 brands with visibility and SOV; the own domain's `retrieved_chat_count`; source-type percentages; competitor gap domains; Peec action titles with impact; window; category; market.

**Guards** (fail the generation with a named reason, ported from `aivx:peec_api_export.py:326-389`):
- empty brands report
- not exactly one own brand
- zero total retrievals
- an UPPERCASE classification outside the documented enum (`aivx:peec_api_transform.py:15-19`)
- a repeated row across pages
- past the row cap
- HTTP errors after retries

Messages never include the key (`aivx:lib/peec-client.ts:91-93` scrub).

### 7a. Generate request and time budget

- **Request:** `POST /api/aeo-outbound/generate`, JSON `{ projectId: string }`. The server:
  1. checks staff plus the allowlist, else 403
  2. re-checks that `projectId` is in `GET /projects` for this key, else 400 (AIVx does the same, `aivx:lib/peec-client.ts:162-165`)
  3. refuses with 409 if a row for that project is `generating` and younger than 6 minutes
  4. inserts the row, then runs steps 1-8 and §6 **inside the request**
  5. responds `200 { id, status: 'draft' | 'failed', error? }`

  No background API is used: `after()` can't be verified here, because `node_modules` isn't installed in this checkout.
- **Deadline:** one `AbortSignal` for the whole run, firing at **270s**, which leaves 30s under `maxDuration = 300`. It is
  passed to every Peec call and to `gleanChat`, which accepts `signal` (`lib/glean.ts:41,66`).
  - The port changes AIVx's retry numbers to fit this budget: at most **3** attempts on a 429, `X-RateLimit-Reset` clamped to **0-20s**, and a per-call timeout of `min(45s, time left)`.
  - Glean gets a second attempt only if at least 60s are left.
  - When the deadline fires, the catch runs `UPDATE … status='failed', error='Timed out at step N'` before the response.
  - A hard kill that skips the catch is covered by the stale rule (§9).
- **Tab closed mid-request:** whether Vercel keeps running the function after the client disconnects is **UNVERIFIED** and
  part of T3. Either way the row ends as draft, failed or stale-failed. It is never stuck.

## 8. Access and links

- **Who:** staff (`requireStaff`) **and** an email in `AEO_OUTBOUND_USERS`. Unset means nobody (fail closed). Pages show
  "This tool is limited to the New Business team" to other staff. API routes return 403. Actions throw.
- **Token:** `randomBytes(18).toString('base64url')` (144 bits), minted at Approve, unique, never reused.
- **Public route `/snapshot/{token}`:** looks up the token in a status `approved` row with `share_revoked_at IS NULL` and
  `deleted_at IS NULL`. It returns the stored HTML byte for byte with these headers:
  - `Content-Type: text/html; charset=utf-8`
  - `Cache-Control: no-store`, so a revoke takes effect on the next load
  - `X-Robots-Tag: noindex, nofollow`
  - `Referrer-Policy: no-referrer`
  - `X-Frame-Options: DENY`

  Unknown, revoked and discarded tokens all get the same 404 page (one static line, no app chrome), so a probe learns nothing.
- **What the recipient can reach:** only that document. The links in it are `#section` anchors, `avenuez.com`, and the
  share button, which copies the current URL (`aivx:renderer.py:2557-2614`, toast element plus script, minus the canonical tag). It has no
  link into the app, no data request, and no script from our origin.
- **Draft view `/api/aeo-outbound/reports/{id}/view`:** staff plus allowlist, `no-store`, and the response header
  `Content-Security-Policy: sandbox allow-scripts`. That way **Open full size**, which opens the URL directly in a tab,
  also runs with an opaque origin. T2 checks that this renders. The editor fetches it with its
  own session and puts the HTML into `<iframe sandbox="allow-scripts" srcdoc=…>`. A sandbox without `allow-same-origin`
  gives the report an opaque origin: no cookies, no access to the dashboard page, no same-origin requests. Even a missed
  escape couldn't act as Ryan. The iframe never saves anything itself. It posts edits to the parent, and the parent does
  the PATCH (§10).

## 9. Storage

A new table `aeo_outbound_reports` and a new enum `aeo_outbound_status` = `generating | draft | approved | failed`, in
the style of `report_commentary` (`lib/db/schema.ts:331-366`). It doesn't reference `clients`.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk default random | |
| `peec_project_id`, `peec_project_name` | text not null | Known at insert (§7a). |
| `brand_name` | text, nullable | Set once step 2 resolves the own brand. Null on a row that failed earlier; the hub shows the project name instead. |
| `status` | enum not null default `generating` | |
| `data` | jsonb | §7 values and chart figures. Frozen once written. |
| `slots` | jsonb | Editable copy. |
| `notes` | jsonb | Internal QA notes (§6, §7). Never rendered on the report. |
| `revision` | integer not null default 0 | +1 per slot save. Approve must match it. |
| `error` | text | For `failed`. |
| `html` | text | Set only at Approve. |
| `share_token` | text unique | Set only at Approve. |
| `rerun_of` | uuid | Lineage. |
| `created_by`, `approved_by`, `revoked_by`, `deleted_by` | text | Emails. |
| `created_at`, `updated_at`, `approved_at`, `share_revoked_at`, `deleted_at` | timestamptz | |

Checks:
- `status='approved'` ⇔ `html IS NOT NULL AND share_token IS NOT NULL AND approved_at IS NOT NULL`
- `share_revoked_at IS NULL OR status='approved'`
- `deleted_at IS NULL OR status IN ('draft','failed')`

**Transitions (all single conditional UPDATEs with `.returning()`, as at `app/actions/commentary.ts:17-37`):**
- generate: insert `generating`, then update to `draft` with data, slots and notes, or to `failed` with an error.
Every UPDATE below also matches `deleted_at IS NULL`, so a stale tab can't save into, approve or revoke a discarded row
(the race documented at `app/actions/commentary.ts:23-27`).
- save slot: `WHERE id AND status='draft' AND revision=$shown` → `revision+1`. 0 rows → 409, and the editor shows "This snapshot changed elsewhere. Reload."
- approve: `WHERE id AND status='draft' AND revision=$shown AND no slot contains 'Needs validation'` → sets html (rendered from the stored data and slots), token and approved fields. One-way: no transition leaves `approved`.
- revoke: `WHERE id AND status='approved' AND share_revoked_at IS NULL`. One-way.
- discard: `WHERE id AND (status IN ('draft','failed') OR (status='generating' AND created_at < now() - interval '6 minutes'))`. Sets `status='failed'` where it was `generating`, plus `deleted_at` and `deleted_by`.
- rerun: insert a new row with `rerun_of`, under the same 409 rule as generate (§7a).
- **Stale:** a `generating` row older than 6 minutes (300s `maxDuration` plus margin) displays as *Failed (timed out)*. It allows Rerun and Discard, like a failed row. No cron.

### 9a. Autosave contract

- **Request:** `PATCH /api/aeo-outbound/reports/{id}/slots`, JSON `{ path, value, revision }`.
  - `path` is one of a closed list: `headline`, `summary`, `context`, `why`, `methodology`, `next_step`, `category`,
    `market`, `competitive_bullets.{i}.lead|text`, `sources_bullets.{i}.lead|text`,
    `opportunities.{i}.signal|opportunity|workstream`, where `{i}` must index an item that exists in the stored slots.
  - `value` is a string, trimmed, control characters removed, 1 to 1,000 characters (`lead` up to 80). Empty isn't allowed.
  - `revision` is an integer.
- **Responses:**

  | Status | Body | When |
  |---|---|---|
  | `200` | `{ revision }` | Saved; returns the new revision. |
  | `400` | `{ error }` | Bad path, value or revision. |
  | `403` | | No staff session or not on the allowlist. |
  | `404` | | Unknown or discarded id. |
  | `409` | `{ error: 'stale' \| 'not-draft', revision }` | The revision doesn't match, or the report isn't a draft. |
- **The parent page owns saving** (the iframe can't, §8):
  - The iframe posts `{type:'edit', path, value}` on input. The parent checks that `event.source` is its own iframe's `contentWindow`. It can't check the origin, because a sandboxed iframe's origin is `null`.
  - The parent keeps one queue. It holds the latest value per path, sends one PATCH at a time, and carries the revision each 200 returned into the next request. So two quick edits in one tab never conflict with each other.
  - The parent tracks `dirty` (an edit not yet saved) and `saving`. **Approve is disabled while either is true** and always sends the last saved revision. What gets approved is exactly what Ryan sees.

The migration is a new table only, so no existing query selects it. The `clients` 42703 risk described in
`MIGRATIONS-PENDING.md` doesn't apply. Apply it with the hash-checked `scripts/migrate-http.ts` and record it in
`MIGRATIONS-PENDING.md`.

## 10. UI

Dashboard look (dark, `globals.css` tokens, the same card classes as `app/tools/reporting/page.tsx:7-8`), apart from the
iframe, which is pure AIVx.

- **Hub:** a header "AEO Outbound Snapshot", then a "New snapshot" bar (project dropdown + **Generate**), then a table:
  Brand · Peec project · Status · Created · Approved · Actions.
  - The table comes from the database only.
  - The dropdown is a client component that calls `/api/aeo-outbound/projects`. On failure it shows "Peec is unavailable. Retry" inline, and the rest of the hub keeps working.
  - **Generate** shows a local *Generating…* row, awaits the POST (§7a), then opens the editor (draft) or shows the reason (failed).
- **Freshness:** the client Router Cache keeps dynamic pages for 180s (`next.config.ts:18-20`). Store reads aren't
  wrapped in `cached()`. The hub calls `router.refresh()` on mount, after every action, and every 5s while any row is
  *Generating*. Server actions end with `updateTag('db')`, the existing convention (`app/actions/chart-notes.ts:80`).
- **Status pills:**

  | Status | Shown as |
  |---|---|
  | Generating | spinner |
  | Draft | yellow |
  | Live | green, with a "Copy link" button |
  | Revoked | grey |
  | Failed | red, with the reason on hover |

- **Actions per row:**

  | Status | Actions |
  |---|---|
  | Draft | Open, Rerun, Discard |
  | Live | Open, Copy link, Revoke, Rerun |
  | Revoked | Open, Rerun |
  | Failed | Rerun, Discard |

  Approve exists only in the editor, so a report can't be approved unseen.
- **Editor:** a sticky toolbar showing:
  - Back
  - brand
  - status pill
  - save state ("Saving…" / "Saved" / "Couldn't save, retrying")
  - **Approve** (draft only; disabled with a tooltip while any `Needs validation` remains or while an edit is unsaved or saving, §9a)
  - **Copy link** and **Revoke** (Live)
  - **Rerun**
  - **Notes** (toggles the drawer)
  - **Open full size** (the same HTML in a new tab)

  Below the toolbar the iframe takes the full content width. The content width is the smaller of two values
  (`app/tools/layout.tsx:23`):
  - `max-w-7xl` minus `px-8`, which is 1216px
  - the viewport minus the 256px expanded sidebar (`w-64`, `components/layout/sidebar.tsx:931`) and the 64px padding

  For any viewport 1,221px or wider that is above AIVx's 900px breakpoint (`aivx:renderer.py:1297-1300`), so the desktop
  layout shows, with sidebar and two columns. On a narrower window, **Open full size** shows the desktop layout. The **Notes** panel (missing inputs, grounding and domain
  flags, window used, model scope, rank basis, Peec project id) is a drawer over the iframe and never narrows it.
- **Editing inside the iframe:** in draft view only, each slot element carries `data-slot="{path}"` and
  `contenteditable="plaintext-only"`, with a 1px dashed outline on hover. A small inline script debounces 800ms and posts
  `{type:'edit', path, value}` to the parent (§9a). Pasting keeps text only. The frozen HTML contains none of this: no
  `data-slot`, no `contenteditable`, no editor script.
- **Confirm dialogs:** Approve, Revoke and Discard.

## 11. AI-output review (before client delivery)

- **Reviewer:** Ryan Cadigan, as the only allowlisted user, approves every snapshot before a link exists. There is no
  path from generation to a public link without Approve.
- **Checks he makes:** the notes panel (missing inputs, number mismatches), accuracy of claims against the KPIs and
  charts on the page, tone. **Recommended:** decide whether to say on the page that the copy is AI-assisted. Today the
  page doesn't say so.
- **Record:** `approved_by`, `approved_at` and `revision` on the row. The frozen `html` is the exact approved version.
  `revoked_by` and `share_revoked_at` record withdrawal.

## 12. Scratch trials (before the plan; each ≤ 30 min, throwaway, my nod first)

- **T1 Fonts:** does Avenir load from `avenuez.com` (`aivx:renderer.py:171-175`) when the page is served from the dashboard domain? (**UNVERIFIED**: cross-origin font headers.) If not, the fallback is to self-host the same woff2 files under `public/`, which needs a licence check.
- **T2 Chart parity:** run `build_sov_donut` and `build_earned_breakdown_chart` at `ff18697` on synthetic inputs, save their figure JSON as golden fixtures, and show a side-by-side screenshot of our page next to the reference report. Also confirm the page renders, charts included, in `<iframe sandbox="allow-scripts" srcdoc>` and under the `Content-Security-Policy: sandbox allow-scripts` header (§8).
- **T3 Live checks:** a read-only pull of one PITCH project (steps 1-8) plus one Glean call. No writes. It confirms:
  - the total time against the 270s deadline
  - the §7 field names on real responses
  - that no model filter returns every model's chats
  - what `mentioned_brands` on a domain row means: own-brand-absent rows checked against `/reports/urls` for the same domain
  - whether Glean chat pulls in company documents, using a probe prompt answerable only from internal docs
  - whether the generate function finishes after the browser tab closes

## 13. Open questions (Ryan answers close-ended; the spec uses the default in brackets)

- **R1:** Data window = the full date range the pitch project has data for, shown as dates? [Yes]
- **R2:** All AI models, like your Glean pulls, or ChatGPT only, like AIVx? [All]
- **R3:** Section titles "Competitive visibility" and "Sources", per Thomas Stern's comment? [Yes]
- **R4:** A short AI-written headline above the one-sentence summary? [Yes]
- **R5:** Two charts: share-of-voice donut beside the competitive bullets, source-type donut beside the sources bullets? [Yes]
- **R6:** Source-type donut shows every source type, including your own site, Institutional and Other (AIVx hides those three)? [Yes]
- **R7:** The "Peec recommends" row uses Peec's action list ranked by impact (the API has no opportunity score)? [Yes]
- **R8:** The project list shows pitch projects only, with a toggle for all? [Yes]
- **R9:** A revoked link is gone for good, and you rerun to share again? [Yes]
- **R10:** Keep the AIVx left sidebar and "AIVx" wordmark on the snapshot? [Yes] (Thomas Stern to confirm)

## 14. Edge cases

| Case | Behaviour |
|---|---|
| Project has no `is_own` brand, or several | Failed: "Peec project needs exactly one own brand (found N)." |
| No profile | Category and market show `Needs validation`. Approve is blocked until edited. |
| Fewer than 6 brands | The donut has no "All Other" slice. Rank still reads `#i of n`. |
| No gap domains, no actions | The Data block says none. The prompt forbids inventing them. |
| Peec 429 | Retry per `X-RateLimit-Reset` clamped to 0-20s, max 3 attempts, then Failed. The 270s deadline caps it all (§7a). |
| Missing SOV or position for the brand | KPI shows `n/a`, with a note (§7). |
| Stale *Generating* row | Shows as Failed (timed out). Discard and Rerun work (§9). |
| Peec 5xx, timeout, non-JSON | Failed, with a scrubbed reason. |
| Glean down, or bad JSON twice | Failed: "Copy generation failed. Rerun." |
| Two tabs editing | Revision conflict 409, reload prompt. |
| Approve double-click | The second UPDATE matches 0 rows, so it's a no-op. |
| Revoke while recipient has the page open | Their open page stays. The next load is 404 (`no-store`). |
| Function killed mid-generate | Shows as Failed (timed out) after 6 minutes. Rerun works. |
| Non-allowlisted staff | Access message, 403 or throw. No data returned. |
| Brand name over 24 characters | 72px hero rule (`aivx:renderer.py:1439-1458`). |
| HTML in copy | Every slot is escaped on render (same as `aivx:renderer.py:15` `esc`). |

## 15. Tests (written before the code)

- **Unit:**
  - CSS and JS SHA-256 pins
  - metric math and rank tie-break
  - SOV and source donut figure JSON deep-equal to the T2 golden fixtures
  - the hero 24-character rule
  - escaping
  - grounding check (passes, flags, retry prompt)
  - prompt JSON parse
  - Peec client: paging stops on an empty page, repeat abort, 429 delay clamp, key scrub, timeout
  - window discovery
  - guards
  - allowlist fail-closed
  - token format
- **Store** (mocked db, as in `app/actions/*.test.ts`):
  - each transition's WHERE clause
  - approve blocked by `Needs validation`
  - approve blocked on a stale revision
  - revoke one-way
  - discard only for draft, failed or stale generating
  - every UPDATE matches `deleted_at IS NULL`
  - rerun refused while generating
  - stale generating
- **Routes:**
  - the public route returns the exact stored bytes and headers, and a byte-identical 404 for unknown, revoked and discarded tokens
  - projects, generate, view and slots routes return 403 without staff plus the allowlist
  - each server action (approve, revoke, rerun, discard) throws for non-allowlisted staff
  - the view route sends `no-store` and `Content-Security-Policy: sandbox allow-scripts`, and 404 for unknown and discarded ids
  - the slots route covers the full §9a table: each path form, bad path 400, empty or too-long value 400, stale 409, not-draft 409
  - generate: unknown `projectId` 400, a second generate for the same project 409, deadline → `failed` with the step named, shape failure → failed, grounding-only failure → draft with notes
  - `profile: null` → `Needs validation` in category and market
- **Render:**
  - frozen HTML has no `data-slot`, no `contenteditable` and no editor script
  - `<head>` has noindex, no canonical link, the title format, and no `report-editor.*`
  - a Peec name containing `</script>` or `<b>` renders inert in the text and in the figure JSON
  - null SOV and position render `n/a`
- **Prompt:**
  - the Data block holds exactly the §7 values
  - the prompt contains the writing rules and the "use only the Data block" rule
  - the domain check flags an unknown domain
- **Editor and hub** (component tests):
  - messages from anything other than the iframe's `contentWindow` are ignored
  - the save queue sends one PATCH at a time and carries the returned revision forward
  - Approve is disabled while dirty, saving or any `Needs validation` remains
  - the status pill and actions per status match §10, including a stale generating row
  - a Peec failure in the project list shows the inline retry and the table still renders
- **Existing guards stay green:** `lib/auth/protected-pages.test.ts` (it walks the new pages), `proxy.test.ts`, `make check`.

## 16. Notes

- **Data contracts:** my `contract-core` standard is a Python library pinned via `pyproject.toml`, and this repo is
  TypeScript with no validator dependency (`package.json` has no zod or valibot). Boundary checks are the typed guards
  in §7, as `lib/peec` and AIVx do today.
- **Public repo:** this repo is public, so the copied AIVx stylesheet and markup become public. No client or prospect
  data is committed. Test fixtures are synthetic.
