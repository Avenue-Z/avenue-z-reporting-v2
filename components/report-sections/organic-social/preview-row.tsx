// The last look fixes, L5 (spec docs/superpowers/specs/2026-11-26-os-final-look.md): staff's "Preview as client" on every
// Organic Social tab. The same toggle the Social Listening tab has (social-listening/pills.tsx PreviewToggle, slview=client),
// right-aligned in the kit's row (as Social Listening's, social-listening/section.tsx:112), 28px above the tab (the
// artifact's .view margin-top, index.html:115). In the kit's colours on every tab: it is a new control with no old-look form.
// Staff only (the session's role); a client, no session or a failed read gets nothing. The PDF hides the row.
import { auth } from '@/auth'
import { viewerForRole } from '@/lib/organic-social/reporting-months'
import { PreviewToggle } from './social-listening/pills'
import kit from './design/kit.module.css'

export async function PreviewToggleRow({ on }: { on: boolean }) {
  let role: unknown
  try { role = (await auth())?.user?.role } catch { return null }
  if (viewerForRole(role) !== 'team') return null
  return (
    <div data-export-hide="" className={`${kit.root} ${kit.topics} mb-7`}>
      <span className={kit.spacer} />
      <PreviewToggle on={on} />
    </div>
  )
}
