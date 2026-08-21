# Renaissance Overview: design

**Asana:** Frankenstein the Executive Overview PDF mockup from pieces of the Ave Z dashboard and configure for the Ren dashboard

**Branch:** `Executive-Overview-Duplicate-Ren` off `dev` · **PR:** #207 (ready for review → dev)
**Wireframe:** `Executive Dashboard Demo.pdf`

**How to read this.** §§1-6 describe Renaissance's Overview page: what it shows, where its numbers come from, and how it behaves. §§7-9 are build mechanics: where each piece was copied from, how the page gets wired into the app, and how to verify it. §10 records decisions and known issues.

---

## 1. The page

Renaissance gets an Overview page: one screen, four blocks, matching the wireframe.

These four blocks already exist and work on Avenue Z's dashboard, spread across four separate tabs. **Avenue Z is the reference for what each block looks like and what it contains, and the source we copy from. That is its entire role here.** We open those files once to take copies, and after that this page has nothing to do with Avenue Z. Nothing we build touches their pages, their components or their data.

| Block | Contents | Data |
|---|---|---|
| Demand Journey | 4 linked cards across the funnel | Peec, GA4, CRM ×2 |
| Web Analytics | 8 KPI cards, 3 charts | GA4 |
| Contact Creation | contact pacing | CRM |
| Pipeline Performance | pipeline KPIs and breakdown by owner | CRM |

Renaissance has GA4 and Peec connected. Their CRM is Salesforce, this product integrates only HubSpot, and they may move to HubSpot at some point, so **the two CRM blocks and two of the four journey cards have no data source today**. Vendor names appear in this document because it explains why; they never appear on the page (§4). Those render an explicit needs-connection state rather than zeros. Zeros are the failure being avoided: a missing CRM identifier produces a plausible `$0` with no error, which reads as a client with no pipeline.

Contact Creation and Pipeline Performance above are narrower than Avenue Z's HubSpot version. That is a CRM-parity finding, not a build choice: `docs/superpowers/specs/2026-08-13-crm-parity-scorecard.md` on the Salesforce branch traced every metric against Renaissance's live Salesforce fields and found lead source blank on 99.99% of their records (replaced by a by-owner breakdown, which has a clean field of its own) and form quality with no field equivalent at all (dropped, confirmed gap). Both blocks render the needs-connection card on this page regardless (§4); the scorecard describes what the CRM follow-up PR fills in.

It becomes Renaissance's landing page, replacing AEO.

Roughly 80% of the code is transplanted from components already running elsewhere in this product. The new code is the orchestrator, the needs-connection treatment, and a card variant that lets an unconnected card sit in the journey row.

---

## 2. Block 1: Demand Journey

Four cards in a single flow row, laid out `flex-1`, with connectors between them.

| Card | Metric | Sub-metric | Source |
|---|---|---|---|
| AEO | AI Visibility | share of voice | Peec |
| Web Analytics | Site Sessions | conversion rate | GA4 |
| Inbound Funnel | Online Contacts | this week | CRM, not connected |
| Pipeline | Open Pipeline | open deal count | CRM, not connected |

**AI Visibility** is `(visibility_count / visibility_total) × 100` for the latest ISO week, from `getPeecOverview`. **Share of voice** is the mean of per-row `share_of_voice` for Renaissance's own brand. The brand is identified by `BrandRanking.isYou`, computed from `clients.peec_your_brand` (`lib/peec/client.ts:132`, `:381`, `:472`). The delta is week over week, from the last two entries of `weeklyVisibility`.

The Peec call uses `year_to_date`. That makes this card year-to-date while the other three are 30-day, which is why §5 puts a period label on the page.

**Site Sessions** is raw GA4 `sessions`; the sub-metric is GA4-native `sessionConversionRate` with no local arithmetic.

**Inbound Funnel's sub-metric is `this week`, not an ICP count.** Avenue Z's HubSpot version reads a custom `profile` property to classify contacts as ICP or MCP; the parity scorecard (`docs/superpowers/specs/2026-08-13-crm-parity-scorecard.md` on the Salesforce branch) found no Salesforce equivalent and calls it the biggest gap on the page. The CRM follow-up PR substitutes a plain weekly-pacing label instead of dropping the sub-metric entirely.

The two unconnected cards keep their frame, connector and source label, and show the needs-connection treatment in place of the metric and stat rows (§4).

---

## 3. Block 2: Web Analytics

Eight KPI cards from one dimensionless GA4 query. Every rate is a GA4-native metric requested by name and formatted locally. **We compute no rates ourselves, only deltas.** That is the answer if anyone asks how bounce rate is calculated: it isn't, by us.

