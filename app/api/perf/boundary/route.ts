import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Fail closed in prod: returns 404 unless PERF_LOG=1 at module load.
// Same gate as lib/perf.ts — the route only exists when profiling is on.
const PERF_LOG_ENABLED = process.env.PERF_LOG === '1'

export async function GET(req: Request) {
  if (!PERF_LOG_ENABLED) {
    return new NextResponse('Not Found', { status: 404 })
  }

  const url = new URL(req.url)
  const label = url.searchParams.get('label') ?? 'unlabeled'

  console.log('PERF ' + JSON.stringify({
    ts: new Date().toISOString(),
    vendor: '_walk',
    fn: 'boundary',
    label,
    ms: 0,
    ok: true,
  }))

  return NextResponse.json({ ok: true, label })
}
