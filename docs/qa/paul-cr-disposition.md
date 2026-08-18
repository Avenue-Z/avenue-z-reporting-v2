# Paul CR disposition (PR 207 + 208)

Every finding, with how it is being addressed. FIX = code change this round.
DECIDE = deliberate default taken (user can override). DEFER = tracked follow-up
with reason. Verified against code 2026-08-18; all of Paul's claims confirmed real.

## PR 208 (Renaissance-CRM-Salesforce)

| # | file:line | sev | disposition |
|---|---|---|---|
| 1 | pipeline.ts:23 | ● | FIX. `CLOSED_WON` becomes configurable: add optional `wonStageName` to `SalesforceConfig` (jsonb, no migration), default `'Closed Won'` when unset. Threaded through `getSalesforcePipeline`. |
| 2 | pipeline.ts:169 | ● | FIX. `stageTruncated` also checks `cmpStageRows.length >= STAGE_MAX_ROWS`. |
| 3 | contacts.ts:30 | ● | FIX. Tighten `WEEK_KEY_RE` to reject week 00 and 54+: `/^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/`. |
| 4 | pipeline.ts:7 | ○ | FIX. Drop unused `opportunity_is_won` from `STAGE_FIELDS` (buys truncation headroom). |
| 5 | contacts.ts:15 | ○ | FIX. Extract one shared `toNumber` inside lib/salesforce, used by both files. |
| 6 | base.ts:41 | ○ | DEFER. `resolveCompareIso` triplication is shared with meta+linkedin; refactor touches other clients' channels. Follow-up. |
| 7 | base.ts:3 | ○ | DEFER. GA4 SDK via `@/lib/ga4/client` is a pre-existing pattern in meta+linkedin too; moving `deriveCompareRange` to lib/date-range touches shared infra. Follow-up. |

## PR 207 (Executive-Overview-Duplicate-Ren)

| # | file:line | sev | disposition |
|---|---|---|---|
| 1 | index.tsx:49 | ● | FIX. SHIP-BLOCKER. Guard `getPeecOverview` on `peecCustomerProjectId` (resolve client first, skip when null, fall to unconnected AEO card). Matches peec-ai/index.tsx:71-87. |
| 2 | reshape.ts:68 | ● | FIX. Join compare by date, not array index; gap-fill missing days both sides. |
| 3 | sessions-trend-chart.tsx:208 | ● | FIX. Derive `hasCompare` from series; overlay spans axis (paired with #2). |
| 4 | demand-journey.tsx:44 | ● | FIX. Add responsive breakpoints; hero metric steps down; hide connectors below lg. |
| 5 | index.tsx:52 | ● | FIX. Explicit "no data for this period" empty state on the 3 charts when input empty. |
| 6 | stages.ts:63 | ● | FIX. Derive `connected` from client CRM config (`hubspot_token_env_var`) not a hardcoded false. 208 Half B extends to salesforce. |
| 7 | reshape.ts:136 | ○ | FIX. Render `pct` (share of total) in volume tab; tooltip already promises it. |
| 8 | reshape.ts:139 | ○ | FIX. Add 10th `CHANNEL_COLORS` entry (query limit is 10); space warm hues apart. |
| 9 | stages.ts:32 | ○ | FIX. Drop inert `\n` (or add whitespace-pre-line). |
| 10 | sessions-trend-chart.tsx:108 | ○ | FIX. Remove unused `compareLabel` prop. |
| 11 | sessions-trend-chart.tsx:186 | ○ | FIX. Label tooltip "7-day avg" when smoothing on; handle first-6 ramp. |
| 12 | channel-tabs-chart.tsx:47 | ○ | FIX. Correct "same channels" copy; add "top 5, >=20 sessions" caption. |
| 13 | channel-tabs-chart.tsx:162 | ○ | FIX. Mobile column-header alignment (w-14 sm:w-20). |
| 14 | channel-tabs-chart.tsx:192 | ○ | FIX. `smMax` guard `?? 1` -> `|| 1`. |
| 15 | channel-tabs-chart.tsx:218 | ○ | FIX. Reserve hovered layout width/height so hover doesn't reflow. |
| 16 | new-returning.tsx:20 | ○ | FIX. Route colors through `CHART_COLORS`; distinct hue for Returning. |
| 17 | new-returning.tsx:81 | ○ | FIX. Sync bar order with card order; second share = 100 - first. |
| 18 | new-returning.tsx:148 | ○ | DECIDE: leave. `pp` vs `%` is inherited from ga4; changing here diverges from the source we copied. Paul flagged it as a decision, not a defect. |
| 19 | index.tsx:91 | ○ | PARTIAL. FIX the real bug (isDimmed drops unhoverable journey cards to opacity-25). LEAVE the 3x "CRM not connected" count: 208 fills two of them with real data. |
| 20 | app/dashboard/.../page.tsx:46 | ○ | FIX. Hide the date picker for this slug (section resolves range internally). |
| 21 | app/portal/.../page.tsx:56 | ○ | FIX. Same, portal route. |
