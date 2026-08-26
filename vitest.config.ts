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
      'lib/paid-media/**/*.test.{ts,tsx}',
      'lib/profound/**/*.test.{ts,tsx}',
      'lib/pr-proof/matchback.test.ts',
      'lib/peec/citation-dates.test.ts',
      'lib/peec/models.test.ts',
      'lib/peec/scatter-window.test.ts',
      'lib/peec/url-citations.test.ts',
      'lib/ga4/format-speed.test.ts',
      'lib/ga4/order-by.test.ts',
      'lib/concurrency.test.ts',
      'lib/meta/kpis.test.ts',
      'lib/meta/creative.test.ts',
      'lib/salesforce/num.test.ts',
      'lib/salesforce/resolve-compare-iso.test.ts',
      'lib/salesforce/pipeline.test.ts',
      'lib/salesforce/pipeline.orchestration.test.ts',
      'lib/salesforce/contacts.test.ts',
      'lib/salesforce/configured.test.ts',
      'lib/salesforce/base.timeout.test.ts',
      'lib/supermetrics/client.retry.test.ts',
      'lib/linkedin/kpis.dash.test.ts',
      // Paid Search regression guards (converted from node:assert scripts): the
      // item-10 no-cap keyword guard + the exact-cents CPL (items 11c/11d). The
      // other lib/paid-search/*.test.ts files are still node-assert tsx scripts,
      // pinned individually here rather than via a glob so those aren't swept in.
      'lib/paid-search/kpis.test.ts',
      'lib/paid-search/keywords.test.ts',
      'lib/paid-search/campaigns.test.ts',
      'lib/organic-social/**/*.test.{ts,tsx}',
      'lib/dash-social/content.test.ts',
      'app/actions/**/*.test.{ts,tsx}',
      // Pinned file, not a glob: other components/charts/*.test.tsx are manual `npx tsx`
      // assertion scripts (console.log('ok')), not vitest suites — a glob would sweep them in.
      'components/charts/line-chart.test.tsx',
      'components/charts/kpi-card.test.tsx',
      'components/report-sections/**/*.test.{ts,tsx}',
    ],
    exclude: ['node_modules', '.next', 'scripts/**', '.claude/**'],
    globals: true,
  },
})