`sessions` · `activeUsers` · `newUsers` · `bounceRate` · `averageSessionDuration` · `screenPageViewsPerSession` · `conversions` · `sessionConversionRate`

Three charts beneath them:

- **Sessions & Users Over Time**, with a 7-day average toggle
- **New vs Returning**, session-weighted engagement and duration
- **Traffic by Channel**, volume and conversion tabs, with a source/medium drill-down

Two things worth knowing about the numbers. Channel share percentages use the top-10 sum as their denominator, so they will not match GA4 exactly on a site with more than ten channel groups; compare raw session counts instead. And the trend chart's compare series is joined to the current one by array position rather than by date, so a gap in either range shifts the overlay.

---

## 4. Blocks 3 and 4, and the needs-connection state

Contact Creation and Pipeline Performance are both CRM-fed. Renaissance has no CRM connected, so both render a needs-connection card beneath their heading. No CRM client is called and no CRM component is copied.

**The rule:** no block renders `0` or a dash to mean "we have no source for this."

That rule is about absent configuration, not failed fetches, and the two are handled differently:

| Situation | Treatment |
|---|---|
| Source not configured for this client | needs-connection card |
| Source configured but the fetch failed or returned empty | dashes on KPIs, empty charts |

The distinction matters because our formatters return a dash on null by design. A dash after a failed fetch is honest: the source exists and this render did not get data. Do not route fetch failures into the needs-connection card.

Consequence worth stating, since staging and production GA4 credentials are not yet in hand (§8): if `ga4_property_id` is unset or the service account lacks access, `ga4Query` throws and Block 2 renders eight dashes and three empty charts. That is correct under the table above, and it is what a first render with wrong credentials looks like.

**Block-level card** (blocks 3 and 4): a dashed-border card stating the source is not connected. Props are `{ sourceName: string }`, passed **`'CRM'`**. No call to action, because there is no auth route to send anyone to.

**On-screen copy never names a vendor.** The card reads "CRM not connected", not "Salesforce not connected". Renaissance is on Salesforce today and may move to HubSpot, so naming either one dates the page and would need changing again on migration. Vendor names belong in internal conversation about why data is missing, not on a client-facing report. The component takes a `sourceName` prop rather than hardcoding the string, so this is a one-word change if that ever reverses.

**Card-level treatment** (journey cards 3 and 4): the block card is a centered full-width panel and cannot drop into a quarter-width flow card. Render inside the existing card frame instead: source eyebrow stays, the metric slot reads `Not connected` at normal body size rather than the `text-3xl` hero size, and one line reads `Connect your CRM to see this`. No border, no CTA; the card frame and connector are the container.

Our `DemandStage` type makes `metric` and `stats` optional and adds `connected?: boolean`. Omitted or `true` renders normally. Three places need a branch:

| Location | Change |
|---|---|
| hero metric slot | branch on `connected` |
| stats block | `stage.stats.length` becomes `stage.stats?.length`. **Required under `strict` the moment `stats` is optional**, independent of the variant |
| hover handlers | no-op when `connected === false`. Expanding into an empty panel is worse than not expanding |

`stage.delta != null` already guards the delta, so no false arrow appears. Nothing else in that component reads `metric` or `stats`.

---

## 5. Page composition

The route renders the page header: `StickyReportHeader` with `REPORT_NAMES[activeSection]` as title and the client name as subtitle. That component puts the **subtitle above the title**, so the page reads **"RENAISSANCE" over "OVERVIEW"**. That is the existing convention on every report page.

**The section renders no header of its own.** Adding one would print the client name twice.

Below it, four blocks in wireframe order, separated by `space-y-8`:

| Block | Heading |
|---|---|
| 1 Demand Journey | none, a bare 4-card panel |
| 2 | `WEB ANALYTICS` |
| 3 | `CONTACT CREATION` |
| 4 | `PIPELINE PERFORMANCE` |

A small muted label reading **`Last 30 days`** sits above Block 1. The page has no date picker and its numbers are fixed to a 30-day window, so without this the reader has nothing telling them what period they are looking at. This matters more because the AEO card is year-to-date (§2).

**No AI commentary appears anywhere on this page.** See §10 for the decision and exactly what that means.

The 7-day toggle, the channel tabs and the journey hover-expand come with the components and need no work.

The route supplies the loading skeleton. The section provides none.

### Not built

