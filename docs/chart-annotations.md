# Chart annotations: scope and the one design decision

Scope doc. No code changes.

## What is being asked for

All three new Organic Social client outlines (A Place For Mom, Joy of Life,
Kenect Nashville) ask for annotations on **both** the Follower Growth Graph and
the Engagement Graph, on **every** platform tab. That is roughly 14 annotated
charts across the three clients.

An annotation marks an event against a date on the chart. From a prior deck:

> 6/15 | @jinabaobina | Influencer collab post went live.

## What exists today

Nothing. The only annotation code in the repo is `kpiAnnotationColor` /
`KPI_ANNOTATION_CLASS` (`components/dashboard/blocks/kpi-annotations.tsx`), which
colors KPI tiles on the configurable dashboard. Different feature. Client chart
annotations are listed in this repo's Roadmap, not built.

So this is a net-new build, not configuration. It and YTD Review are the only two
items in the Reporting-outline deliverable that are.

## The design decision, and why it cannot wait

This work lands alongside locked months. Once a month closes, its numbers freeze
into `top_content_snapshots` and are served from storage forever
(`lib/organic-social/frozen.ts`, `lib/organic-social/snapshot.ts`). The whole
promise to the client is that a delivered number never moves again.

Annotations break that symmetry, because an annotation on a closed month may be
written or edited **after** the freeze. Someone reviewing August on the 5th of
September adds context that did not exist when the month closed on the 2nd.

Two options, and they are mutually exclusive:

1. **Annotation lives inside the frozen snapshot.** The locked month is genuinely
   immutable, chart and all. Cost: an annotation can never be added or corrected
   after the freeze, which is exactly when people write them.
2. **Annotation lives outside the snapshot**, joined on render. Annotations stay
   editable forever. Cost: a locked month's chart can still change, which weakens
   the guarantee we are making.

There is no version where both hold. This needs Paul before storage is built,
because retrofitting it means a migration on frozen data.

## Open, and not mine to settle

- Who authors an annotation, and whether clients see them at all. That is a
  question for Jasmine, and the storage design depends on the answer, so design
  for both rather than assuming one.
- Whether annotations render on the frozen chart, the live chart, or both.
- Which roles may write one. `lib/dashboard/permissions.ts` has the existing
  pattern to follow.

## Worth checking before inventing a table

`report_commentary` (`lib/db/schema.ts`) is already per client and per view, and
already has an approval flow. An annotation is a dated, much smaller sibling of
the same idea. Extending it may beat a new table, or may overload it. Decide
deliberately rather than by default.

## Renaissance

Renaissance is live in production in a client's hands and does not change, config
or rendered output. Annotations touch shared chart components on its render path,
so any change here has to be demonstrated as a no-op against the **production**
row before it merges.

One gap to close first: the existing drift baseline covers files that mention
Renaissance plus a few shared ones. It does not yet cover shared chart components.
Widening it is a prerequisite for this work, not a follow-up.
