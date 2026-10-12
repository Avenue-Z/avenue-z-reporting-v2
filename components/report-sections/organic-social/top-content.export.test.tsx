import { expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ExportModeProvider } from '@/components/export/export-mode'
import { TopContent } from './top-content'

// Thomas, #352 data-table.tsx:83: each platform's table is now a block when it has 15 rows or fewer, so one that doesn't
// fit moves to the next page; its platform title must move with it, not end the previous page alone.
test("in the export each platform's title is kept with its table", () => {
  const row = { id: 1, caption: 'Post', platform: 'Instagram', sourceType: 'organic' as const, publishDate: '2026-09-01', views: 10, engagements: 2, url: null }
  render(<ExportModeProvider><TopContent groups={[{ platform: 'Instagram', rows: [row] }, { platform: 'LinkedIn', rows: [{ ...row, platform: 'LinkedIn' }] }]} /></ExportModeProvider>)
  for (const platform of ['Instagram', 'LinkedIn']) {
    expect(screen.getByText(platform, { selector: 'h3' }).hasAttribute('data-export-keep-with-next')).toBe(true)
  }
})
