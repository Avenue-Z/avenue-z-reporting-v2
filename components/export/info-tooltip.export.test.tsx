import { expect, test } from 'vitest'
import { render } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { InfoTooltip } from '@/components/ui/info-tooltip'
import { ExportModeProvider } from './export-mode'

// A "?" that shows its text on hover does nothing on paper (spec 2026-10-08-pdf-export-all-reports-design §5).
test('a hover-only hint prints nothing in the export, and is unchanged on the live page', () => {
  const ui = <TooltipProvider><InfoTooltip text="What this means" /></TooltipProvider>
  expect(render(<ExportModeProvider>{ui}</ExportModeProvider>).container.textContent).toBe('')
  expect(render(ui).container.textContent).toBe('?')
})
