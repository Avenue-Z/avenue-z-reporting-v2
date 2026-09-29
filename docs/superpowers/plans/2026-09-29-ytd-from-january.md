# YTD Review from January 2026 (plan, not built; spec comes first)

From Jasmine's staging review, round 1: "We need this to be from Year to Date starting January 2026." Applies to the
outline clients. Renaissance does not use YTD Review.

## Today (origin/dev d4f4a42)
- `ytdConfig` reads `dash_social_config.reportingMonths` (`lib/organic-social/ytd.ts:31-36`). `ytdMonths` starts at
  the later of January and `firstMonth` (`:48-49`), so a client whose first reporting month is August sees August only.
- `YtdReviewSection` fires one `getOutlineKpis` per month, all at once, all or nothing
  (`parts/ytd-review.tsx:30`).
- A month where some metrics are null but not all is not `noData` (`outline-headlines.ts:31`), and each null becomes 0
  (`:35`), so the line drops to zero.

## What the fix must hold
1. **A separate YTD start key**, read only by `ytdConfig`, default `firstMonth` (today's behaviour). Never move
   `firstMonth` itself: the month picker lists every month back to it (`reporting-months.ts:165`), so that would open
   earlier months to clients.
2. **Percent changes clients already see must not move.** A locked month takes its comparison value from the prior
   month's lock when one exists (`locking-client.ts:107-111`, `priorParams` in `lock-day.ts`). Rendering January to July
   would lock July, and July's lock would then become August's baseline. Options, decided in the spec with a scratch
   trial on saved data: apply the locked baseline only when the prior month is on or after `firstMonth`, or never lock
   months before `firstMonth` and serve YTD history unlocked. The chosen option must keep every existing locked number
   identical.
3. **No request shape changes.** YTD, the Data block and the breakdown share one cached `getOutlineKpis` request
   (`outline-headlines.ts:60`), and the lock key hashes the exact request (`lock-day.ts:84`). A new shape would orphan
   every stored lock.
4. **Null months show as gaps**, never zeros (closes the CLAUDE.md follow-up "A single null metric still plots a zero on
   the YTD graphs", for the YTD block).
5. **A concurrency cap** on the per-month requests (closes "The YTD block fails all or nothing across up to 12
   requests").
6. In a new year YTD restarts in January, as her guide says. A floor key does that on its own.
7. Settled 2026-09-29: January to July appear on the YTD graphs only. Monthly reports clients can open still start
   at `firstMonth` (her guide: reports start with August 2026).

## Rollout
Set the start key on staging for the three outline clients, and for Piper and PIMCO when they are switched on. YTD
Review draws only on tabs with outline rows (`parts/ytd-review.tsx:20`), so a Piper X tab would show none.

## Process
Spec (measure, draft, two fresh-eyed review rounds at most), then this plan in full, then test-first code. Then set the
start key on staging for the outline clients with a guarded, dry-run script.

## Independence
- Touches `lib/organic-social/ytd.ts`, `parts/ytd-review.tsx`, the locked-baseline code, and the two YTD follow-ups in
  CLAUDE.md. No other open PR touches these files.
- Renaissance fingerprint before and after; a before and after of every stored August number for the outline clients.
