// Some tests import server modules that construct the Neon client at load time.
// The Neon serverless client does not open a connection at construction, only on
// an actual query, and unit tests never run a real query, so a dummy URL here
// lets those imports succeed without connecting to anything.
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test'

import '@testing-library/jest-dom/vitest'
