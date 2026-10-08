import { expect, test } from 'vitest'
import { render } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ExportModeProvider } from '@/components/export/export-mode'
import { FixListTable } from './technical-audit-tables'

// PDF export (spec 2026-10-08 §6): the fix list's title stays with the first rows of its table.
test("in the export the fix list's title is kept with its table", () => {
  const { container } = render(<TooltipProvider><ExportModeProvider><FixListTable rows={[]} hasDelta={false} errorPageHits={null} /></ExportModeProvider></TooltipProvider>)
  const head = container.querySelector('[data-export-keep-with-next]')
  expect(head?.textContent).toContain('What should SEO and dev fix next?')
  expect(container.querySelector('[data-export-table]')).not.toBeNull()
})
