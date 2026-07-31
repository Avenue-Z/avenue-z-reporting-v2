import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./', import.meta.url)) },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: [
      'lib/commentary/**/*.test.{ts,tsx}',
      'lib/report-sections/**/*.test.{ts,tsx}',
      'lib/profound/**/*.test.{ts,tsx}',
      'lib/pr-proof/matchback.test.ts',
      'lib/peec/citation-dates.test.ts',
      'lib/peec/models.test.ts',
      'lib/peec/scatter-window.test.ts',
      'lib/peec/url-citations.test.ts',
      'lib/ga4/format-speed.test.ts',
      'lib/organic-social/**/*.test.{ts,tsx}',
      'lib/dash-social/content.test.ts',
      'lib/linkedin-resolve/**/*.test.{ts,tsx}',
      'app/actions/**/*.test.{ts,tsx}',
      // Pinned file, not a glob: other components/charts/*.test.tsx are manual `npx tsx`
      // assertion scripts (console.log('ok')), not vitest suites — a glob would sweep them in.
      'components/charts/line-chart.test.tsx',
      'components/report-sections/**/*.test.{ts,tsx}',
    ],
    exclude: ['node_modules', '.next', 'scripts/**', '.claude/**'],
    globals: true,
  },
})
