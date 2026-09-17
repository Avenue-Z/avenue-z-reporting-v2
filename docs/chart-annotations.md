# Chart annotations: the mechanism

Scope doc. No code changes.

## What it is

On the Follower Growth and Engagement graphs, mark the days a piece of content
went live. Hovering or clicking a mark shows the creative and the date it was
posted. A show/hide control turns the marks off.

The point is answering "what caused that spike" without leaving the graph. Today
you read a peak off the chart, then go hunting through Top Performing Content, or
into Dash, to work out what ran that day.

This is the same move the hand-built decks already make. Their Follower Growth
and Engagement slides carry peak-day callouts with the post thumbnail inline, so
the reader sees the jump and the creative that caused it in one glance. We are
modelling that mechanism, not the slide.

**Not committing an example deck to this repo.** The example decks carry real
client figures and this repository is public. The mechanism is described here
instead.

## What already exists

Most of it. This is assembly, not invention.

- **The graph is already an interactive client component.**
  `components/report-sections/organic-social/trends.tsx` is `'use client'` and
  already holds toggle state: `useState<Set<string>>` over channels
  (`trends.tsx:26`), rendered as chips that switch series on and off. The
  show/hide control for annotations belongs in that same header row, using the
  same pattern.
- **Creative is already resolved.** `resolveCreative`
  (`lib/organic-social/creative.ts`) returns a ready `{ kind: 'image', thumb, full }`
  or `{ kind: 'video', src, poster }` from the post's top-level `image`/`video`.
  The CDN is public and unsigned, so no proxying or signing.
- **The publish date is already carried.** `source_created_at` on the post, which
  the CONTENT report returns alongside the creative in the same response. So one
  call gives both the mark's date and its picture.
- **Storage has a working precedent.** `report_commentary` is already per client,
  per view and per period, with a draft/approved lifecycle, an approver
  allowlist, soft deletes and a client-safe projection that strips author
  metadata. Renaissance runs it in production today: 18 entries, 17 approved and
  client-visible, six different authors, one approver.

## What needs building

1. **Marks on the chart.** The `LineChart` wrapper
   (`components/charts/line-chart.tsx`) takes `{ data, xKey, yKeys, height,
   valueFormat }` and hardcodes `dot={false}`. It exposes no way to add a
   reference dot or an overlay, so it needs a marker prop. Recharts 3.7 supports
   this directly; the wrapper does not pass it through yet.
2. **The hover card.** Creative, publish date, and a link to the post. The post
   card in Top Performing Content already renders exactly this content, so the
   presentation is settled; it needs a smaller variant anchored to a chart point.
3. **The show/hide control.** One more toggle beside the existing channel chips.
   Default state is a decision, not a technical question.
4. **Storage.** See below.

## Two kinds of mark, and they are not the same thing

Worth separating before anything is built, because they have different owners
and different storage.

- **Automatic.** Every post published in the window already has a date and a
  creative from the CONTENT call. Marking them needs no authoring and no
  storage at all. It is derived data.
- **Written.** An editorial note against a date, for example an influencer
  collaboration going live, or a platform change. Someone writes it, and it has
  to be stored and approved.

The automatic kind is nearly free and answers most of "what ran that day." The
written kind is the one that needs the commentary machinery. They could ship
separately, automatic first.

## The freeze question, mostly answered

A month's numbers freeze when it closes, but an annotation on that month may be
written or edited afterwards, because reviewing the month is when people write
them. So an annotation cannot live inside the frozen snapshot without becoming
uneditable.

Commentary already solved this. It lives outside the frozen numbers and is
joined at render, so an approved entry can be edited after a month closes without
disturbing the locked figures. Annotations should inherit that, which removes
the storage question I originally raised for Paul.

What is left for Paul is narrower: whether annotations extend `report_commentary`
with a date column, or get their own table keyed the same way. Extending reuses a
proven approval flow; a separate table avoids overloading a model built for prose.

## Open, and not mine to settle

- Who authors a written annotation, and whether clients see them. Proposed to
  Jasmine as "the same as Commentary", meaning anyone at Avenue Z writes, an
  approver publishes, and the client only ever sees approved ones.
- Whether the marks default to shown or hidden.
- Whether automatic marks ship on their own first.

## Renaissance

Renaissance is live in production in a client's hands and does not change, config
or rendered output. Annotations touch `trends.tsx` and the `LineChart` wrapper,
both of which are on its render path, so this has to be demonstrated as a no-op
against the **production** row before it merges.

One gap to close first: the drift baseline covers files that mention Renaissance
plus a handful of shared ones. It does not yet cover shared chart components.
Widening it is a prerequisite for this work, not a follow-up.