The wireframe's "DEMO DATA" pill, its "Prepared for … sample view" line and its footer disclaimer are artifacts of a sales mock. Demo mode was deliberately removed from this product (`docs/superpowers/specs/2026-06-25-remove-demo-mode-design.md`). PDF export is whatever the route already provides; nothing is built for it.

---

## 6. Data

This page stands alone. Its date ranges, its reshaping and its components are its own. Nothing about what it renders is derived from another page at runtime.

### 6.1 What is copied and what is called

| | |
|---|---|
| **Copied into this page's folder** | every component it renders, every line that turns raw API rows into props, and its date-range logic |
| **Called, not copied** | the app's vendor clients: `lib/ga4/client.ts`, `lib/peec/client.ts`, and the cache wrapper |

The vendor clients are the product's integration layer, shared by every section for every client. They are not Avenue Z's code and copying them would mean forking the app's GA4 and Peec integrations. Every one of them takes a `clientSlug` and resolves that client's own configuration.

**Data isolation is by construction.** `ga4Query` reads `clients.ga4_property_id` for the slug it is given; `getPeecOverview` reads `clients.peec_customer_project_id` and `clients.peec_your_brand`. Cache keys include the call arguments, so a Renaissance fetch can never return an Avenue Z cached result. Renaissance's GA4 property and Peec project are different records from Avenue Z's, verified in the dev database.

### 6.1.1 Live connection status

Probed read-only against Renaissance's real configuration, issuing the same calls this page will issue.

| Source | Status | Evidence |
|---|---|---|
| Client row | **confirmed** | GA4 property set, Peec project set, brand "Renaissance", no CRM |
| Date resolution | **confirmed** | main and compare ranges both resolve to 30-day windows |
| GA4 Q1 KPI totals | **confirmed live** | all 8 metrics returned |
| GA4 Q2 compare totals | **confirmed live** | returns a row |
| GA4 Q3 trend | **confirmed live** | 30 day buckets |
| GA4 Q5 channels | **confirmed live** | 9 channel groups |
| GA4 Q7 drill-down | **confirmed live** | 126 rows |
| GA4 Q8 audience | **confirmed live** | 4 buckets |
| Peec QP | **confirmed live in deployed environments** | Renaissance's existing AEO page renders Peec data. See below |

**GA4 is proven for Renaissance.** Block 2 and journey card 2 will populate, and the channel drill-down has real data behind it.

**Peec is proven in deployed environments, but not testable locally.** Every Peec token on the build machine returns `401 Invalid API Key`, and there are two different ones. That is a stale local credential, nothing more: deployed environments read their own `PEEC_AI_CUSTOMER_TOKEN` from Vercel's Preview or Production scope, never from a developer's `.env.local`.

Renaissance's existing Answer Engine Optimization page settles it. That page is live and calls `getPeecOverview` with the same client record and the same project id this page will use. It renders roughly thirty weekly visibility buckets from January onward, labels the series "Renaissance" and separates it from a competitor average, and shows per-model share of voice. That confirms all three things the local 401 left open:

1. the project returns data,
2. `weeklyVisibility` has far more than the two entries a week-over-week delta needs,
3. **`peec_your_brand` resolves against the returned rows.** The AEO page's brand filtering reads the same configured value that `isYou` is computed from, so a correctly-written `isYou` lookup will match.

**Practical consequence:** journey card 1 cannot be previewed on this machine and its first real render happens on a deploy. Everything else on the page is testable locally. Getting a valid local Peec token is a convenience, not a blocker.

**Verification anchors**, taken from that page on 2026-08-13. Use these to sanity-check the card once it renders; they will drift as new weeks land:

- AI Visibility sat in the low-to-high twenties percent over recent weeks. A card showing a wildly different figure means the wrong week is being read.
- Per-model share of voice ranged from roughly three to fifteen percent. Since the card averages across rows, expect something in the high single digits to low teens, not a figure matching any single model.

### 6.2 Fetches

Ten fetches, all issued together with `Promise.allSettled` so one vendor failing degrades its block instead of killing the page.

**Ranges are resolved inside the page, not taken from props:**

```ts
const resolved = parseDateRange('last_30_days')
const compare  = deriveCompareRange('last_30_days', 'previous_period')
const mainIso  = `${resolved.startDate},${resolved.endDate}`
const cmpIso   = compare ? `${compare.startDate},${compare.endDate}` : null
```

This is load-bearing. Every route passes `compareRange` as `null` for a section with no date picker, no navigation path supplies it, and a TypeScript default does not fire for `null`. Take it from props and the page ships with **no KPI deltas, no trend overlay, no channel compare bars and no journey delta pills**, all of which the wireframe shows. The last two lines are not optional either: `ga4Query` takes a single comma-joined string.

