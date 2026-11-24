# Review log: 2026-11-24-os-design-past-months.md

Review history lives here, never in the spec.

## Round 1 (2026-11-24): one fresh reviewer, the fixed checklist, whole spec

No BLOCKER. Every citation in the spec checked out.

**Fixed (MAJOR):**
1. "Absent means A" and "no served month means old" contradicted each other, and the boxes outside the locked-months
   branch always take the kit (`commentary/index.tsx:22`, `:66`). Fixed: one rule table in section 3, applied by the
   body, both box branches and the AEO tab; test 9.
2. "Byte for byte as today" assumed every kit pin replaced the version it wraps; `ytd-review@5` wraps only `@2` while
   `@1` to `@4` exist (`parts/registry.ts:34`). Fixed: the pin script refuses any other replacement; test 10.

**MINOR, for the plan (no further review round):**
3. The AEO section gets only `servedRange` (`aeo-informed/section.tsx:40-42`); name the month input it reads.
4. The boxes' no-month branch (`monthly.tsx:37-42`) now follows the rule table; spell it out in the plan's task.
5. "Logs once per render" cannot hold with three or four callers; log once per caller or memoise the parser.
6. The admin save accepts unpublished kit pins (`validate.ts:53`, `report-sections.ts:88`), which gives a client A
   with no `designFrom`. Accept as A, or block kit pins there.
7. Decision 2 cites Paul's item 6 but leaves out its second half: Recommendations stays on new months.
8. Test 6 cannot be byte-identical: the export header stamps the export time
   (`app/export/[clientSlug]/[section]/page.tsx`, `exportStamp`). Compare the report markup without the stamp.
9. Untested outputs: the malformed-setting log, the pin script's no-reporting-months refusal, the one-write of
   `designFrom` with the pins, and `SPLIT_BASIS` reading from the table.
