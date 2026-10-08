'use client'

import type { ReactNode } from 'react'
import { useExportMode } from '@/components/export/export-mode'

/** `client` in the PDF export, `live` on the page. A server part whose output depends on the viewer's role renders
 *  both, so a staff export prints what a client sees (#332's rule; the commentary box and the YTD notes do the same
 *  with data rather than markup). */
export function PrintAsClient({ live, client }: { live: ReactNode; client: ReactNode }) {
  return <>{useExportMode() ? client : live}</>
}
