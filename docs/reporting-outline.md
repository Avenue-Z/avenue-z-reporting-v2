# Reporting-outline: three Organic Social clients

Scope doc for the Reporting-outline deliverable. No code changes here. This
records what is fixed, what I have verified in the tree, and what is still open,
so the three client branches can be reviewed against something.

## What this is

I am adding three clients to the reporting platform and giving each its own
layout:

- A Place For Mom
- Joy of Life
- a third client the outline calls Kenect Nashville and our records call Akara
  Living. Which name to use is Jasmine's question 1.

All three are **Organic Social only**. None of them gets any other report
section.

Each one is a standalone client: its own row, its own config, its own channel
list. Nothing is shared between them and nothing is inherited.

## GOLDEN RULE: Renaissance is not touched

Renaissance is live in production in a client's hands right now. It cannot
change at all. Not its config row, not its rendered output. Both readings hold,
and a change that satisfies one while breaking the other is still a violation.

This is the gate on the whole deliverable, not a preference.

Specifically forbidden in this work:

- any write to Renaissance's `clients` row in any environment
- any change to a shared default that Renaissance resolves through
- `npm run db:seed`, ever (see the finding below)
- writes to dev or prod. Staging only.

Before anything here merges I have to demonstrate the no-op, not assert it.

## Channels are per client, per channel, opt in

Every client's social channels come from that client's own config. A client I do
not explicitly name gains nothing. There is no default-to-all, no inheriting,
and no inferring a channel from the data coming back non-empty.

TikTok is a new channel (PR 247). It appears only for a client whose config
explicitly names it.

## What I verified in the tree

These are checked, not assumed. File and line are current as of this branch.

**1. A null channel allowlist resolves to every channel.**
`resolveChannels` (`lib/organic-social/metrics.ts:37`) returns `[...CHANNELS]`
when the allowlist is absent or empty. Renaissance's `dash_social_config`
has no `channels` key at all in dev, staging **and** production, and
`organic-social` is in its production `enabled_reports`.

So adding a channel to the shared `CHANNELS` array puts that channel on
Renaissance's live report with no config change and nobody's decision. A client
with no account on that platform returns HTTP 200 with zero posts rather than an
error, so the drop-on-error path never fires and the section renders empty.

Writing an explicit channel list onto Renaissance's row would also be touching
Renaissance. The fix has to change how an absent allowlist resolves, so it
cannot silently absorb newly added channels, leaving Renaissance's row alone and
its output identical.

**2. The date range picker has no per-client gating.**
`components/layout/date-range-picker.tsx` contains zero `clientSlug`
references. The preset list is a module-level constant (lines 27-46) and the
component renders on `/portal/[clientSlug]/reports/[reportSlug]` for every
client. Editing that array changes what Renaissance's client sees.

**3. `scripts/seed.ts` would overwrite Renaissance wholesale.**
Lines 163-165 do `.onConflictDoUpdate({ target: clients.slug, set: clientValues })`
over hardcoded `avenue-z` and `renaissance` rows. Running it resets
Renaissance's `hidden_reports` to `[]` and un-hides a deliberately hidden tab.

**4. Every write in the codebase is already scoped to one client.**
`lib/db/admin-queries.ts:28` and `:41` scope on `clients.id`.
`app/actions/report-sections.ts:37` and `app/actions/reports.ts:80` scope on
`clients.slug`. The user delete (`admin-queries.ts:94`) requires both `users.id`
and `users.clientId`. There is no unscoped UPDATE or DELETE on `clients`.
Adding a client is three INSERTs against unique `clients.slug` and
`users.email`, so it either inserts cleanly or fails loudly.

**5. Every client's full row is shipped to every other client's browser.** Fixed on this PR
(`8d7ffc6`, 2026-09-18): the layout now sends only the current client's six sidebar fields,
and Renaissance's sidebar is proven byte-identical (see the PR description).
`app/portal/[clientSlug]/layout.tsx:27` calls `getAllClients()` and passes the
result to `PortalSidebar`, which is a client component. `getAllClientsImpl`
(`lib/db/queries.ts:88`) is a `findMany` with `with: { users: true }` and no
column narrowing, so the serialized prop carries every client's jsonb configs,
shared password hash and env-var-name pointers, plus every user's email and
role. The sidebar reads only its own client (`portal-sidebar.tsx:24`), but React
serializes the whole prop regardless.

This is pre-existing and not introduced by this work. It matters here because
adding three clients pushes three more clients' configs into the browser of
every existing client, including Renaissance. Narrowing that prop is a strict
improvement rather than a change, but it touches a shared component on
Renaissance's render path, so it needs a decision and a drift check.

