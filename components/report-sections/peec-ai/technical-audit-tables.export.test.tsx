import { expect, test } from 'vitest'
import { render } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ExportModeProvider } from '@/components/export/export-mode'
import { BotActivityTable, FixListTable } from './technical-audit-tables'

// PDF export (spec 2026-10-08 §6): the fix list's title stays with the first rows of its table.
test("in the export the fix list's title is kept with its table", () => {
  const { container } = render(<TooltipProvider><ExportModeProvider><FixListTable rows={[]} hasDelta={false} errorPageHits={null} /></ExportModeProvider></TooltipProvider>)
  const head = container.querySelector('[data-export-keep-with-next]')
  expect(head?.textContent).toContain('What should SEO and dev fix next?')
  expect(container.querySelector('[data-export-table]')).not.toBeNull()
})

// Thomas, #350 technical-audit.tsx:377: the bot summary cards (passed in as `summary`) weren't a block, so a card that
// landed on a page edge could split across the break, unlike every other stat grid on the tab.
test('in the export the bot summary prints as one block', () => {
  const { container } = render(<TooltipProvider><ExportModeProvider>
    <BotActivityTable bots={[]} summary={<div data-probe="">Bot cards</div>} />
  </ExportModeProvider></TooltipProvider>)
  expect(container.querySelector('[data-probe]')?.closest('[data-export-block]')).not.toBeNull()
})