| # | Range | metrics | dimensions | limit | Feeds |
|---|---|---|---|---|---|
| 1 | main | the eight in §3 | none | n/a | 8 KPI cards, journey card 2 |
| 2 | compare | the eight in §3 | none | n/a | all 8 deltas, journey card 2 delta |
| 3 | main | `sessions, activeUsers, newUsers` | `date` | 90 | trend chart, journey sparkline |
| 4 | compare | `sessions, activeUsers, newUsers` | `date` | 90 | trend overlay |
| 5 | main | `sessions, conversions, sessionConversionRate` | `sessionDefaultChannelGroup` | 10 | channel chart, both tabs |
| 6 | compare | `sessions` | `sessionDefaultChannelGroup` | 10 | channel compare bars |
| 7 | main | `sessions` | `sessionDefaultChannelGroup, sessionSource, sessionMedium` | 150 | channel drill-down |
| 8 | main | `sessions, engagementRate, averageSessionDuration` | `newVsReturning` | n/a | New vs Returning |
| 9 | compare | `sessions, engagementRate, averageSessionDuration` | `newVsReturning` | n/a | New vs Returning deltas |
| P | year_to_date | Peec `getPeecOverview` | n/a | n/a | journey card 1 |

**Query 5's metric list matters.** The By Conversion tab filters on `sessions >= 20` and sorts by conversion rate. Issue it with `sessions` alone and that tab renders empty with no error.

**Query 7 is easy to drop.** The drill-down builder is embedded in the channel reshaping, so copying that code without issuing this query yields a silently empty drill-down.

The journey sparkline reuses query 3 rather than issuing its own; shapes match after date formatting.

### 6.3 Scorecard: every displayed number, traced

Use this to verify the page once it renders. Every value on screen appears here with the query that produced it, the field it reads and what we do to that field.

`Q1`-`Q9` and `QP` refer to §6.2. Config column names the `clients` row value the fetch resolves.

**Block 1: Demand Journey**

| Displayed | Query | Field | Transform | Window | Config |
|---|---|---|---|---|---|
| AI Visibility % | QP | `visibility_count / visibility_total` | × 100, latest ISO week, all models | year to date | `peec_customer_project_id` |
| share of voice | QP | `share_of_voice` on the client's own brand rows | mean of rows, field is a fraction scaled by 100 | year to date | `peec_your_brand` |
| AEO delta | QP | last two `weeklyVisibility` entries | `(latest - prev) / prev × 100` | week over week | |
| Site Sessions | Q1 | `sessions` | round and localize | 30 days ending yesterday | `ga4_property_id` |
| conversion rate | Q1 | `sessionConversionRate` | × 100, one decimal | same | |
| sessions delta | Q1, Q2 | `sessions` both ranges | `(current - prior) / prior × 100` | vs previous period | |
| Online Contacts, Open Pipeline | none | | needs connection | | no CRM |

**Block 2: eight KPI cards, all from Q1 with deltas from Q2**

| Displayed | GA4 metric | Transform |
|---|---|---|
| Sessions | `sessions` | round, localize |
| Active Users | `activeUsers` | round, localize |
| New Users | `newUsers` | round, localize |
| Bounce Rate | `bounceRate` | × 100, one decimal. Delta inverted, so a rise renders red |
| Avg Session Duration | `averageSessionDuration` | seconds to `Xm Ys` |
| Pages / Session | `screenPageViewsPerSession` | one decimal |
| Conversions | `conversions` | round, localize |
| Conversion Rate | `sessionConversionRate` | × 100, one decimal |

Every one of these is a GA4-native metric requested by name. **We compute none of them.** Only the deltas are ours, and every delta is `(current - prior) / prior × 100`.

**Block 2: three charts**

| Displayed | Query | Dimension | Notes |
|---|---|---|---|
| Sessions & Users Over Time | Q3, Q4 | `date`, limit 90 | 7-day rolling mean when toggled. Compare series joined by array position, not by date |
| New vs Returning | Q8, Q9 | `newVsReturning` | Engagement and duration are session-weighted: `Σ(rate × sessions) / Σsessions`. Any bucket not containing "new" folds into returning |
| Traffic by Channel, volume | Q5, Q6 | `sessionDefaultChannelGroup`, limit 10 | Share % divides by the sum of the ten returned rows, not by total site sessions |
| Traffic by Channel, conversion | Q5 | same | Rows with fewer than 20 sessions excluded, sorted by conversion rate, top five |
| channel drill-down | Q7 | `+ sessionSource, sessionMedium`, limit 150 | Top entries per channel |