## Baseline

I took a pre-change snapshot of Renaissance before any of this work: the full
`clients` row in dev, staging and production plus its users, and a hash of every
tracked file that mentions Renaissance or decides what it renders.

It lives outside the repo, because the full snapshot carries a brand id and this
repo is public. A drift check re-runs it read-only and fails if the row or the
render path moved. I verified it in both directions: it passes on the true
baseline and names the exact file and exact field when either is altered.

**Known gap:** the baseline was built from files matching "renaissance" plus a
handful of shared ones. `date-range-picker.tsx` matches neither, so the checker
would not currently catch a change to it. I need to widen the baseline to cover
shared components on Renaissance's render path before any picker work starts.

**Also worth knowing: staging is not a faithful mirror of production.** Content
Impact is hidden in prod but visible on staging, and dev carries three extra
enabled reports. A no-op proven only on staging is weaker than it looks, so the
Renaissance proof runs against the production row.

## The outlines

Jasmine's three outlines arrived on 2026-09-18. All three remove Overview. Each
platform tab has the same six blocks, in this order:

| Block | What the outline asks for | Today |
|---|---|---|
| Commentary | Commentary for the tab | Exists (the shared Commentary part) |
| YTD Review | A year to date follower growth graph and a year to date views graph | Net new |
| Data | Tiles: Total Followers, Net New Followers, Views, Total Engagements, Engagement Rate, Profile Views, Video Views (Kenect: Profile Clicks instead of Video Views) | Exists as the platform headline tiles. Four rows do not work as written; that is Jasmine's question 6 |
| {Platform} Follower Growth Graph | "Needs to include annotations" | PR 252, waiting on Jasmine's question 9 |
| {Platform} Engagement Graph | "Needs to include annotations", plus engagement metrics "directly under": Likes, Comments, Shares, Saves, Reposts on Instagram; Reactions, Comments, Shares, Post Clicks on Facebook and LinkedIn; Likes, Comments, Shares, Reposts, Completion Rate on TikTok | Annotations: PR 252. The metrics directly under: net new, not scoped in any PR yet |
| Top Performing Content | Top posts for the tab | Exists. How many per tab is question 7; sponsored posts are question 8 |

Tabs per client:

- **A Place For Mom:** Instagram, Facebook, LinkedIn.
- **Joy of Life:** Instagram, Facebook, TikTok (TikTok is PR 247).
- **Kenect Nashville / Akara Living:** Instagram only, per the outline. The staging
  config for this client lists Instagram and Facebook, so the channel list is
  settled together with question 1.

So the net-new builds are three: annotations (PR 252), YTD Review, and the
engagement metrics under the engagement graph. Everything else is configuration
or wiring of parts that exist.

## Date picker

The rolling presets (Last 7 / 14 / 30 / 60 / 90 Days) are being replaced with
fixed periods so clients can view past months. A rolling window never freezes,
so what a client sees can move between building a report and presenting it.

Decided on 2026-09-17 and sent to Jasmine to confirm. The full record, with who
decided each and when, is section 7 of `docs/organic-social-snapshots.md` (PR 253):

- month and year only, not weeks or quarters
- the Organic Social team sees the current month live
- clients see only finished months, from the 12th of the next month (the Monday
  after when the 12th is a weekend)
- a month's numbers lock when it ends, so "snapshot" means genuinely frozen stored
  numbers, not a fixed window over live data
- the preset list becomes per-client config. Renaissance has none and falls
  through to today's exact list, byte identical

Worth noting that `top_content_snapshots`
(`lib/db/schema.ts:379`) is the only freeze table and `lib/organic-social/snapshot.ts`
is its only writer, so Organic Social top content is the one thing that freezes
today. Since these three clients are Organic Social only, the freeze machinery
they need may already exist.

## Still open

Waiting on Jasmine (her decisions for approval doc, by question number):

- 1: Kenect Nashville or Akara Living, and with it that client's channel list
- 2: how far back a client can look
- 6: the four Data rows that do not work as written
- 7: how many top posts per tab
- 8: whether sponsored posts count as top posts
- 9: what annotations mean (PR 252)
- 10: who logs in, and whether clients get access at launch

Engineering, mine to close:

- an absent channel allowlist must stop resolving to every channel before TikTok
  (PR 247) ships, per finding 1 above, without writing Renaissance's row
- who builds YTD Review and the metrics under the engagement graph, and in which PR

## How this ships

Three feature branches, one per client, each with its own PR, each reviewed
independently. This doc is deliberately separate so the client branches stay
reviewable on their own.
