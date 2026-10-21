# AEO Outbound: Executive Summary, and competitor domains in the gaps bullet (design)

Status: draft for review, 2026-10-21. Code cited at dev `5fedaa52`, read this session.

## 1. What Ryan asked (round 3, verbatim)

1. "Changing headline signal page title to Executive Summary"
2. "For the COMPETITOR DOMAIN GAPS: section on Competitive Visibility page, some of the domains listed were not
   competitors mentioned. Only include competitor domains"

The page swap, the Cited Sources rename and the bullet wording wait on his answer to my question 1; they are not here.

## 2. How it works today

**The headline label.** `PAGE_WORDS_V1.headline_label` is "Headline signal" (`config.ts:74`). New rows take page words
from `pageDefaults` (`slots.ts:76-78`, called at `generate.ts:101`); rows from before v1.1 fill missing words from
`PAGE_WORDS_V1` (`slots.ts:83`), which `v1-compat.test.ts` pins. It shows as the section label above the headline
(`render.ts:257`, uppercased by AIVx's `.exec-label`) and as menu item 01 (`render.ts:237`). It is a per-row editable
slot; it is not a setting.

**The gaps list.** `buildSnapshotData` computes `gapDomains` (`metrics.ts:247-260`): rows with retrieved chats above 0
(`:253`), not classified `COMPETITOR` or `OWN` and not any roster brand's site (`:254`), whose `mentioned_brands`
include a roster competitor and not the own brand (`:255-256`), top 4 by `retrieved_chat_count` (`:258-259`). So it
lists third-party sites, never a competitor's own site: the spec of record says so on purpose ("A rival's own homepage
isn't a place the prospect can earn coverage", `docs/superpowers/specs/2026-10-08-aeo-outbound-snapshot-design.md:218`).
The list is printed:
- in the bullet "Competitor domain gaps: The largest gaps include {d1} at {n1} retrievals, ..." (`sentences.ts:195-198`);
- in the Data block Glean reads, "Competitor domain gaps (sites where competitors appear and the brand does not, by
  answers that used them): ..." (`prompt.ts:57`), for every row version; `v1-compat.test.ts:14-16` pins it for a
  version 1 row through `__fixtures__/v1-row.ts:64`;
- as allowed domains for grounding (`grounding.ts:131`).
Rows store their own `gapDomains`, so a draft made earlier keeps its list.

**Measured (2026-10-21, read only, all 33 PITCH projects with domain data, last 90 days):** competitors' own sites
(Peec `COMPETITOR` or a roster competitor's domain, not the brand's) exist on 32 of 33; those where the brand is not
mentioned exist on 31 of 33 (empty on PE Firms (Blue Owl), whose three competitor sites all mention the brand, and on
Paycom - Branded, which has none). PocketGuard: ynab.com, monarchmoney.com, copilot.money, actualbudget.org.

## 3. The changes

**E1. Executive Summary.** `pageDefaults` sets `headline_label: 'Executive Summary'` for new rows (Ryan's casing,
decision D2). `PAGE_WORDS_V1` is unchanged, so rows from before v1.1 and `v1-compat` are untouched. Existing drafts
keep the word stored on them; approved reports never change.

**E2. The gaps list holds competitors' own sites.** In `buildSnapshotData`, a row is a gap when all hold:
- `retrieved_chat_count` above 0 (unchanged);
- it is a competitor's own site: classified `COMPETITOR`, or its domain (lowercase, no `www.`) is a roster
  competitor's domain or a subdomain of one, the same match `isRosterSite` uses (`metrics.ts:249`) over non-own roster
  brands only;
- it is not the brand's own site: not classified `OWN` and not an own domain or subdomain (`ownMatch`,
  `metrics.ts:217-221`);
- its `mentioned_brands` do not include the own brand (decision D1: it stays a gap, as Ryan's heading says).
Top 4 by `retrieved_chat_count`, ties by domain, as today (`:258`). `DECISIONS.competitorSiteGaps` still switches it
off; its comment (`config.ts:9`) is updated.

**E3. Rows say which list they hold.** `SnapshotData` gains `gapKind?: 'competitor_sites'`, set on every new row;
`STORED_DATA` declares it `z.literal('competitor_sites').optional()`. The Data block line reads, when `gapKind` is set,
"Competitor domain gaps (competitors' own sites where the brand does not appear, by answers that used them): ...",
otherwise today's text. So Glean is told the truth about a new row, and every older row's Data block, grounding and
the version 1 pin are unchanged.

**E4. The bullet.** Lead and text unchanged: "Competitor domain gaps: The largest gaps include ...". No
`SENTENCES_VERSION` bump: the wording and rounding do not change, only the stored list does, and each row's sentence is
built from its own stored list.

## 4. Who sees it

New reports: "Executive Summary" and competitor sites. Drafts in flight and approved reports: unchanged. No
migration, no setting, no `PAGE_KEYS` change. Other round-3 PRs touch `pageDefaults` (#412) and the bullets (pending);
whichever merges second resolves the overlap.

## 5. Edge cases

| Case | Behaviour |
|---|---|
| No competitor site retrieved, or every one mentions the brand | `gapDomains` empty; the bullet is left out, as today (`sentences.ts:195`) |
| A competitor site classified CORPORATE by Peec | Counts, by the roster domain match |
| A COMPETITOR-classified site that is not on the roster | Counts, by Peec's class |
| The brand's own subdomain classified COMPETITOR | Never counts (own match wins) |
| No competitors tracked | Usually empty; a COMPETITOR-classified site still counts (Peec's class) |
| Competitor site with retrieved chats 0 or null | Never counts (unchanged) |
| A row made before this ships | Its stored list, its Data line, its bullet, unchanged |

## 6. Tests (written first)

| File | Proves |
|---|---|
| `slots.test.ts` | `pageDefaults` sets "Executive Summary"; `:140`'s expected object updated |
| `metrics.test.ts` | Competitor sites by class and by roster domain (and subdomain), own sites never, brand-mentioned never, zero chats never, top 4, `gapKind` set; `:239-262` rewritten for the new rule |
| `contracts.test.ts` | `STORED_DATA` accepts `gapKind` absent or `'competitor_sites'` only |
| `prompt.test.ts` | New wording with `gapKind`, old wording without; `v1-compat.test.ts` unchanged and passing |
| `sentences.test.ts` | `:36`'s live-shape gap list updated to the fixture's competitor sites |
| `grounding.test.ts` | A fresh new row has no flags |
| `config.test.ts` | Unchanged (`competitorSiteGaps` still true) |

## 7. Decisions for Thomas

- **D1.** Keep "the brand isn't mentioned there" (a true gap, Ryan's heading; empty on 2 of 33) or list competitor
  sites regardless (empty on 1 of 33). Recommended: keep it.
- **D2.** "Executive Summary" in Ryan's casing (my earlier call, approved), editable per report.

## 8. Not touched

`PAGE_WORDS_V1`, the bullet wording, the page order and titles, the pillars, the charts, the toggle, AIVx files.
