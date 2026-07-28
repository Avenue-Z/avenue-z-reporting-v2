// Some tests import server modules that construct the Neon client at load time.
// The Neon serverless client does not open a connection at construction, only on
// an actual query, and unit tests never run a real query, so a dummy URL here
// lets those imports succeed without connecting to anything.
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test'

import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

// Several report-section parts (e.g. organic-social) transitively import the DataTable display
// chain, which reaches `@/auth` -> next-auth -> a bare `next/server` import that Vitest's ESM
// resolver can't satisfy (Next 16's package.json has no `exports` map for `./server`; real Next
// builds strip 'use server' actions from client bundles, so this never happens in prod). `@/auth`
// is reached through several paths (the dashboard/commentary server actions AND commentary/index
// directly), so a single global stub here is the clean chokepoint — narrowing to one import can't
// keep `@/auth` real and just becomes whack-a-mole (PR #168 review R1 #5).
//
// The default `auth` THROWS rather than returning `undefined`: a component that only imports the
// chain but never calls auth() (e.g. the organic-social goldens, which render Suspense fallbacks)
// is unaffected, while any test that actually exercises an auth path must provide a session
// (`auth.mockResolvedValue(...)` or a file-level vi.mock, as commentary/index.test.tsx does). This
// removes the blast radius the reviewer flagged — a forgotten session now fails LOUD, not green.
vi.mock('@/auth', () => ({
  auth: vi.fn(() => {
    throw new Error(
      'auth() is globally stubbed (vitest.setup.ts): provide a session for this test via ' +
      'auth.mockResolvedValue(...) or a file-level vi.mock(\'@/auth\', ...) before exercising authz.',
    )
  }),
}))
