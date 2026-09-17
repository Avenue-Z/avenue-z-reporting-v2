# Reporting-outline: three Organic Social clients

Scope doc for the Reporting-outline deliverable. No code changes here. This
records what is fixed, what I have verified in the tree, and what is still open,
so the three client branches can be reviewed against something.

## What this is

I am adding three clients to the reporting platform and giving each its own
layout:

- A Place For Mom
- Joy of Life
- Akara Living

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

**5. Every client's full row is shipped to every other client's browser.**
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

## Date picker

The rolling presets (Last 7 / 14 / 30 / 60 / 90 Days) are being replaced with
fixed periods so clients can view past months. A rolling window never freezes,
so what a client sees can move between building a report and presenting it.

Direction so far, still open:

- calendar months only, not weeks or quarters
- the preset list becomes per-client config. Renaissance has none and falls
  through to today's exact list, byte identical

Not yet settled: whether "snapshot" means a fixed date window over live data, or
genuinely frozen stored numbers. Worth noting that `top_content_snapshots`
(`lib/db/schema.ts:379`) is the only freeze table and `lib/organic-social/snapshot.ts`
is its only writer, so Organic Social top content is the one thing that freezes
today. Since these three clients are Organic Social only, the freeze machinery
they need may already exist.

## Still open

- the layout outline per client: sections, order, what is hidden
- the channel list per client
- what "snapshot" means for the date picker
- whether to narrow the `getAllClients` prop before adding clients

## How this ships

Three feature branches, one per client, each with its own PR, each reviewed
independently. This doc is deliberately separate so the client branches stay
reviewable on their own.