**Blocks 3 and 4:** no fetches. Needs connection.

**What to expect when a number looks wrong:**

| Symptom | Cause |
|---|---|
| No deltas anywhere | §6's ranges were taken from props instead of resolved internally |
| Share of voice blank | brand lookup fell back to string matching instead of `isYou` |
| By Conversion tab empty | Q5 issued without its full metric list |
| Drill-down empty | Q7 not issued |
| Channel shares do not match GA4 | expected above ten channel groups; compare raw session counts |
| Compare overlay shifted | the known array-position join, §10 |
| All eight KPIs show a dash | GA4 threw, most likely a property id or service-account access problem |

Failure handling: `allSettled` plus the route-level error boundary. No per-block boundaries, because everything is awaited at one point, so there is one failure domain. Consequence accepted: one skeleton until the slowest of ten fetches settles, no progressive loading. Note that `allSettled` does not hide failures from health monitoring; a failed fetch is recorded inside the cache wrapper regardless of how the caller settles.

---

## 7. Build appendix: where each piece comes from

Everything this page renders lives in `components/report-sections/executive-overview/` as **this page's own code**. Nothing is imported from another report section. These paths are copy-from addresses, needed once.

| Copy from | To |
|---|---|
| `demand-overview/demand-journey.tsx` | `executive-overview/demand-journey.tsx` |
| `components/charts/kpi-card.tsx` | `executive-overview/kpi-card.tsx` |
| `ga4/sessions-trend-chart.tsx` | `executive-overview/sessions-trend-chart.tsx` |
| `ga4/new-returning.tsx` | `executive-overview/new-returning.tsx` |
| `ga4/channel-tabs-chart.tsx` | `executive-overview/channel-tabs-chart.tsx` |
| `report-sections/empty-state.tsx` | `executive-overview/needs-connection.tsx` |

`empty-state.tsx` has zero call sites today, so it is unused code being adapted rather than a proven pattern.

Copying rather than importing was chosen for one reason: a rule with no exceptions is one nobody has to remember the shape of. It also earns something, since owning `demand-journey.tsx` is what allows a real `connected` variant instead of stuffing placeholder text into the metric slot, and our copies can export their prop types where the originals do not, so `tsc` catches drift between the reshaping and the components it feeds.

Accepted cost: six UI files and ~233 lines of reshaping exist twice and will drift silently. §10 lists the filenames to grep.

### The reshaping

Roughly 233 lines turning raw GA4 rows into props live inline in `ga4/index.tsx`, not in `lib/`. Copy these ranges:

| Consumer | Lines |
|---|---|
| 8 KPI cards | `:261-314`, plus `KPI_METRICS` at `:78-87` |
| trend chart | `:316-334` |
| channel chart, both tabs and drill-down | `:336-403` |
| New vs Returning | `:464-483` |
| shared formatters | `:33-76` |

Four things that bite:

- **Adapt every result access.** The source fetches with `Promise.all`, so its reshaping dereferences results directly (`totalsRes.rows[0]`, `trendRes.rows`, `channelRes.rows`, `audienceRes.rows`). Under `allSettled` each needs unwrapping first: `const ga4 = ga4Res.status === 'fulfilled' ? ga4Res.value : null`. `strict` catches the bare cases, but some accesses are optional-chained and will compile against a settled result while producing **silently empty compare bars and an empty drill-down**. `tsc` is in no CI workflow.
- returningUserCount and its consumer were removed entirely: the only thing that ever read it was the AI callout this page deletes, so the port drops the plumbing rather than carrying dead output.
- `channelConvData` depends on `channelColorMap`, which depends on `channelData`, so `:336-403` must move as one block or the two channel tabs' colors desynchronize.
- **`compareDateLabel` sits at `:537-539`, outside every range above**, and feeds the trend chart's `compareLabel` (`:558`). Miss it and that chart silently loses its compare-period label. `ChannelTabsChart` is handed the same prop at `:572` but never reads it in its body, so this page does not pass it there. Recorded in §10 as an inherited dead prop.

Journey card 1 is Peec, not GA4, so none of the above covers it. Its derivation is at `demand-overview/index.tsx:194-205`; copy that, substituting the `isYou` lookup from §2.

### Removed in our copies

`new-returning.tsx`: delete the `AiBadge` component and the engagement-gap callout it annotates. See §10.

