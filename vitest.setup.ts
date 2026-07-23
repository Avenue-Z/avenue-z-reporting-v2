// Some tests import server modules that construct the Neon client at load time.
// The Neon serverless client does not open a connection at construction, only on
// an actual query, and unit tests never run a real query, so a dummy URL here
// lets those imports succeed without connecting to anything.
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test'

import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

// Several report-section parts (e.g. organic-social) transitively import the DataTable display
// chain, which reaches `@/auth` -> next-auth -> a bare `next/server` import that Vitest's ESM
// resolver can't satisfy (Next 16's package.json has no `exports` map; real Next builds strip
// 'use server' actions from client bundles, so this never happens in prod). Stub `@/auth`
// globally so any test importing such a component sidesteps the landmine — no per-file mock to
// forget. A test needing real/other auth behavior overrides this with its own file-level
// vi.mock (e.g. components/report-sections/commentary/index.test.tsx).
vi.mock('@/auth', () => ({ auth: vi.fn() }))
