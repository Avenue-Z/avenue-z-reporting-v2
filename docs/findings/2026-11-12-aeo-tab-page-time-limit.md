# Finding: does a cold YTD AEO pull fit the report page's time limit?

Date: 2026-11-12. Scratch trial for the AEO Informed Social tab spec
(`docs/superpowers/specs/2026-11-12-aeo-informed-social-tab-design.md`, section 4).

## Question

A live YTD or All time pull from Peec took 39 to 55 seconds on 2026-11-09. Does the report page get enough time to
finish one cold, or does it need the warmer to stay alive?

## What I checked (read only)

- Vercel project settings: Fluid compute is on, and no project-wide default timeout is set
  (`functionDefaultTimeout` unset).
- Vercel's docs for Fluid compute on Pro: 300 seconds by default, 800 maximum.
- The production deployment itself (`vercel inspect`, production, READY): 95 functions. 89 run at 300 seconds and
  6 at 60. The six at 60 are the routes that set `maxDuration = 60` themselves, for example
  `app/api/export/pdf/route.ts:15`, `app/api/health/sweep/route.ts:36` and `app/api/aeo-outbound/projects/route.ts:11`.
  The report pages set no `maxDuration`, so they get the 300 second default.

## What it settled

- Page renders: a cold YTD or All time pull (55 seconds at worst) fits inside 300 seconds with room to spare. The page
  passes the adapter a 120 second `deadlineMs`: about twice the slowest run seen, and well under the limit, so a
  stuck Peec call ends as the section's error card, never a dead page.
- PDF export: 60 seconds for the route and a 40 second ready budget, so a cold YTD can't fit. The export keeps its
  30 second `deadlineMs`, and the hourly warmer keeps the views a client sees warm.
- Health sweep: its own 60 second limit covers fetching many pages, so the AEO tab stays out of the sweep for now
  (the spec already lists it as a follow-up).
