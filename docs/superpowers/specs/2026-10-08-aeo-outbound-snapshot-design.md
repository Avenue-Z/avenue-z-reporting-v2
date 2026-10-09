# AEO Outbound Snapshot: design spec

**Status:** draft, review rounds 1 and 2 complete, every finding fixed (log: `2026-10-08-aeo-outbound-snapshot-review-log.md`). **Branch:** `docs/aeo-outbound-audit-spec` → `aeo-outbound-audit` (deliverable) → `dev`.
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
5. **Approve.** One button. It asks who the link is for (required, free text such as "Jane Doe, Acme") and to confirm
   ("Approving freezes this report. You can't edit it after this. To change it, use Edit a copy."). After approval the
   report is frozen for good and the link exists.
6. **Copy link** and send it. The recipient opens it with no login and sees only that report.
7. **Opens.** The hub shows who the link is for, how many times it was opened, and when it was first and last opened
   (§8). Ryan's own checks while signed in don't count. Opens are a rough signal: a count can't tell a forward from a
   re-open, a second device or an email security scanner (which often opens a link within seconds of delivery). A link
   with no login can always be forwarded; Revoke is how Ryan stops it.
8. **Revoke** (optional, confirm dialog). The link stops working immediately and permanently.
9. **Edit a copy** (approved or revoked report): a new draft with the same data, copy and notes, made without calling
   Peec or Glean. Ryan fixes it, approves it, and sends the new link. The original is untouched, so its link stays
   live until he revokes it. This is how a typo, or a mistaken revoke, is fixed without losing his edits.
10. **Rerun** makes a fresh snapshot of the same Peec project as a new draft, with new data and new copy. The old one
   is untouched, so an approved report stays live until it is revoked.
11. **Discard** removes a draft or failed snapshot from the hub.

## 3. Where each piece comes from