`demand-journey.tsx`: delete the built-in card header ("Full-Funnel View / Demand Journey / From AI visibility to closed pipeline"). The wireframe shows a bare 4-card panel. It is a self-contained `<div className="mb-6">`; the card frame and flow row survive its removal.

---

## 8. Wiring it up

### 8.1 Registration

Twelve items. The four route dispatchers are the ones most easily missed, because `ENGINEERS.md:412` is wrong about them.

| # | Location | Required |
|---|---|---|
| 1 | `ReportSlug` union, `lib/db/schema.ts` | yes |
| 2 | `REPORT_NAMES` → `'executive-overview': 'Overview'`, `lib/constants.ts` | yes |
| 3 | `NAV_GROUPS`, `lib/constants.ts` | yes, see §8.2 |
| 4 | `ALL_REPORT_SLUGS`, `lib/constants.ts` (drives the portal sidebar) | yes, see §8.2 |
| 5-8 | all four route dispatchers | yes, see §8.3 |
| 9 | `NON_CHANNEL_SLUGS` in `report-generator/index.tsx` | yes, or the page is offered as a data channel |
| 10 | `clients.enabled_reports` for `renaissance` | yes, per environment, **after deploy** (§8.4) |
| 11 | date-picker allow-lists | **no change**, see §8.5 |
| 12 | settings-page exclusion array | cosmetic, and it is a global page |

Two switches correctly need no entry, recorded so nobody rediscovers them as misses: `ai-summaries`' `NON_CHANNEL_SLUGS` is double-gated by `&& CHANNEL_META[slug]`, and `resolveCommentaryView` returns `null` by default, which is the intended outcome.

### 8.2 Nav position

**The invariant is `NAV_SLUG_ORDER[1] === 'executive-overview'`**, immediately after `demand-overview`, and the same position in `ALL_REPORT_SLUGS`. State it that way rather than as an index, because `NAV_GROUPS` is an array of groups rather than slugs; appending to group 0's `slugs` and splicing a new group at position 1 both satisfy it.

`ALL_REPORT_SLUGS` is the one that matters most: it drives the portal sidebar, which is what Renaissance's client users load. Appending would bury Overview below AEO, Paid Media and Organic Social for exactly the audience the page is for.

This makes Overview Renaissance's landing section, replacing AEO. Intended.

### 8.3 The four route dispatchers

A dispatcher is the `switch` that turns a report slug into a component. **There are four and this page must be added to all four.**

`ENGINEERS.md:412` says there are two and names only the deep-link routes. The two it omits are the ones real users hit.

| # | File | Serves | Reached by |
|---|---|---|---|
| 1 | `app/dashboard/[clientSlug]/reports/page.tsx` | internal, tab nav | staff clicking the sidebar. Also the health sweep |
| 2 | `app/portal/[clientSlug]/reports/page.tsx` | portal, tab nav | **clients clicking their sidebar.** Not probed by the sweep |
| 3 | `app/dashboard/[clientSlug]/reports/[reportSlug]/page.tsx` | internal, deep link | deep links only. Not probed |
| 4 | `app/portal/[clientSlug]/reports/[reportSlug]/page.tsx` | portal, deep link | deep links, and the sweep |

**Nothing catches a missed one.** `tsc` cannot see it: there is no exhaustiveness assertion, `noImplicitReturns` is off, and route #2 has no `default` arm at all. `tsc` is not in CI either. And the health sweep reports a miss as **green**, because the route returns an empty Fragment, the probe skips it, and an empty sources array reads as healthy. Routes #2 and #3 must be opened by hand.

### 8.4 Enablement

`enabled_reports` is data, not code. It does not travel with a git merge and must be run against each environment's database.

**Deploy the code first, then run the UPDATE.** The portal landing page maps `enabledReports` raw and falls through to the bare slug when `REPORT_NAMES` has no entry, so enabling early puts a card reading literally `executive-overview` on Renaissance's client-facing page.

| Environment | Neon endpoint | Run when |
|---|---|---|
| dev | `ep-still-tree` | after local build |
| staging | `ep-restless-union` | after deploy to staging. **Credentials not yet available locally** |
| production | `ep-green-violet` | after sign-off, with my explicit go-ahead. **Credentials not yet available locally** |

**If the staging UPDATE is skipped the page will not appear for the team reviewing there, which reads as a broken build rather than a missing data step.** That is the most likely way this goes wrong.

```sql
UPDATE clients
SET enabled_reports = array_append(enabled_reports, 'executive-overview')
WHERE slug = 'renaissance'
  AND NOT ('executive-overview' = ANY(enabled_reports));
```

