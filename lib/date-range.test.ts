import { strict as assert } from 'node:assert'
import { resolveDateRange } from './date-range'

// last_N_days: exactly N days, ending YESTERDAY (Google Ads convention).
{
  const { startDate, endDate } = resolveDateRange('last_14_days')
  const s = new Date(`${startDate}T00:00:00`), e = new Date(`${endDate}T00:00:00`)
  const days = Math.round((e.getTime() - s.getTime()) / 86_400_000) + 1
  assert.equal(days, 14)
  const yesterday = new Date(); yesterday.setHours(0, 0, 0, 0); yesterday.setDate(yesterday.getDate() - 1)
  assert.equal(endDate, yesterday.toISOString().slice(0, 10))
}

// custom passthrough
{
  const r = resolveDateRange('custom:2026-01-01,2026-01-31')
  assert.equal(r.startDate, '2026-01-01')
  assert.equal(r.endDate, '2026-01-31')
}

// period-to-date presets start on the 1st (and still run through today)
{
  const r = resolveDateRange('this_month')
  assert.ok(/^\d{4}-\d{2}-01$/.test(r.startDate))
}

console.log('ok')