| Piece | Source | How it is used |
|---|---|---|
| Look: stylesheet | `aivx:agent/renderer.py:170-1311` (`CSS` string), byte-identical to every published report's `<style>` and the locked reference `aivx:reports/aivx-digital-banks-2026-05.html` (I checked: equal, CSS SHA-256 `2925c9bd76410aaa8e6ea832a7fd9e20d981efcb65fa68958545cf3b251c833e`) | Copied verbatim into `lib/aeo-outbound/aivx/css.ts`. A test pins the SHA-256. |
| Look: page JS (scroll-spy nav, sortable tables) | `aivx:agent/renderer.py:1317-1373` (`JS`) | Copied verbatim. |
| Look: markup blocks | `aivx:agent/renderer.py` builders (§5 lists each one) | Re-implemented as TS string builders with the same class names and structure. |
| Look: head, fonts, favicon, Plotly | `aivx:agent/renderer.py:2530-2541` (Avenir via `@font-face` to `avenuez.com` at `:171-175`, inline favicon, `plotly-3.5.0.min.js` from `cdn.plot.ly`) | Same tags. **Not** `report-editor.css` or `report-editor.js` (`:2540`, `:2556`), which are the AIVx admin editor. |
| Charts | `aivx:agent/agent.py:46-55` `PLOTLY_BASE`, `:32` `BRAND_COLORS`, `:2477-2500` legend and contrast helpers, `:2634-2694` `build_leaderboard_chart` (styling for the brand visibility bars), `:2696-2763` palette and `build_earned_breakdown_chart` | TS builders emit the same trace and layout JSON, including the default `template` that Python embeds (seen in the reference report's figure JSON). Parity is proven by golden fixtures (§10, T2). |
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
| `app/api/aeo-outbound/reports/[id]/view/route.ts` | GET (staff + allowlist) | Returns the report HTML as `text/html`, `Cache-Control: no-store`: the draft with editing hooks, or the frozen HTML. 404 for unknown or discarded ids. Two callers only: the editor's own `fetch` (draft with editing hooks), and **Open full size**, which requests `?mode=preview` (the same HTML without editing hooks, so nothing typed there can be lost). |
| `app/api/aeo-outbound/reports/[id]/slots/route.ts` | PATCH (staff + allowlist) | Autosave of one text slot. Contract in §9a. |
| `app/actions/aeo-outbound.ts` | server actions | `approve`, `revoke`, `discard`, `copyAsDraft`. Each re-checks session and allowlist. Rerun is not an action: it calls `POST /generate` (§7a), because only that route has the 300s budget. `copyAsDraft` makes no Peec or Glean call, so it fits an action. Contracts: `approve(id, revision, recipient)` returns `{ ok: true, token }`, or `{ ok: false, error }` with `forbidden`, `not found`, `stale`, `Fill in every "Needs validation" first.` or `Say who this link is for (1 to 200 characters).`; `copyAsDraft(id)` returns `{ ok: true, id }` (the new draft) or `{ ok: false, error: 'forbidden' \| 'not found' }`. Every refusal writes nothing. |
| `components/aeo-outbound/*` | client components | Hub table, project picker, editor toolbar, iframe host with the save queue (§9a), notes drawer. |
| `app/snapshot/[token]/route.ts` | GET, **public** | Serves the frozen HTML. Outside the proxy matcher (`proxy.ts:24-26`). |
| `lib/aeo-outbound/*` | lib | `peec.ts`, `pull.ts`, `metrics.ts`, `charts.ts`, `render.ts`, `aivx/css.ts`, `aivx/js.ts`, `prompt.ts`, `generate.ts`, `grounding.ts`, `store.ts`, `permissions.ts`, `token.ts`. |

Route handlers sit outside `app/tools`, because `protected-pages.test.ts:54,60` forbids `route` files there. `/api` and
`/snapshot` are outside the proxy matcher, so every handler checks auth itself, like `app/api/export/pdf/route.ts:47`.

**Shared files touched (append-only):**
1. `lib/db/schema.ts`: the new table (§9).
2. `drizzle/0026_*.sql`, `drizzle/meta/0026_snapshot.json`, `drizzle/meta/_journal.json`: the generated migration (latest today is `0025`; the number is regenerated against the then-current `dev` at merge time, since other branches may add migrations first). The open-tracking columns and the stricter approved check (§9) go into this same `0026`, regenerated in place, which is allowed only because `0026` is unapplied in every environment and unmerged. Evidence, 2026-10-09: `0026`
exists only on `feat/aeo-outbound-data` (first committed that day in `e3cd1b3f`; not on `dev`, `staging` or `main`),
migrations are applied only by hand on my written go, and I confirmed I never applied it anywhere. Its `MIGRATIONS-PENDING.md` read-back is updated to match, and `approveQuery` sets the recipient in the same change.
3. `MIGRATIONS-PENDING.md`: an entry.
4. `.env.example`: `AEO_OUTBOUND_USERS`.
5. `lib/constants.ts` `TEAMS` (`:269-318`): one new team `{ slug: 'new-business', name: 'New Business', tools: [{ slug: 'aeo-outbound-snapshot', name: 'AEO Outbound Snapshot', url: '/tools/new-business' }] }`.
6. `vitest.config.ts` include list (`:13-79`): `'lib/aeo-outbound/**/*.test.{ts,tsx}'`, `'app/api/aeo-outbound/**/*.test.{ts,tsx}'`, `'app/snapshot/**/*.test.{ts,tsx}'`, `'components/aeo-outbound/**/*.test.{ts,tsx}'`.

No change to `proxy.ts`, `auth.ts`, `lib/auth/*`, `lib/peec/*`, `lib/glean.ts`, `app/share/**`, `app/globals.css`,
`components/layout/sidebar.tsx`, `package.json` or the `clients` table.

**Known quirk (accepted, no shared edit):** the team sidebar opens tool links in a new tab (`components/layout/sidebar.tsx:964-973`).
The hub itself renders in-app, because `/tools/new-business` shows `TeamSidebar` for slug `new-business` (`sidebar.tsx:75-87`),
and with the `TEAMS` entry it reads "New Business" (`:924-925`).

## 5. The report page (AIVx design)

One HTML document. `<head>` follows `aivx:renderer.py:2530-2541` exactly, except: title `AI Visibility Snapshot: {brand} | Avenue Z`;
no canonical link; no `report-editor.css` or `report-editor.js`; the Plotly tag gains `integrity="sha384-DPvk2KODrsA0CfBr4HTwAwhdDROPqqK2PvSSswJMQMpnUkwSTg4gLBxXc3wv2e5L"` (Subresource Integrity, measured 2026-10-08), invisible on the page; `<meta name="robots" content="noindex,nofollow">`; the `<meta name="description">` at `aivx:renderer.py:2538` reads `AI Visibility Snapshot for {brand}. Powered by Avenue Z AEO Intelligence.` The body is
`.sidebar` plus `.main`, as at `aivx:renderer.py:2542-2554`. Sections in order, each mapped to an existing AIVx block:

| # | Ryan's section | AIVx block (builder) | Content |
|---|---|---|---|
| 0 | (navigation) | `.sidebar` (`:1379-1411`) | `.aivx-brand` "AIVx", `.powered` "Powered by Avenue Z", `.sidebar-industry` "AI Visibility Snapshot" with `<span>{brand}</span>`, nav `01 Headline signal` (#headline), `02 {first section title}` (#category-data), `03 {second section title}` (#competitive-visibility), `04 Opportunities` (#opportunities), `05 Methodology` (#methodology), the share button and the `avenuez.com` link, as-is. Rows 2 and 5-9 carry those ids; rows 5, 6, 8 and 9 are `section.section[id]`, which the scroll-spy selects (`aivx:renderer.py:1320`). |
| 1 | Brand header | `.hero` (`:1414-1467`) | `.hero-series` "AI Visibility Snapshot"; `h1.hero-industry` = `<span class="grad-text">{brand}</span>`, with the 72px rule for names over 24 characters (`:1439-1458`); `.hero-subtitle` = `Category: {category} · Market: {market} · Data window: {start} to {end}`, dates as `Oct 1, 2026` from the UTC calendar days Peec returns (`aivx:lib/peec-client.ts:249-250`). |
| 2 | Headline signal | `.exec-summary` (`:1470-1518`) | `.exec-label` "Headline signal"; `.exec-headline` = **headline** slot; `.exec-subheadline` = **summary** slot (one sentence). |
| 3 | Metric strip | `.kpi-strip` with 4 `.kpi-card` (`:1593-1610` markup, CSS `:485-539`) | AI visibility · AI share of voice · Average answer position · Competitive rank (§7). |
| 4 | Competitive context | `.insight-box` (CSS `:862-877`, usage `:2215-2219`) | **context** slot. After escaping, the renderer wraps exact matches of roster brand names (step 2) in `<strong>`, longest name first. Ryan types plain text; bolding is automatic. |
| 5 | First data section (strengths) | `section.section` + `.section-label` / `h2.section-title` (`:1582-1584`), `.two-col` (`:2241`) | Title from §13 question 1 (default "Category data"). Left: `.insight-box` with a `<ul>` styled exactly as `:2313`, holding **competitive_bullets** (2-3 strengths). Right: `.chart-wrap` + `.chart-title` "Domain Types" + source-type donut (§7). Placement follows Thomas Stern's C5 (charts swapped to match the bullets). |
| 6 | Second data section (gaps) | same layout | Title from §13 question 1 (default "Competitive visibility"). Left: **sources_bullets** (2-3 gaps). Right: `.chart-wrap` "Competitive Visibility" (C5) + brand visibility bar chart (§7, `build_leaderboard_chart` style). |
| 7 | Why it matters | `.rec-global-bottom-line` (`:2382-2392`, same inline styles) | Title "Why it matters"; **why** slot. |
| 8 | Three opportunities to explore | `.leaderboard` table inside `.leaderboard-wrap` (`:2223-2240`) | Headers `Signal` · `Opportunity to explore` · `Likely workstream`; 3 rows of **opportunities**; then `.chart-takeaway` with the fixed line "These are opportunity hypotheses for discussion, not a full roadmap." |
| 9 | Methodology and next step | `.method-note` (CSS `:1176-1187`, usage `:2322`) | `<strong>Methodology:</strong>` **methodology** slot, then `<strong>Next step:</strong>` **next_step** slot. |
| 10 | Footer | `.footer` (`:2464-2498`) | Same markup. Series label "AI VISIBILITY SNAPSHOT"; `{brand}<br>Prepared {date}`, where date is the approval date in the frozen HTML and the generation date in a draft (US Eastern, `Oct 1, 2026`); the disclaimer says the data is a Peec snapshot for the stated window and is directional. |

Each bullet is `<li><strong>{lead}</strong> {text}</li>`. **Section contents follow Ryan's skill (§13 question 1 covers only the titles):** row 5 holds 2-3 validated **strengths** and row 6 holds 2-3 **gaps** (visibility losses, domain gaps, source mix), with no strength repeated (his skill, Category data and Sources data). The slot names `competitive_bullets` and `sources_bullets` keep that order: first section, then second. The titles and the brand chart's metric are pending §13 questions 1 and 2.

**Escaping:** every string that reaches the HTML is escaped on render (`& < > " '`, as in `aivx:renderer.py:15` `esc`). That
covers slots and also every Peec-sourced string: brand, competitor and domain names, classification labels, action titles
and the project name. Plotly figures are embedded as `JSON.stringify(figure)` with every `<` written as `\u003c`. Python's
Plotly output does the same, which you can see in the reference report's figure JSON (`\u003cb\u003e` in the SOV
`hovertemplate`). That stops any text from closing the `<script>`. Plotly also reads its own tags (`<b>`, `<br>`) inside labels, so every Peec string placed in figure text (labels, the centre annotation) has `<` and `>` removed first. Together, no Peec or model text can inject markup.

### 5a. Where every data point on the page comes from

Every element of Ryan's example page, in page order, with its source. "Q" points to the §13 question that settles it.
Peec calls are the §7 steps, run over one window.

| # | Page element | Source | Field or rule | Matches his example? |
|---|---|---|---|---|
| 1 | Brand name | Peec `GET /brands` | `name` where `is_own` | Yes |
| 2 | Report title | Fixed text | "AI Visibility Snapshot" | Yes |
| 3 | Category | Peec `GET /project-profile` | `profile.industry` | No, Peec's is broad. Q3 |
| 4 | Market | Peec `GET /project-profile` | `profile.target_markets[].location` | Yes |
| 5 | Data window | Computed | first and last day with retrievals (§7 step 4) | Yes |
| 6 | Headline and summary sentence | Glean, from the Data block | §6 | n/a (written) |
| 7 | AI visibility | Peec `POST /reports/brands` | own `visibility` × 100, 1 decimal | Exact |
| 8 | AI share of voice | same | own `share_of_voice` × 100, 1 decimal | Exact |
| 9 | Average answer position | same | own `position`, 1 decimal | Exact |
| 10 | Competitive rank | Computed from the same report | sort by visibility; denominator = every tracked brand | Rank yes; denominator no. Q2 |
| 11 | Competitive context (leaders' visibility and share of voice, who ranks below) | Same report, written by Glean | top rows of the sorted report | Yes |
| 12 | Brand chart | Same report | `visibility` for every tracked brand | Yes (his chart is visibility). Bar chart (§13 decided) |
| 13 | Strength: category position | Same report | rank and own metrics | Yes |
| 14 | Strength: own site's retrievals | Peec `POST /reports/domains` | `retrieved_chat_count` on the own brand's domains (`GET /brands` `domains[]`) | Exact |
| 15 | Strength: "used as a source in N% of answers" | same | `retrieved_percentage` on the own domain | Within 1 point (§13 decided) |
| 16 | Change over time ("up N points") | Needs a second, earlier window | not available for pitch projects (about a week of data) | No (§13 decided) |
| 17 | Gap: leadership gap in points | Computed from the brands report | competitor minus own, exact values | Yes (his were from rounded figures) |
| 18 | Gap: competitor domain gaps | Computed from the domains report | §7 step 7, ranked by `retrieved_chat_count` | No. His figures aren't in the feed. Q4 |
| 19 | Gap: domain mix (Corporate, Institutional, Editorial, UGC %) | Peec `POST /reports/domains` | share of `retrieval_count` by `classification` | Within 1 point |
| 20 | Source-type chart | same | same as row 19 | Within 1 point |
| 21 | Why it matters | Glean, from the Data block | §6 | n/a (written) |
| 22 | Opportunities: signal, opportunity, workstream | Glean; Peec-sourced rows from `POST /actions/list` (`SEO_ISSUE` and other types) | §7 step 8 | His "Peec recommends" items exist with matching titles. Q5 |
| 23 | "These are opportunity hypotheses..." | Fixed text | | Yes |
| 24 | Methodology | Glean, from window, brand count, prompt count (`GET /prompts` `total_count`) and models seen (`model_channel` ids) | §6 | His said these were "not visible"; the feed has them. Q6 |
| 25 | Next step | Glean or fixed text | | Q7 |
| 26 | Look: banner, fonts, colours, cards, charts, footer | AIVx, copied verbatim | §3, §5 | Design |

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
every key present, every value a non-empty string within the §9a length limits (1,000 characters, 80 for a `lead`), counts in range. So every generated value can also be saved by the editor.

**Grounding check** (`lib/aeo-outbound/grounding.ts`, modeled on `content-impact-synopsis.ts:58-100`): every number in the
copy must equal a number in the Data block after formatting. A number is a match of `\d[\d,]*(\.\d+)?%?` (with an optional leading `#`). Exempt: digits inside a roster brand name or a Data-block domain, and the years of the data window. Spelled-out numbers are not checked. The check reruns on every save, so the notes panel always describes the current copy. On a parse, shape or grounding failure it retries once with
the violations quoted back (`:216-218`). It stops at 2 attempts (`:203`).
- If **shape** still fails, the snapshot is marked *Failed*.
- If only **grounding** still fails, it saves as *Draft* with each violation listed in the notes panel. Ryan fixes or keeps the number.

**Retrieval (measured in T3, 2026-10-08):** by default Glean chat **does** search company documents. Asked who Ryan is,
it answered from internal sources, and its reply carried `querySuggestion`, `structuredResults` and `action` fragments.
With the prompt rule "Use ONLY the Data section. Do not search company documents, Slack, email or any other source",
neither probe showed any of those fragments, and the full generation call didn't either. A prompt rule is not a guarantee,
so the tool enforces it:
- This tool makes its own chat call in `lib/aeo-outbound/glean.ts`, built from the exported `GLEAN_BASE_URL` and `getGleanHeaders` (`lib/glean.ts:6-18`), with the same body as `gleanChat` (`:54-65`). It needs its own call because `gleanChat` returns only the text (`:39-100`), and the check below needs the raw messages. `lib/glean.ts` is not changed.
- **Search guard:** if any message carries a `querySuggestion`, `structuredResults` or `action` fragment, or any citation, the attempt counts as a violation. It retries once with the rule restated. A second violation fails the snapshot with "Copy generation used outside sources. Rerun."
- The answer is taken from the last `GLEAN_AI` message of `messageType: CONTENT`, not the longest one. In probe B, the longest-message rule `gleanChat` uses (`:86-94`) picked a heading ("Clarifying data constraints") instead of the short answer. For long JSON output it picked correctly. The JSON parse and shape check (above) still guard both cases.

The **domain check** flags any domain-like token (`word.tld`) in the copy that isn't in the Data block.

`category` and `market` are not written by the model. They come from `/project-profile` (§7). When missing they read
`Needs validation` and are editable slots.

## 7. Data: calls, fields and math

Env: `PEEC_AI_CUSTOMER_TOKEN` (`.env.example:48`), sent as `x-api-key` (docs: authentication page). Every report call
carries `project_id`, `start_date` and `end_date` from step 4. No model filter: all models, per Ryan's skill, whose QA gate treats incomplete model coverage as a problem.
T3 confirmed that leaving out the filter returns every model: the unfiltered brands report held `openai-0`, `google-0` and `google-2` rows. If a ChatGPT-only view is ever wanted, the filter would be AIVx's exact one, `{field:"model_id", operator:"in", values:["chatgpt-scraper"]}` (`aivx:lib/peec-client.ts:26,218`), for number parity with AIVx, even though the docs mark `model_id` deprecated.

| Step | Call | Fields used | Rule |
|---|---|---|---|
| 1 | `GET /projects`, paged | `id`, `name`, `status` (enum includes `PITCH`, `PITCH_ENDED`; list-projects page) | Only `PITCH` and `PITCH_ENDED` projects are listed and accepted, so a customer project can never go out on a public link. Resolved by **id** from the dropdown, so there is no name guessing. |
| 2 | `GET /brands?project_id`, paged | `id`, `name`, `is_own`, `domains[]` (list-brands page) | Exactly one `is_own`, or fail (`aivx:lib/peec-client.ts:169-176`). Every other brand is a competitor. |
| 3 | `GET /project-profile?project_id` | `profile.industry` → category; `profile.target_markets[].location` joined → market (get-project-profile page) | `profile: null` → both `Needs validation`. |
| 4 | `POST /reports/domains`, `dimensions:["date"]`, 400-day discovery | `date`, `retrieved_chat_count` | Window = min/max date with retrievals > 0 (`aivx:lib/peec-client.ts:195-248`). No such day → fail. |
| 5 | `POST /reports/brands`, no dimensions, paged | `brand.id`, `brand.name`, `visibility` (0-1), `share_of_voice` (0-1), `position` (lower is better) | Own row must exist, or fail. |
| 6 | `POST /reports/domains`, no dimensions, paged | `domain`, `classification`, `retrieved_chat_count`, `mentioned_brands` | `sum(retrieved_chat_count) > 0`, or fail (`aivx:peec_api_export.py:356-360`). |
| 7 | No call. Computed from step-6 rows. | `domain`, `retrieved_chat_count`, `mentioned_brands[].id` | Competitor domain gap = a row whose `mentioned_brands` holds no own-brand id and at least one competitor id. The top 4 by `retrieved_chat_count` feed the Data block. The Peec docs list a `gap` filter but don't define it, so it isn't used. T3 confirmed that a domain row's `mentioned_brands` equals the union of its URL rows' `mentioned_brands` (3 of 3 checked), and the computed gap set was a strict subset of Peec's `gap` filter result (217 of 224 domains, none outside it). |
| 8 | `POST /actions/list`, one unpaged call, `limit 50`, default `order_by` `impact` desc (list-actions page); also one unpaged `GET /model-channels` for model names, as AIVx does (`aivx:agent/agent.py:1125-1138`) | `title`, `impact` (enum string `VERY_LOW` to `VERY_HIGH`), `type`, `status`; channel `description` | Only `status = PENDING`, first 10. Both calls are non-fatal: a failure leaves no actions (with a note) or falls back to channel ids. Feeds the opportunities (how many of the three come from Peec is question 5, §13; Ryan's example "Peec recommends" items are `SEO_ISSUE` actions). `/actions/list` takes no date window, so the Data block labels them as current Peec actions. An empty list is fine. |

**Formatting and metrics** (stated here as the rounding convention Ryan's skill requires):
- **AI visibility** = `round(visibility × 100, 1)%`. **AI share of voice** = `round(share_of_voice × 100, 1)%`. Same rule as `aivx:agent/agent.py:1312-1314`.
- **Average answer position** = `#` + `position` to 1 decimal.
- **Nulls:** Peec requires only `brand`, `mention_count`, `visibility`, `visibility_count` and `visibility_total` on a brands-report row; `share_of_voice` and `position` may be absent (confirmed live in T3: across 12 pitch projects `position` was missing on up to 25 of 52 brands, always brands with zero visibility; `share_of_voice` was present on every row and summed to exactly 1.0 in every project, which is what the SOV donut's "All Other Brands" remainder relies on). The dashboard's own row type treats both as required (`lib/peec/client.ts:81,85`), another reason not to reuse it. AIVx keeps those as None (`aivx:agent/agent.py:1312-1316`). Ryan's rule applies: "Use exactly four metric labels when four are validated; otherwise use three and mark any missing metric internally" (his skill, Metric strip). A missing SOV or position drops that card, leaving three, with a notes-panel entry. Because AIVx's `.kpi-strip` is a fixed 4-column grid (`aivx:renderer.py:485-487`) and the stylesheet stays byte-identical, the 3-card strip carries an inline `style="grid-template-columns:repeat(3, 1fr)"`, the same inline-override pattern AIVx uses for its long hero names (`aivx:renderer.py:1458`). A missing value is left out of the Data block. 
- **Competitive rank** = `#{i} of {n} brands`, where rows are sorted by `(-visibility, brand.id)` (`aivx:peec_api_transform.py:98-109`) and `n` = rows returned in step 5.
- **Rounding:** Python's `round` is half-to-even (the AIVx rule above). The TS port uses the same half-to-even rule, with a test on a `.x5` value.
- **Brand visibility bar chart** = `build_leaderboard_chart` styling (`aivx:agent.py:2634-2694`): horizontal bars, top 10 brands by visibility (first 20 rows, then sorted, as at `:2640-2644`), colours by bar position from `CITATION_BAR_COLORS` (`:39-44`), outside labels `#A6A6A6` size 11, `bargap` 0.38, height `max(420, n*38)`. Values are visibility %, so the hover reads `Visibility: %{x}%` and the bar labels carry `%`. These are the only differences from the AIVx builder, which plots citation counts. (Replaces the SOV donut: Ryan's chart is visibility, which doesn't sum to 100%, §13 decided.)
- **Source-type donut** = `build_earned_breakdown_chart` (`aivx:agent.py:2721-2763`) over step-6 rows grouped by `title_classification` (`aivx:peec_api_transform.py:15-32`, `OWN`→`You`) and weighted by `retrieval_count`, which matches Peec's own dashboard per the example probe (§12), slices in descending order of that weight then label. The look stays AIVx's. All classifications, per Ryan's "use classifications exactly as returned".
- **Data block for Glean:** the 4 KPIs; the top 5 brands with visibility and SOV; the own domain's `retrieved_chat_count`; source-type percentages; competitor gap domains; Peec action titles with impact; window; category; market.

**Guards** (fail the generation with a named reason, ported from `aivx:peec_api_export.py:326-389`):
- empty brands report
- not exactly one own brand
- zero total retrievals
- a repeated row across pages
- past the row cap of 250,000 rows per endpoint (`aivx:peec_api_export.py:81`)

AIVx's UPPERCASE classification guard is not ported. It protects AIVx's donut exclusion policy, which doesn't apply when every type is shown, as Ryan's rule requires. Custom classification names display verbatim.
- HTTP errors after retries

Messages never include the key (`aivx:lib/peec-client.ts:91-93` scrub).

### 7a. Generate request and time budget

- **Request:** `POST /api/aeo-outbound/generate`, JSON `{ projectId: string, rerunOf?: uuid }`. Generate and Rerun both use it; Rerun sends the original row's project and id. The server:
  1. checks staff plus the allowlist, else 403
  2. re-checks that `projectId` is in `GET /projects` for this key with status `PITCH` or `PITCH_ENDED`, else 400 (AIVx does the same check, `aivx:lib/peec-client.ts:162-165`). If Peec itself fails here: `502 { error }`, no row created
  3. refuses with `409 { error: 'already-generating', id }` if a row for that project is `generating` and younger than 6 minutes. A partial unique index on `(peec_project_id) WHERE status = 'generating'` makes a double-click race impossible: the second insert fails and returns the same 409
  4. inserts the row, then runs steps 1-8 and §6 **inside the request**
  5. responds `200 { id, status: 'draft' | 'failed', error? }`
- **What the hub and editor do with each response:** `200 draft` opens the new draft. `200 failed` shows the reason on the row. `400` shows "This Peec project can't be used". `403` shows the access message. `409` opens the snapshot that is already generating. `502` shows "Peec is unavailable. Try again". A dropped connection or `5xx` shows "Lost connection. Refreshing" and refreshes, so the row's real status shows.

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
  "This tool is limited to the New Business team" to other staff. API routes return 403. Actions return
  `{ ok: false, error: 'forbidden' }` (the repo's precedent, `app/actions/chart-notes.test.ts`) and write nothing.
- **Token:** `randomBytes(18).toString('base64url')` (144 bits), minted at Approve, unique, never reused.
- **Public route `/snapshot/{token}`:** looks up the token in a status `approved` row with `share_revoked_at IS NULL` and
  `deleted_at IS NULL`. It returns the stored HTML byte for byte with these headers:
  - `Content-Type: text/html; charset=utf-8`
  - `Cache-Control: no-store`, so a revoke takes effect on the next load
  - `X-Robots-Tag: noindex, nofollow`
  - `Referrer-Policy: no-referrer`
  - `X-Frame-Options: DENY`
  - `Content-Security-Policy: sandbox allow-scripts`, so even Ryan opening his own live link while signed in runs it with no access to his session

  Unknown, revoked and discarded tokens all get the same 404 page (one static line, no app chrome), so a probe learns nothing.
- **Recording an open:** after a live lookup, a `GET` (not `HEAD`) runs one conditional UPDATE on that row:
  `open_count + 1`, `first_opened_at` set if null, `last_opened_at = now()`, matching the same live conditions. It is not
  counted when:
  - the request carries an Auth.js session cookie (any cookie matching `/^(__Secure-)?authjs\.session-token(\.\d+)?$/`,
    the pattern at `app/api/export/pdf/route.ts:21`), so Ryan checking his own link doesn't count. Only the cookie's
    presence is checked, with no session lookup; a forged cookie can only suppress a count.
  - the `User-Agent` contains (case-insensitive) `slackbot`, `facebookexternalhit`, `twitterbot`, `linkedinbot`,
    `discordbot`, `whatsapp`, `telegrambot`, `skypeuripreview`, `googlebot` or `bingbot`, so a link preview in a chat
    app doesn't look like an open. Email security scanners can still register one, and the hub says so.

  The UPDATE is awaited with a 1.5s cap, before the response. A database error or the cap firing is logged with the
  report id (never the token or the recipient), and the page is still served byte for byte; a slow database can't
  hold the page. Who the link is for is Ryan's label: nothing enforces it, because a link with no login can always be
  forwarded.
- **What the recipient can reach:** only that document. The links in it are `#section` anchors, `avenuez.com`, and the
  share button, which copies the current URL (`aivx:renderer.py:2557-2614`, toast element plus script, minus the canonical tag). It has no
  link into the app, no data request, and no script from our origin.
- **Writes from the browser** (`POST /generate`, `PATCH /slots`, server actions) are refused with 403 when an `Origin` header is present and its host isn't the request's own `Host`. Comparing to the request's host, not `APP_URL`, keeps Vercel preview deployments working; an attacker's page can't make a victim's browser send a matching Origin.
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
| `share_recipient` | text | Who the link is for, set at Approve (same cleaning as a slot value, 1 to 200 characters). |
| `open_count` | integer not null default 0 | Opens of the live link (§8). |
| `first_opened_at`, `last_opened_at` | timestamptz | |
| `rerun_of` | uuid | Lineage. |
| `created_by`, `approved_by`, `revoked_by`, `deleted_by` | text | Emails. |
| `created_at`, `updated_at`, `approved_at`, `share_revoked_at`, `deleted_at` | timestamptz | |

Checks:
- `status='approved'` ⇔ `html IS NOT NULL AND share_token IS NOT NULL AND approved_at IS NOT NULL AND share_recipient IS NOT NULL`
- `share_revoked_at IS NULL OR status='approved'`
- `deleted_at IS NULL OR status IN ('draft','failed')`
- Partial unique index `aeo_outbound_one_generating` on `(peec_project_id) WHERE status = 'generating'` (§7a).

**Transitions (all single conditional UPDATEs with `.returning()`, as at `app/actions/commentary.ts:17-37`):**
- generate: insert `generating`, then update to `draft` with data, slots and notes, or to `failed` with an error.
Every UPDATE below also matches `deleted_at IS NULL`, so a stale tab can't save into, approve or revoke a discarded row
(the race documented at `app/actions/commentary.ts:23-27`).
- save slot: `WHERE id AND status='draft' AND revision=$shown` → `revision+1`. 0 rows → 409, and the editor shows "This snapshot changed elsewhere. Reload."
- approve: `WHERE id AND status='draft' AND revision=$shown AND no slot contains 'Needs validation'` → sets html (rendered from the stored data and slots), token, recipient and approved fields. One-way: no transition leaves `approved`.
- revoke: `WHERE id AND status='approved' AND share_revoked_at IS NULL`. One-way.
- record open: `WHERE share_token=$token AND status='approved' AND share_revoked_at IS NULL AND deleted_at IS NULL` (§8).
- copy as draft: one `INSERT … SELECT` from the source row `WHERE id AND status='approved' AND deleted_at IS NULL` (live
  or revoked). The new row is `draft` with the source's project, brand, data, slots and notes, `revision 0`,
  `rerun_of` = the source id and `created_by` = the caller. No row matched → `not found`. The source is never written.
- **Hub listing:** only the columns the hub shows (never `data`, `slots`, `notes` or `html`): every live row whatever its
  age, plus the newest 500 other rows not discarded. A live link therefore can't drop off the hub, so it can always be revoked.
- discard: `WHERE id AND (status IN ('draft','failed') OR (status='generating' AND created_at < now() - interval '6 minutes'))`. Sets `status='failed'` where it was `generating`, plus `deleted_at` and `deleted_by`.
- rerun: the same `POST /generate` with `rerunOf` set (§7a). The new row stores `rerun_of`; the original is untouched. The editor's and hub's Rerun buttons open the new draft when it's ready.
- **Stale:** a `generating` row older than 6 minutes (300s `maxDuration` plus margin) displays as *Failed (timed out)*. It allows Rerun and Discard, like a failed row. No cron.

### 9a. Autosave contract

- **Request:** `PATCH /api/aeo-outbound/reports/{id}/slots`, JSON `{ path, value, revision }`.
  - `path` is one of a closed list: `headline`, `summary`, `context`, `why`, `methodology`, `next_step`, `category`,
    `market`, `competitive_bullets.{i}.lead|text`, `sources_bullets.{i}.lead|text`,
    `opportunities.{i}.signal|opportunity|workstream`, where `{i}` must index an item that exists in the stored slots.
  - `value` is a string, trimmed, control characters removed, runs of whitespace collapsed to one space (T2 showed an inline edit at a line wrap can leave a double space), 1 to 1,000 characters (`lead` up to 80). Empty isn't allowed.
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
  - The iframe posts `{type:'dirty', path}` on the first keystroke in a field and `{type:'edit', path, value}` after the 800ms debounce, and it answers a `{type:'flush'}` from the parent by sending every pending edit at once. A field stays dirty until an edit sent after its last keystroke is saved. The parent checks that `event.source` is its own iframe's `contentWindow`. It can't check the origin, because a sandboxed iframe's origin is `null`.
  - The parent keeps one queue. It holds the latest value per path, sends one PATCH at a time, and carries the revision each 200 returned into the next request. So two quick edits in one tab never conflict with each other.
  - The parent tracks `dirty` (an edit not yet saved) and `saving`. **Approve is disabled while either is true**, the confirm dialog re-checks both before sending, and it always sends the last saved revision. What gets approved is exactly what Ryan sees.
  - **Errors:** a network error or `5xx` retries with backoff (1s, 2s, 4s, then every 10s), showing "Couldn't save, retrying". A `400` shows its reason next to the toolbar, keeps the edit dirty, and waits for Ryan to change the text. A `403`, `404` or `409` stops the queue and shows "This snapshot changed. Reload" with a Reload button. Nothing loops forever.

The migration is one new table (open-tracking columns included), so no existing query selects it. The `clients` 42703 risk described in
`MIGRATIONS-PENDING.md` doesn't apply. Apply it with the hash-checked `scripts/migrate-http.ts` and record it in
`MIGRATIONS-PENDING.md`.

## 10. UI

Dashboard look (dark, `globals.css` tokens, the same card classes as `app/tools/reporting/page.tsx:7-8`), apart from the
iframe, which is pure AIVx.

- **Hub:** a header "AEO Outbound Snapshot", then a "New snapshot" bar (project dropdown + **Generate**), then a table:
  Brand · Peec project · Status · Created · Approved · For · Opens · Actions. **Opens** shows the count, with first
  and last opened on hover and the line "Email security scanners can count as an open".
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
  | Live | Open, Copy link, Revoke, Edit a copy, Rerun |
  | Revoked | Open, Edit a copy, Rerun |
  | Failed | Rerun, Discard |

  Approve exists only in the editor, so a report can't be approved unseen.
- **Editor:** a sticky toolbar showing:
  - Back
  - brand
  - status pill
  - save state ("Saving…" / "Saved" / "Couldn't save, retrying")
  - **Approve** (draft only; disabled with a tooltip while any `Needs validation` remains or while an edit is unsaved or saving, §9a)
  - **Copy link** and **Revoke** (Live)
  - **Edit a copy** (Live or Revoked), which opens the new draft
  - **Rerun**
  - **Notes** (toggles the drawer)
  - **Open full size** (the same HTML in a new tab)

  Below the toolbar the iframe takes the full content width. The content width is the smaller of two values
  (`app/tools/layout.tsx:23`):
  - `max-w-7xl` minus `px-8`, which is 1216px
  - the viewport minus the 256px expanded sidebar (`w-64`, `components/layout/sidebar.tsx:931`) and the 64px padding

  For any viewport about 1,236px or wider (allowing 15px for a visible scrollbar on `overflow-y-auto`, `app/tools/layout.tsx:22`) that is above AIVx's 900px breakpoint (`aivx:renderer.py:1297-1300`), so the desktop
  layout shows, with sidebar and two columns. On a narrower window, **Open full size** shows the desktop layout. The **Notes** panel (missing inputs, grounding and domain
  flags, window used, model scope, rank basis, Peec project id) is a drawer over the iframe and never narrows it.
- **Editing inside the iframe:** in draft view only, each slot element carries `data-slot="{path}"` and
  `contenteditable="plaintext-only"`, with a 1px dashed outline on hover. A small inline script debounces 800ms and posts
  `{type:'edit', path, value}` to the parent (§9a). Pasting keeps text only. The frozen HTML contains none of this: no
  `data-slot`, no `contenteditable`, no editor script.
- **Share button in the draft view is hidden.** Inside the `srcdoc` iframe the page's own address is a placeholder, not
  the real link, so AIVx's button would copy the wrong thing. The toolbar's **Copy link** is the only copy action in the
  editor. On the public link the AIVx button works as-is (verified in T2 under the sandbox CSP).
- **Confirm dialogs:** Approve (with the required "Who is this for?" field), Revoke and Discard.

## 11. AI-output review (before client delivery)

- **Reviewer:** Ryan Cadigan, as the only allowlisted user, approves every snapshot before a link exists. There is no
  path from generation to a public link without Approve.
- **Checks he makes:** the notes panel (missing inputs, number mismatches), accuracy of claims against the KPIs and
  charts on the page, tone. The page carries no AI-assistance line (my decision, §13).
- **Record:** `approved_by`, `approved_at` and `revision` on the row. The frozen `html` is the exact approved version.
  `revoked_by` and `share_revoked_at` record withdrawal.

## 12. Scratch trials (before the plan; each ≤ 30 min, throwaway, my nod first)

- **T1 Fonts:** does Avenir load from `avenuez.com` (`aivx:renderer.py:171-175`) when the page is served from the dashboard domain, and also inside the sandboxed `srcdoc` iframe and under the `sandbox` CSP header (both have an opaque origin)? (**UNVERIFIED**: cross-origin font headers.) If not, the fallback is to self-host the same woff2 files under `public/`, which needs a licence check.
- **T2 Chart parity:** run `build_sov_donut` and `build_earned_breakdown_chart` at `ff18697` on synthetic inputs, save their figure JSON as golden fixtures, and show a side-by-side screenshot of our page next to the reference report. Also confirm the page renders, charts included, in `<iframe sandbox="allow-scripts" srcdoc>` and under the `Content-Security-Policy: sandbox allow-scripts` header (§8), and that the share button's copy works there (the AIVx script falls back to `execCommand`, `aivx:renderer.py:2557-2614`).
- **T3 Live checks:** a read-only pull of one PITCH project (steps 1-8) plus one Glean call. No writes. It confirms:
  - the total time against the 270s deadline
  - the §7 field names on real responses
  - that no model filter returns every model's chats
  - that `share_of_voice` and `position` can be missing on a brands-report row
  - the `/actions/list` status values that mean finished
  - what `mentioned_brands` on a domain row means: own-brand-absent rows checked against `/reports/urls` for the same domain
  - whether Glean chat pulls in company documents, using a probe prompt answerable only from internal docs
  - whether the generate function finishes after the browser tab closes

**T3 results (Peec half, 2026-10-08, read-only):**
- 24 calls, all HTTP 200, 16.1s end to end, against the 270s deadline.
- Field names in §7 confirmed on real responses.
- A pitch project's data window was a single day, matching Ryan's "instant snapshot" note.
- Glean half: the default probe searched company docs, the instructed probe and the generation did not; generation took 14.8s and returned valid JSON with every slot, 3 opportunities and no em dashes. End to end, Peec plus one Glean attempt is about 31s against the 270s deadline.
- T1 and T2 haven't run yet.

**T1 and T2 results (2026-10-08, local trial, synthetic data):**
- **Fonts (T1):** all five Avenir files send `Access-Control-Allow-Origin: *`. In a browser, every weight the page uses loaded in all three modes: the top-level page (as served from our domain), the sandboxed `srcdoc` iframe, and the page under `Content-Security-Policy: sandbox allow-scripts`. In both sandboxed modes the origin was `null`, and cookies and storage were blocked (`SecurityError`).
- **Charts (T2):** AIVx's own `build_sov_donut` and `build_earned_breakdown_chart`, run verbatim with plotly 6.9.0 (inside the `>=6.8,<7` pin), produced figures identical to the published reference report in every non-data property: template, config, layout keys and values, trace style, marker colours and lines, fonts. These outputs become the golden fixtures for the TS port.
- **Plotly label HTML:** Plotly rendered `<b>` as bold and `<a>` as a real link element. It dropped a `javascript:` URL on its own, but formatting injection works, so the §5 rule (strip `<` and `>` from Peec text in figures) is required.
- **Inline editing in the sandbox:** the first keystroke posted `dirty` to the parent at once, and the debounced `edit` message carried the full text.
- **Share button:** on the CSP-sandboxed page it copied the real URL ("Link copied to clipboard"). In the `srcdoc` iframe it would copy a placeholder address, hence it is hidden in the draft view (§10).
- **Hero:** at the editor's 1216px iframe width the 96px brand name can wrap to two lines. AIVx behaves the same at that width.

**Example probe (2026-10-08, read-only):** Ryan's example page was rebuilt from the Peec data feed. His example brand is a
CUSTOMER project. A 30-day window reproduced his three headline metrics exactly (visibility, share of voice, position).
What maps and what doesn't:
- **Pullable, exact or near-exact:** the KPIs; competitor visibility and share of voice; the rank order; his brand chart, which is **visibility** for every tracked brand; his own-domain "retrievals" (`retrieved_chat_count`); market; prompt count; models; and every "Peec recommends" item, which are `SEO_ISSUE` actions in `/actions/list` with matching titles.
- **Source mix:** Peec's dashboard figures match a `retrieval_count` weighting (within 1 point), not AIVx's `retrieved_chat_count` weighting (`aivx:agent.py:664-789`). **Decision for me:** weight by `retrieval_count` so the chart matches what Ryan sees in Peec. The chart's look stays AIVx's.
- **Not in the data feed:** his competitor "gap" figures. No field, window or filter reproduced their values or their order (question 4).
- **Not possible for pitch projects:** period-over-period change ("up 8.7 points"), since pitch projects hold about a week of data (not shown, decided in §13).
- **Different from his page:** the rank denominator (his page showed 7 brands; the project tracks 12, question 2) and the category (Peec's `industry` is broad, question 3).
- His leadership-gap points were computed from rounded figures. The tool uses exact values, so they can differ by a few tenths.

## 13. Open questions (sent to Ryan 2026-10-08)

His own material already answers the data window, model coverage, source types, the headline (his comment C3), the
section order (strengths, then gaps) and the no-recommendations fallback.

**Decided without asking** (low value to Ryan, one sensible answer):
- **Brand chart** (§5a row 12): his example's numbers are visibility, which don't add up to 100%. So it's an AIVx-style bar chart (`aivx:agent.py:2634` `build_leaderboard_chart`), not a pie.
- **"Used as a source"** (§5a row 15): Peec's `retrieved_percentage`.
- **Change over time** (§5a row 16): not shown, because pitch projects hold about a week of data.
- **Workstream labels** (§5a row 22): free text, guided by his skill's examples ("such as").
- **Page length:** a web page, so no one-page print limit.
- **AI-assistance line:** none on the report (my decision).

**Questions** (each settles a §5a row or an open rule). Every answer is one value in `lib/aeo-outbound/config.ts`
`DECISIONS`, with no other code change: Q2 is `rankAmong` (null for every tracked brand, or N for the brand and its
N - 1 most visible competitors), Q4 is `competitorSiteGaps`, and the source-mix weighting (my call) is `sourceMixWeight`.
1. (§5 rows 5-6) Title the two middle sections "Category data" and "Competitive visibility" (Thomas S's wording), instead of your skill's "Category data" and "Sources data"?
2. (§5a row 10) Rank the brand against every competitor tracked in Peec, not only the top 7 shown on the dashboard? (The spec assumes Yes.)
3. (§5a row 3) Peec's category is broad. Should the tool write a more specific one from the data, like your example's?
4. (§5a row 18) Peec's competitor "gap" figures aren't in its data feed. OK to rank those sites by how often AI used them instead?
5. (§5a row 22) When Peec has recommendations, should exactly one of the three opportunities come from them, like your example?
6. (§5a row 24) Should the methodology state the prompt count and the AI models covered (ChatGPT, Google AI Overviews, Perplexity)?
7. (§5a row 25) Use the same next-step sentence on every report, rather than one written for each brand?
8. (§9) Must every "Needs validation" be filled in before a report can be sent? (The spec assumes Yes.)
9. (§7 step 1) Allow only pitch projects, never customer ones? (The spec assumes Yes; his example used a customer project.)
10. (§5 row 0) For Thomas S: keep the "AIVx" name in the page's left menu?

## 14. Edge cases

| Case | Behaviour |
|---|---|
| Project has no `is_own` brand, or several | Failed: "Peec project needs exactly one own brand (found N)." |
| No profile | Category and market show `Needs validation`. Approve is blocked until edited. |
| Fewer than 10 brands | The bar chart shows every brand. Rank still reads `#i of n`. |
| Only the own brand is tracked (seen live in T3) | Generates, with a notes-panel flag "No competitors tracked in this Peec project". Per Ryan's rules ("Omit unsupported comparisons"; a rank only when the competitive set is complete), the Competitive rank card and the competitive context callout are left out, and the copy is told there are no competitors. Ryan decides whether to send. |
| No gap domains, no actions | The Data block says none. The prompt forbids inventing them. |
| Peec 429 | Retry per `X-RateLimit-Reset` clamped to 0-20s, max 3 attempts, then Failed. The 270s deadline caps it all (§7a). |
| Missing SOV or position for the brand | Each missing metric's card is left out (Ryan's rule), with a note (§7). Fewer than four cards switch the strip to that many columns inline. |
| Stale *Generating* row | Shows as Failed (timed out). Discard and Rerun work (§9). |
| Peec 5xx, timeout, non-JSON | Failed, with a scrubbed reason. |
| Glean down, or bad JSON twice | Failed: "Copy generation failed. Rerun." |
| Two tabs editing | Revision conflict 409, reload prompt. |
| Approve double-click | The second UPDATE matches 0 rows, so it's a no-op. |
| Revoke while recipient has the page open | Their open page stays. The next load is 404 (`no-store`). |
| Link pasted into Slack, iMessage, WhatsApp and similar | The preview bot's request is served but not counted (§8). |
| Email security scanner opens the link | Counted. The hub's hover says scanners can count. |
| Recording an open fails | Logged with the report id; the page is still served. |
| Typo found after Approve, or revoked by mistake | Edit a copy: a new draft with the same data and copy; approve it for a new link. |
| More than 500 snapshots | The hub lists every live link plus the newest 500 others. |
| Function killed mid-generate | Shows as Failed (timed out) after 6 minutes. Rerun works. |
| Non-allowlisted staff | Access message, 403, or `{ ok: false, error: 'forbidden' }` from actions. No data returned. |
| Brand name over 24 characters | 72px hero rule (`aivx:renderer.py:1439-1458`). |
| HTML in copy | Every slot is escaped on render (same as `aivx:renderer.py:15` `esc`). |

## 15. Tests (written before the code)

- **Unit:**
  - CSS and JS SHA-256 pins
  - metric math and rank tie-break
  - brand visibility bar and source donut figure JSON deep-equal to golden fixtures generated by AIVx's own builders (bar: every key except the hovertemplate and text format, which change from citations to visibility %)
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
  - approve sets the recipient; the approved check needs it
  - record open: the WHERE clause matches only a live row; first opened set once, last opened and the count every time
  - copy as draft: only from an approved row (live or revoked), copies data, slots and notes, `revision 0`, `rerun_of` set, source untouched
  - hub listing: no `data`, `slots`, `notes` or `html`; a live row older than the newest 500 is still listed
- **Routes:**
  - the public route returns the exact stored bytes and headers (including the CSP sandbox), and a byte-identical 404 for unknown, revoked and discarded tokens
  - the public route records an open for a live `GET`, not for `HEAD`, a listed preview bot, a request with a session cookie or a 404, and still serves the same bytes when recording throws or never resolves (the 1.5s cap)
  - approve refuses an empty or too-long recipient with its message and writes nothing; `copyAsDraft` returns `{ ok: true, id }` for an approved source, `forbidden` for non-allowlisted staff and `not found` for a draft, failed or discarded source, and writes nothing on a refusal
  - the regenerated `0026` contains the new columns and the four-condition approved check, and nothing outside the new table
  - projects, generate, view and slots routes return 403 without staff plus the allowlist
  - each server action (approve, revoke, discard) returns `forbidden` for non-allowlisted staff and writes nothing
  - a cross-origin `Origin` header gets 403 on generate, slots and actions
  - the view route sends `no-store` and `Content-Security-Policy: sandbox allow-scripts`, and 404 for unknown and discarded ids
  - the slots route covers the full §9a table: each path form, bad path 400, empty or too-long value 400, stale 409, not-draft 409
  - generate: unknown or non-pitch `projectId` 400, Peec failure at the re-check 502, a second generate for the same project 409 (also under a simulated race via the unique index), `rerunOf` stored and the original untouched, deadline → `failed` with the step named, shape failure → failed, grounding-only failure → draft with notes
  - projects route: Peec failure → 502
  - Peec client: at most 3 attempts on a 429, delay clamped to 0-20s; Glean second attempt only with 60s or more left
  - computed competitor gaps from `mentioned_brands`; half-to-even rounding on a `.x5` value; SOV donut pre-slices 15 rows
  - grounding: number regex, the exemptions, and recompute after a save
  - Glean search guard: a reply with `querySuggestion`, `structuredResults`, `action` or citations counts as a violation, retries once, then fails; the answer is the last `CONTENT` message
  - `profile: null` → `Needs validation` in category and market
- **Render:**
  - frozen HTML has no `data-slot`, no `contenteditable` and no editor script
  - `<head>` has noindex, no canonical link, the title format, and no `report-editor.*`
  - a Peec name containing `</script>` or `<b>` renders inert in the text, cannot close the figure `<script>`, and reaches Plotly labels with `<` and `>` removed
  - `?mode=preview` returns the HTML without editing hooks
  - roster brand names in `context` are bolded after escaping; the nav ids and `section[id]` markup match §5
  - each missing metric drops its KPI card, and the strip's inline column count matches the card count
- **Prompt:**
  - the Data block holds exactly the §7 values
  - the prompt contains the writing rules and the "use only the Data block" rule
  - the domain check flags an unknown domain
- **Editor and hub** (component tests):
  - messages from anything other than the iframe's `contentWindow` are ignored
  - the save queue sends one PATCH at a time and carries the returned revision forward; `dirty` is set on the first keystroke; 5xx retries with backoff; 400 shows the reason and keeps the edit; 403, 404 and 409 stop with the reload message
  - Approve is disabled while dirty, saving or any `Needs validation` remains, and the confirm re-checks
  - Rerun calls generate with `rerunOf` and opens the new draft; every §7a response maps to its message
  - the hub calls `router.refresh()` on mount, after actions, and every 5s while a row is generating
  - the status pill and actions per status match §10, including a stale generating row
  - a Peec failure in the project list shows the inline retry and the table still renders
- **Existing guards stay green:** `lib/auth/protected-pages.test.ts` (it walks the new pages), `proxy.test.ts`, `make check`.

## 16. Notes

- **Data contracts:** my `contract-core` standard is a Python library pinned via `pyproject.toml`, and this repo is
  TypeScript with no validator dependency (`package.json` has no zod or valibot). Boundary checks are the typed guards
  in §7, as `lib/peec` and AIVx do today.
- **Public repo:** this repo is public, so the copied AIVx stylesheet and markup become public. No client or prospect
  data is committed. Test fixtures are synthetic.
