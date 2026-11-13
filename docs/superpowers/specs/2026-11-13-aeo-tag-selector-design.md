# AEO Informed Social: filter on Jasmine's tag, and prove it

Status: draft, 2026-11-13. Builds on `2026-11-12-aeo-informed-social-tab-design.md`. Nothing on the page or in the PDF changes.

## Why

Jasmine selects what this tab covers by putting the "Organic Social" **source tag** on sources in Peec (outline P010). The tab
filters on Peec's "Organic Social" **domain classification** instead (`lib/organic-social/aeo-tab/load.ts:45`,
`selector: { name, via: 'classification' }`). The two select the same data today, measured, but nothing makes them stay the same:
a source tagged and not reclassified would be missed. The fix is to filter on the tag itself, so what she tags is by definition what
the tab shows, and to make that provable.

## Measured before writing (2026-11-13, read only; evidence in the private probes)

| Fact | Result | Source |
|---|---|---|
| Source tags in Renaissance's Peec project | exactly one, "Organic Social" | `aeo-tab-2026-11-13-tag-parity.mts` |
| Tag versus classification, 2026-01-22 to 2026-11-12, per URL per day | 28,993 rows, 7,395 URLs, 43,260 retrievals, 19,062 citations on both; 0 cells differ | same |
| The URL tag (outline P011) | 0 rows: no URL carries a URL tag | same |
| The adapter against the numbers in her PDF screenshots | 27 of 27 checks pass (classification) | `golden-run-live-readonly.mts` |
| The adapter's tag path | already exists: `GET /source-tags`, then `domain_tag_id in [id]` (`lib/organic-social/aeo-informed/index.ts:171-177`) | code |
| Which tag a result used | already recorded: `meta.selector` = name, via, Peec tag id (`index.ts:275`), kept when a month is stored (`aeo-tab/load.ts` `toTabResult`) | code |

## Changes

**C1. The tab filters on the tag.** `adapterInput` (`aeo-tab/load.ts`) passes `selector: { name: setting.selector, via: 'tag' }`.
The setting's selector name is unchanged (default "Organic Social", `aeo-tab/setting.ts:45`). The adapter's own default
(`index.ts:144`, classification) is not changed: the tab is its only app caller and passes the selector explicitly.

**C2. The tag must exist exactly once.** On the tag path the adapter throws `PeecSelectorError` when no source tag has the name (as
today, `index.ts:175`) **and** when more than one does (new; today `tags.find` silently takes the first). Message: `expected exactly
one source tag named "<name>", found <n>`. The tab already turns a thrown error into its error card and one log line (`failureOf`,
`aeo-tab/load.ts`); no number is shown.

**C3. Each result records when it was pulled.** The adapter adds `meta.pulledAt`: the ISO time the pull finished, from `input.now`
(default the real clock). It is stored with a locked month, so a read-only check can say for any stored month which tag it used
(`meta.selector`) and when it was pulled. New gate rule `meta.pulled-at` (error): a valid ISO time, not after the gate's clock.
Not shown anywhere.

**C4. Stored and cached answers pulled the old way are never served.**
- The lock key (`aeoLockKey`, `aeo-tab/data.ts:22`) gains `via: 'tag'`. Every stored AEO month is then one pulled through the tag.
  Production has no AEO lock rows; staging has 5 (Renaissance: October MoM, YTD, All time, MoM at min 3; September MoM), all from
  today's review. They become unreachable and recapture through the tag on their next view (identical data, measured). The key pin
  (`aeo-lock-key-pin.test.ts`) is updated deliberately.
- The two live caches (`aeo-tab/load.ts:66-67`) get `version: 'v2'` (`lib/cache.ts:33,114`), so an answer cached before the deploy
  (classification, no `pulledAt`) is never served after it.

**C5. The golden run is a required step.** Before the tab is switched on for any client in production, and on request, the private
golden run (`~/.claude/organic-social-work/os-x-aeo/golden-run-live-readonly.mts`) runs with `via: 'tag'` and must print `27 passed,
0 failed`. It stays private because it holds client figures; the repo records the rule, not the numbers
(`lib/organic-social/aeo-informed/ENGINEERS.md`, CLAUDE.md AEO follow-ups).

## Out of scope

Anything visible (Thomas, 2026-11-13: no dashboard additions). The URL tag (P011): it selects nothing today; noted, not built.
The data contract YAML: `meta` is not in it (`docs/contracts/aeo-informed-social/README.md`), so `CONTRACT_VERSION` stays 1.1.0.

## Inputs and outputs

| | In | Out |
|---|---|---|
| Adapter | `selector.via: 'tag'` from the tab | Same result shape plus `meta.pulledAt: string`; `meta.selector.via` = `'tag'`, `meta.selector.id` = the Peec tag id |
| Tab | unchanged URL params and setting | unchanged page and PDF |
| Lock store | key gains `via` | rows written as before |

## Failure behavior

| Case | Behavior |
|---|---|
| No tag named "Organic Social" (deleted or renamed in Peec) | `PeecSelectorError`, error card, one log line naming the error, never a number |
| Two tags with that name | same |
| The tag exists but no source carries it | empty tables, as today (`view.empty-socials` warning); not an error, a real state |
| `/source-tags` fails or times out | `AeoPullError`, error card, as today |
| `/source-tags` returns 1,000 rows (the limit) | `AeoPullError`, as today (`index.ts:173`) |
| A stored month from before this change | never read (key changed); recaptured through the tag |
| A cached answer from before the deploy | never read (cache version) |

## Edge cases

| # | Case | Expected |
|---|---|---|
| 1 | Tag name differs only in case ("organic social") | not a match; error card (exact names, as the classification path) |
| 2 | A client setting names another selector | that tag is used, exactly once, as for "Organic Social" |
| 3 | `now` before the pull's own clock | `pulledAt` is the pull's clock; the gate refuses a time after its own clock |
| 4 | January, MoM and YTD the same window | still two keys (the existing `compare` field), unaffected |

## Tests (written first)

- `index.test.ts`: the tag path filters on `domain_tag_id` with the tag's id and never calls `/classifications/domains`; two tags with
  the name throw `PeecSelectorError` before any report request; `meta.pulledAt` equals the injected clock as ISO.
- `gate.test.ts`: `meta.pulled-at` fires on a missing, malformed or future `pulledAt` (the catalog test requires every rule to fire).
- `aeo-tab/load.test.ts`: the adapter is called with `via: 'tag'`; both caches use version `v2`.
- `aeo-tab/data.test.ts`: the lock key changes with `via`; the lock capture uses `via: 'tag'`.
- `aeo-lock-key-pin.test.ts`: re-pinned on purpose, with the reason in the file.
- Live, read only, after the build: the golden run with `via: 'tag'` prints 27 passed; the tag parity probe still says identical.