Idempotent and scoped to one row. `array_append` puts the slug last, so the portal landing card grid (which uses raw array order) shows Overview at the bottom; write the ordered array explicitly if that matters. Re-verify at each enablement that renaissance still lacks demand-overview in enabled_reports; if both slugs were ever enabled, the landing section reverts to demand-overview and the sidebar shows two entries labelled Overview.

**Do not run `npm run db:seed`.** It upserts each of its two seeded clients over 22 columns including `enabled_reports`, `hidden_reports` and `hubspot_token_env_var`, plus a users upsert that rewrites `role`, and it is stale against the live database in both directions. Its blast radius is larger than this entire PR.

Client lookups are cached 5 minutes, so expect a lag after the update. That is the only consequence.

Credential values go into the local gitignored `.env.local`, never into chat, a commit, or a doc.

### 8.5 No date picker

The two tab-navigation routes gate their date control on an allow-list, and this page is not on it. That is deliberate: the wireframe specifies a fixed 30-day period, and §6 explains why internal range resolution is mandatory as a result.

The two deep-link routes render a picker unconditionally, which this page ignores, so a selection there changes the URL and nothing else. Suppressing it would mean editing shared route code for one slug. Left alone; those URLs are not produced by any navigation in the product. Recorded in §10.

---

## 9. Verification

- **Every KPI shows a delta, not a greyed placeholder.** All eight cards pass `comparisonExpected`, so a missing delta renders as a visible placeholder rather than a bare number. A page of placeholders where a delta should be means §6's range resolution was not followed.
- Sessions equals GA4's Sessions for a 30-day window ending **yesterday**. Today is deliberately excluded.
- Bounce rate, pages/session, conversion rate and average session duration match GA4 to the decimal. We format but never compute these.
- Traffic by Channel's **By Conversion** tab has rows. Empty means query 5 was issued without its full metric list.
- The channel drill-down expands. Empty means query 7 was not issued.
- Share of voice renders a value. Blank means the brand lookup regressed to string matching.
- The header reads "RENAISSANCE" over "OVERVIEW", in that order, once. Two client names means the section rendered its own header.
- A period label reading "Last 30 days" is visible above Block 1.
- No "AI" badge and no generated-sounding sentence appears anywhere.
- Blocks 3 and 4 read "CRM not connected", never `$0`, never a dash, and never a vendor name.
- Open route #2 by hand. The sweep never probes it and a blank page there reports green.
- `npm run check:rsc` passes; it runs on every PR. **`tsc` is in no workflow**, so run it locally before pushing.
- No other client's pages change. §10 names the two internal pages where a count does.

---

## 10. Decisions and known issues

### Decided

**No AI commentary on this page, of any kind.** In our copy of `new-returning.tsx`, the `AiBadge` and the engagement-gap callout it annotates are both deleted. Nothing replaces them.

Two independent reasons. The label is false: that sentence is deterministic string templating with three fixed branches chosen by a numeric comparison, while the badge's tooltip tells the reader it was generated by AI from their analytics data. And it would be the only one: `SHOW_AI_NARRATIVE` is `false` and every sibling narrative block respects it, so shipping it would make this the single client-facing surface with AI-labelled copy while the feature is off everywhere else.

**Scoped deliberately.** "AI Visibility" and "share of voice" on journey card 1 are **measured Peec metrics, not commentary**. They are the point of the wireframe's first block and they stay. This removes generated prose and a false label, not AI-related data.

**Cron concurrency: no change.** I asked for `CONCURRENCY` to be raised from 8 to 10, on the strength of an earlier draft's argument. That is reversed, because all three premises behind it were wrong: the truncation risk runs toward the end of the alphabet rather than toward the first client, the fan-out is a rolling pool with no wave boundary to cross, and the bound exists specifically because unbounded fan-out tripped database errors. The corrected risk model is that a 60s timeout means nothing is written and no alert posts for **any** client, so the question is whether the job finishes at all, not which units get dropped. This page adds 2 units per cron. Ship and watch the durations.

### Also decided

**Tests ship with this PR.** The implementation plan runs under TDD, and four of its tasks carry a real red-green cycle: the needs-connection card, the unconnected-card variant, the GA4 reshaping, and the stage builder. Together those cover every piece of logic on this page. The needs-connection card is tested for the thing that actually matters, that it renders no digit, no dash and no currency symbol.

Copying a file and deleting a component are not tested, because you cannot write a failing test for either first. Both are verified by `tsc` plus a diff proving no original changed.

