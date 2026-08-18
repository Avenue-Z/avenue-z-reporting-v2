# Drafted replies to Paul's CR (not yet posted)

Voice: mine, first person. One reply per inline comment, plus an overall
comment per PR. SHAs reference the fix commits.

## PR 208 overall comment
Worked through all seven. Five fixed in fbfbf23, two deferred with reasons below.
The headline one: Closed Won is no longer a hardcoded string, it reads from
salesforceConfig.wonStageName and defaults to "Closed Won", so a rename or a
second client can't silently zero the tile. Full disposition in
docs/qa/paul-cr-disposition.md. Tests 617 green, tsc + rsc clean.

### 208 inline replies
- pipeline.ts:23 (CLOSED_WON): made configurable. Added optional wonStageName to
  SalesforceConfig, threaded through getSalesforcePipeline, defaults to "Closed Won"
  when unset so it's not breaking. fbfbf23.
- pipeline.ts:169 (stageTruncated): good catch. Now flags on either fetch:
  stageRows OR cmpStageRows hitting the cap. fbfbf23.
- contacts.ts:30 (WEEK_KEY_RE): tightened to /^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/,
  so a year-only key producing W00 is dropped instead of becoming previousWeek. fbfbf23.
- pipeline.ts:7 (unused opportunity_is_won): dropped from STAGE_FIELDS, buys the
  truncation headroom you flagged. fbfbf23.
- contacts.ts:15 (toNumber dup): extracted to lib/salesforce/num.ts, both files
  import it now. fbfbf23.
- base.ts:41 (resolveCompareIso triplication): deferring. It's shared with meta and
  linkedin, so consolidating means touching their channels too. Tracked as a
  follow-up rather than widening this PR's blast radius.
- base.ts:3 (GA4 SDK via ga4/client): same call, deferring. Moving deriveCompareRange
  into lib/date-range touches the same two channels. Tracked follow-up.

## PR 207 overall comment
All 21 worked through. The Peec leak is closed (that was the ship-blocker), plus
the trend date-join, mobile responsiveness, empty states, and connected-state now
reads from config. Two I left on purpose and flagged inline. I also closed one you
didn't catch: after the date-join fix a leading zero-session day could still shift
the overlay, fixed in 1b7a6d3. Two findings I first missed (chart empty states and the
channel share-of-total render) are closed in 0457a6e. Full
disposition in docs/qa/paul-cr-disposition.md. Tests 616 green, tsc + rsc clean.

### 207 inline replies
- index.tsx:49 (Peec leak, ship-blocker): fixed. Resolve the client first, gate
  getPeecOverview on peecCustomerProjectId, and the AEO card falls to the
  unconnected variant when there's no project. Matches the peec-ai tab. 7cda9be.
- index.tsx:52 (blank chart chrome): the three charts now render an explicit
  "No data for this period" state on empty input instead of empty shells, via a
  shared NoData component. 0457a6e.
- index.tsx:91 (3x "CRM not connected"): fixed the real bug here, the unhoverable
  CRM cards were dropping to opacity-25 when a sibling was hovered. Left the count
  at three on purpose: 208 fills Contact Creation and Pipeline with real data, so
  two of those placeholders go away once it lands. 7cda9be / 7b74bcc.
- stages.ts:63 (hardcoded connected): now derived from the client's CRM config
  (hubspotTokenEnvVar), so a CRM-configured client shows connected. 208 extends
  this to salesforce. 7cda9be.
- stages.ts:32 (inert \n): removed, the p had no whitespace-pre-line so it did
  nothing. 7cda9be.
- reshape.ts:68 (index-join): now joins by date, and anchors on the true
  period-start so a missing day on either side can't shift the series. 7cda9be + 1b7a6d3.
- reshape.ts:136 (pct rendered nowhere): the share-of-total now renders under the
  session count in the volume tab, matching what the tooltip promised. 0457a6e.
- reshape.ts:139 (color wraps at 10): added a 10th CHANNEL_COLORS entry and spaced
  the warm hues apart in the ramp. 7cda9be.
- demand-journey.tsx:44 (no responsive): added breakpoints, stacks to grid below lg,
  connectors hidden below lg, hero metric steps down. Desktop unchanged. 7b74bcc.
- sessions-trend-chart.tsx:208 (hasCompare from data[0]): now derived from the whole
  series, overlay gets connectNulls so it spans the axis. 7cda9be.
- sessions-trend-chart.tsx:108 (unused compareLabel): removed the prop and call site. 7cda9be.
- sessions-trend-chart.tsx:186 (smoothing tooltip): tooltip header now says "7-day avg"
  when smoothing is on. 7cda9be.
- channel-tabs-chart.tsx:47 (tooltip "same channels"): reworded, and added a
  "Top 5, >=20 sessions" caption so the filter is visible. 7b74bcc.
- channel-tabs-chart.tsx:162 (mobile header align): matched the widths so header and
  values line up below sm. 7b74bcc.
- channel-tabs-chart.tsx:192 (smMax guard): changed ?? 1 to || 1. 7b74bcc.
- channel-tabs-chart.tsx:218 (hover reflow): the row is a fixed-size box now with the
  two layouts crossfaded on opacity, so geometry never changes on hover. 7b74bcc.
- new-returning.tsx:20 (palette drift): routed every color through CHART_COLORS,
  Returning is a distinct hue now (metaAds purple) so it doesn't read as Active Users. 7b74bcc.
- new-returning.tsx:81 (bar/card order + rounding): bar and cards use one order now,
  and the second share is 100 minus the first so they always total 100. 7b74bcc.
- new-returning.tsx:148 (pp vs %): leaving this one. It's inherited from the ga4
  section we copied, so changing it here would diverge from the source. Happy to do
  it as a convention change across both if you want it.
- app/dashboard .../page.tsx:46 (dead date picker): hidden for the executive-overview
  slug only, since the section resolves its own range. 7b74bcc.
- app/portal .../page.tsx:56 (dead date picker, client-facing): same, hidden here too. 7b74bcc.
