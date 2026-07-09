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
      'app/actions/**/*.test.{ts,tsx}',
      'components/report-sections/**/*.test.{ts,tsx}',
    ],
    exclude: ['node_modules', '.next', 'scripts/**', '.claude/**'],
    globals: true,
  },
})