### Nothing else breaks

No other client's rendered pages change. The slug will not be in anyone else's `enabled_reports`, and every registration filters out: sidebars return null for an empty group, card grids filter, the default-section lookup skips absent slugs, and all four dispatchers gate on `enabled_reports` before the switch runs. Cache keys include call arguments, so no cross-client collision. No mapped type over `ReportSlug` exists, no test enumerates the slug list, and no migration is needed.

Two internal pages do change: `/dashboard/settings` and the `/dashboard` client index each render every client's report count, so Renaissance's goes up by one. Cosmetic.

One latent dependency worth knowing: the portal sidebar iterates `ALL_REPORT_SLUGS` for every client and returns null for unenabled slugs only because `SHOW_LOCKED_REPORT_TEASERS` is `false`. Flip that flag and "Overview" appears as a locked entry in every client's portal sidebar, including Renaissance's own, which would then show a locked and a live entry both labelled "Overview". Recorded so whoever flips it knows to check.

### Known issues, ours

- **Copy drift.** Six UI files and ~233 lines of reshaping now exist twice, and nothing warns when one side is fixed. Whoever changes `ga4/sessions-trend-chart.tsx`, `ga4/new-returning.tsx`, `ga4/channel-tabs-chart.tsx`, `charts/kpi-card.tsx`, `demand-overview/demand-journey.tsx` or `empty-state.tsx` should grep `executive-overview/` for the same filename. Worth a note in `ENGINEERS.md` once this ships.
- **No progressive loading.** One skeleton until all ten fetches settle. Splitting into independently-suspended blocks is an option if it feels slow.
- **The reshaping should eventually live in `lib/`**, with both pages reading it.
- Routes #3 and #4 render a date control this page ignores, so a selection there changes the URL and nothing else. Deep-link only.

### CRM data arrives in a follow-up

The two unconnected blocks are not permanently blocked. Renaissance's CRM data has since been confirmed reachable, and filling those blocks in is a separate piece of work on its own branch.

That work does not change anything in this document. This page ships with the needs-connection treatment as designed, and the follow-up swaps real data behind the same layout. The two are intended to reach staging together so the page is only ever demoed complete.

Nothing here should be held for it.

### Known issues, inherited

Found during investigation, all pre-existing, none in scope here.

- The AEO delta compares the current incomplete ISO week against a full one, so it reads negative early in any week regardless of performance.
- Contact loaders branch on hardcoded 2025 and 2026 only; any other year falls through to zeros silently. Everything CRM-fed stops working on 2027-01-01. Pipeline comparison years have the same cliff, duplicated across three files.
- Close dates are parsed in server local time, so a UTC-midnight 1 January date lands in the prior year west of UTC.
- The trend chart joins its compare series by array index rather than by date.
- Prior-year pacing shifts by calendar date rather than weekday, and returns 0 on any error, making a failure indistinguishable from a quiet week.
- The dashboard deep-link route drops `dateRange`, so Inbound Funnel shows different numbers depending on which route reached it.
- `new-returning.tsx` carries the same false "AI" badge on every page that uses it, ungated where every sibling is gated. **Worth raising with Paul.**
- `ENGINEERS.md:412` documents two dispatchers where there are four, and names the wrong two. Both deep-link routes are missing several cases besides ours.
- The health sweep cannot detect a missing dispatcher case, and probes only two of four routes.
- `tsc` runs in no CI workflow.
- `ChannelTabsChart.compareLabel` and `ChannelVolumeRow.pct` are declared but never read. `empty-state.tsx`, `demand-overview/signal-card.tsx` and `hubspot-performance`'s `CLOSED_STAGE_IDS` are unreferenced.
- Contact email addresses are written to server logs from a production path.
- Two slugs now map to the display name `Overview`. Nothing breaks, but a reverse lookup from display name to slug is ambiguous.
- The CRM integration has no per-client config object: pipeline id, stage ids, the ICP property and the portal id are hardcoded in shared code, so any second CRM client renders silent zeros rather than an error. This is why Renaissance could not simply be pointed at Salesforce even if the integration existed. **Addressed:** PR #208 ships a per-client `SalesforceConfig` (`lib/db/schema.ts:68`) plus a `salesforce_config` jsonb column (`lib/db/schema.ts:149`), following the same pattern already in place for Meta and LinkedIn.
- Another client has `demand-overview` and `peec-ai` enabled with no Peec project configured, and the Peec client falls back to an environment default, so they are rendering someone else's data today. Same bug class this page's `isYou` fix avoids.
