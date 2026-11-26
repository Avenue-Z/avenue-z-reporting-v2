# Organic Social: the last look fixes (spec, 2026-11-26)

## Goal

The Organic Social tabs on the new look must match the approved artifact and the Social Listening tab with no difference.
The artifact is `claude.ai/artifact/Wa1yh2FgKLLjabYVXRRuw1` ("APFM Social Listening", saved copy read 2026-11-26; line
numbers below are from that copy, `index.html`). The Social Listening tab was built from it, so both are one design.

My calls (2026-11-26): fix the glow, the section spacing, the Add annotation button (#527) and the staff Insights frame, and
put "Preview as client" on every Organic Social tab for every client. Leave the month picker and AEO Informed's own
controls (N3) as they are. Everything waiting on Savannah (#540) is out of scope. Phase 3 (#539) has its own spec.

## Rules every change keeps

- **New look only.** Each change applies only where the kit look is already on: a served month on or after the client's
  `designFrom` (`kitActive`, `components/report-sections/organic-social/index.tsx:205`) or a part drawn with
  `look="kit"`. Every month before `designFrom`, every client without one, and Renaissance render byte-identical markup.
  The one exception is L5's toggle, which is staff-only and new (see L5).
- **Organic Social only.** No change to `app/layout.tsx`, `app/globals.css` or any other department's file (rule of
  2026-10-06). #487's body rule stays broken for other departments; that's their call.
- **Values come from the artifact.** Every colour, size and gap below is copied from the cited artifact line.
- **No change to data, requests, locks, saving or approval.** These are markup and CSS only, plus one role swap in L5.

## L1. The page glow (#487)

- **Artifact:** `body` background is two radial gradients over `--bg`, `background-attachment: fixed` (`index.html:35-43`):
  `radial-gradient(ellipse 60% 40% at 90% 100%, rgba(0,60,60,0.5) 0%, transparent 70%)`,
  `radial-gradient(ellipse 40% 30% at 80% 100%, rgba(30,0,80,0.4) 0%, transparent 60%)`.
- **Today:** `<body className="bg-glow">` (`app/layout.tsx:31`) uses `.bg-glow` (`app/globals.css:234-240`), which is invalid
  CSS (no commas, colour first), so no page has a glow (#487, measured `backgroundImage: none` on staging).
- **Change:** when the kit look is on, the tab renders one decorative element: fixed to the viewport, full size, behind the
  content, `aria-hidden`, `pointer-events: none`, carrying the artifact's two gradients exactly. Nothing on `body` changes.
  It renders on every kit tab: the platform, Overview and Influencer tabs (from `OrganicSocialBody`, under `kit`), the AEO
  Informed tab (under its own kit decision, `aeo-informed/section.tsx:87`), and the Social Listening tab (always kit). The
  server can't tell a PDF render on most tabs (only Social Listening is told, `export/report-element.tsx:47`), so the
  element carries `data-export-hide`, which the export page already hides (`app/export/export-theme.css:53`).
- **Unverified, so a scratch trial settles it first:** that a fixed element behind the content shows the glow without
  covering text or the sidebar, and that no ancestor's stacking context hides it. If it can't be done without touching
  `body`, I stop and bring it back.

## L2. Space between sections: 40px

- **Artifact:** `.view { display:flex; flex-direction:column; gap:40px }` (`index.html:115`); the kit has the same rule
  (`design/kit.module.css:57`). The Social Listening tab already uses it.
- **Today:** every Organic Social tab stacks the Insights box, every part and the Recommendations box in one
  `space-y-8` (32px) wrapper (`organic-social/index.tsx:87`). The boxes also carry `mb-8` (`commentary/commentary-panel.tsx:123,130`).
- **Change:** under the kit look, every gap between two blocks on the tab is 40px: Insights to the first part, part to
  part, last part to Recommendations. Only `OrganicSocialBody` knows whether the month is kit (`index.tsx:205`), and the
  outer wrapper must stay byte-identical for the old look, so the parts get a kit-only wrapper with the 40px gap, and the
  kit boxes and that wrapper carry 40px bottom margins that collapse with the outer 32px. Measured on the page, not assumed.
- **The AEO Informed tab** under its kit look stacks with `space-y-8` (`aeo-informed/section.tsx:89`); under the kit it
  takes the 40px gap too. Social Listening already uses the kit's 40px `.view` gap and doesn't change.
- **PDF:** the export uses the same components, so it gets the same spacing. Checked on the export page.

## L3. Add annotation and the note buttons (#527)

- **Artifact:** an add action is the plain small button with a leading "+": "+ Add post" is `.tbtn` (`index.html:1050`).
  The dashed `.tbtn.add-analysis` is only the empty analysis slot (`:221-223, 958`). The kit's `.tbtn` is
  `kit.module.css:187-189`.
- **Today:** under the kit, Add annotation is `kit.pill` with no `aria-pressed`, so it reads as an off toggle
  (`organic-social/trends.tsx:216-218`, `ytd-notes-panel.tsx:102-106`; Paul, #527). On Social Listening, Add annotation,
  Save draft and Cancel use the old look's `PILL` (`social-listening/notes-panel.tsx:15,72,157-158`).
- **Change:** under the kit, every Add annotation (the daily graphs, the YTD graphs, Social Listening's line graphs)
  becomes `kit.tbtn` labelled "+ Add annotation", as the artifact's "+ Add post". Social Listening's Save draft and Cancel, and its
  card buttons, take the same kit buttons the Organic Social notes got in round 3 (`control-look.ts`). The old look keeps
  "Add annotation" as `PILL`, byte-identical.

## L4. The staff Insights and Recommendations frame

- **Artifact:** staff see `.comm` (border `rgba(255,252,96,0.22)`, fill `rgba(255,252,96,0.035)`, yellow label;
  `index.html:217, 231`). A client, a preview and the PDF see the neutral frame and a muted label (`:226-227`).
- **Today:** the kit boxes give everyone the neutral frame (`commentary/commentary-kit.module.css:5`, chosen in #503); the
  label already turns muted for a non-editor (`commentary-panel.tsx:133`). Social Listening already does it the artifact's
  way (`social-listening/analysis.tsx:111`: `staff ? s.comm : s.comm + s.commClient`).
- **Change:** under the kit, an editor's box (`capabilities.canEdit`) gets the artifact's staff frame; everyone else, the
  export (`commentary-panel.tsx:264`) and a preview (L5) keep today's neutral frame. Same rule as Social Listening.

## L5. "Preview as client" on every Organic Social tab

- **Artifact:** a "Preview as client" button in the report header that hides every staff-only thing and draws boxes in the
  client frame (`index.html:224-229, 365, 1098-1101`).
- **Today, Social Listening only:** `slview=client` in the URL (`lib/organic-social/social-listening/params.ts:12-14`) makes
  the server render the tab as a client, with no email (`social-listening/section.tsx:78-79, 136`). The toggle is
  `PreviewToggle` (`social-listening/pills.tsx:42-52`), right-aligned in a row above the content (`section.tsx:112`). The
  page passes the flag to Social Listening only (`app/dashboard/[clientSlug]/reports/page.tsx:108`) and keys the Suspense
  on it for Social Listening only (`:357`).
- **Where staff and clients differ on the other tabs** (all read the role from one of two places):
  - the parts get `ctx.role` / `ctx.email` from `OrganicSocialBody` (`organic-social/index.tsx:105-112`): chart notes
    (`lib/organic-social/chart-notes/permissions.ts:15`), YTD notes (`parts/ytd-notes.ts:56`), designations
    (`lib/organic-social/designations/permissions.ts:7`), annotation hides (`lib/organic-social/annotation-hides/permissions.ts:6`),
    KPI Check-In's staff notes (`parts/kpi-check-in.tsx:48`), the AEO tab (`index.tsx:130`);
  - the Insights and Recommendations boxes read the session themselves (`commentary/index.tsx:24, 29, 34-35`), reached
    through `SharedPartsHeader` (`shared/shared-parts-header.tsx:22-37`).
- **Change:**
  - The page passes the flag to every Organic Social view, keeps it across its redirects (`page.tsx:259`, the same for the
    portal), and adds it to every Organic Social Suspense key so a preview remounts the tab's per-view state.
  - With the flag, a staff viewer, and not exporting: `OrganicSocialBody` hands every part `role: 'CLIENT_VIEWER'` and no
    email, and `SharedPartsHeader` passes a preview flag that makes the boxes render as a client (client role, no email).
  - The locked month is still resolved with the real role, as Social Listening does (`index.tsx:139`): staff can preview
    any month they can open. A client role with the flag sees no change (it already is the client view).
  - The boxes resolve their month with the real role too, and only their rights are a client's. Today a box resolves its
    own month from the role it is given (`commentary/monthly.tsx:31-36`), so handing it a client role would show a
    different month from the parts, or nothing, on a month a client can't see yet. In a preview the box keeps the real
    role for `lockedRangeFor` and gets client rights (no edit, no approve, approved entries only, client frame).
  - **Deep-link routes** render the tab too (`app/dashboard/[clientSlug]/reports/[reportSlug]/page.tsx:82`,
    `app/portal/[clientSlug]/reports/[reportSlug]/page.tsx:100`). They parse `slview` and pass it the same way, so the
    toggle works there.
  - The toggle is `PreviewToggle`, unchanged, right-aligned at the top of every Organic Social tab for staff, in the kit
    look on every tab (it is a new control with no old-look form). Never in the PDF (`useExportMode`).
- **Renaissance:** its staff view gains the toggle (my call: every client). Renaissance's client view and its PDF stay
  byte-identical, and its numbers and requests don't change.

## Edge cases

| Case | Result |
|---|---|
| Old-look month (before `designFrom`), or no `designFrom` | L1 to L4 change nothing. L5's toggle shows; preview works. |
| Export (PDF) | No glow, no toggle, client frame; spacing as on screen. A preview flag in an export URL is ignored. |
| Client viewer with `slview=client` | Ignored, same page as today. |
| Preview, then Back to editing | Staff view returns; per-view state starts fresh (new Suspense key). |
| Preview on a month a client can't see yet | Shows that month as a client would, as on Social Listening today. |
| Session read fails | Client rules already (`index.tsx:105-111`); toggle not shown. |
| A tab with no Insights opt-in | Only the 40px between parts applies. |

## Tests (written first, each seen failing)

1. Old look and Renaissance: snapshot markup of every Organic Social tab's old look, recorded on dev before any change,
   still matches (the round 3 pattern: `controls-kit.test.tsx`, `commentary-kit.test.tsx`).
2. L1: the glow element renders only under the kit and not exporting, with the artifact's two gradients and fixed
   attachment; never on the old look; hidden in the export.
3. L2: under the kit, the parts wrapper and both boxes carry the 40px rules; the old look's wrapper is the fragment it is today.
4. L3: every Add annotation under the kit is `tbtn addAnalysis` with "+ Add annotation"; Social Listening's buttons are kit
   buttons; the old look keeps `PILL` and "Add annotation".
5. L4: editor gets the staff frame, non-editor, export and preview get the neutral frame; old look unchanged.
6. L5: with the flag, every role consumer listed above receives a client role and no email (one test per consumer path);
   the boxes render client output; the toggle shows for staff on every view and never for a client or in the export; the
   flag reaches every Organic Social view and every Suspense key; a client with the flag sees today's page.
7. Department gate: no file outside Organic Social, commentary, `components/report-sections/shared/` (L5's preview flag on
   `SharedPartsHeader` and `SharedCtx`) and the four report pages (two SPA, two deep-link) changes. The shared header is
   used by other departments (paid media, LinkedIn, Meta, paid search, Peec pages), so a test renders their boxes with no
   flag and pins them byte for byte; other departments' export requests are byte for byte the same.

## Acceptance (on the local app against the dev database, before Paul)

Re-run the side-by-side measurement (`11-24-artifact-side-by-side.md`'s script) on an Organic Social kit month, the Social
Listening tab and the artifact. Every shared element must match: glow, section gap, line height, buttons, the staff and
client Insights frames, the preview. The measurement also records every chart's rendered size (each donut, line, bar and
column chart, and every icon SVG) before and after, so a chart that grows, shrinks or stretches fails the check. September (old look) and Social Listening must be element-for-element unchanged
except where L1 (its glow) and L3 (its note buttons) deliberately change it. Screenshots go only in Paul's Slack message.

## Out of scope

Phase 3 (#539, own spec). Month picker and AEO Informed's own controls (N3). Tooltips, industry appendix, November export
(#540). Tiles per row (data, not style). #487's body rule for other departments.
