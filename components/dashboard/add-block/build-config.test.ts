// Run: npx tsx components/dashboard/add-block/build-config.test.ts
import { strict as assert } from 'node:assert'
import { buildBlockConfig, formatFromDataType, isDraftComplete, leafToBinding, type ManualDraft } from './build-config'

// leafToBinding: supermetrics + triplewhale
{
  assert.deepEqual(leafToBinding({ source: 'supermetrics', dsId: 'FA', metricField: 'SocialSpend', account: 'act_1' }),
    { source: 'supermetrics', dsId: 'FA', metricField: 'SocialSpend', account: 'act_1' })
  assert.deepEqual(leafToBinding({ source: 'triplewhale', metric: 'revenue' }),
    { source: 'triplewhale', metric: 'revenue' })
}

// buildBlockConfig: leaf (supermetrics)
{
  const d: ManualDraft = { kind: 'leaf', name: 'FB Spend', format: 'currency', leaf: { source: 'supermetrics', dsId: 'FA', metricField: 'SocialSpend', account: 'act_1' } }
  const cfg = buildBlockConfig(d)
  assert.equal('id' in cfg, false)
  assert.equal(cfg.name, 'FB Spend'); assert.equal(cfg.format, 'currency'); assert.equal(cfg.range, null)
  assert.equal(cfg.binding.source, 'supermetrics')
  if (cfg.binding.source === 'supermetrics') assert.equal(cfg.binding.metricField, 'SocialSpend')
}

// buildBlockConfig: aggregate (revenue / spend)
{
  const d: ManualDraft = { kind: 'aggregate', name: 'Blended ROAS', format: 'number', op: '/',
    left: { source: 'triplewhale', metric: 'revenue' },
    right: { source: 'supermetrics', dsId: 'FA', metricField: 'SocialSpend', account: 'act_1' } }
  const cfg = buildBlockConfig(d)
  assert.equal(cfg.binding.source, 'aggregate')
  if (cfg.binding.source === 'aggregate') {
    assert.equal(cfg.binding.op, '/')
    assert.equal(cfg.binding.left.source, 'triplewhale')
    assert.equal(cfg.binding.right.source, 'supermetrics')
  }
}

// formatFromDataType
{
  assert.equal(formatFromDataType('float.currency.value'), 'currency')
  assert.equal(formatFromDataType('float.percentage.value'), 'percent')
  assert.equal(formatFromDataType('int.value'), 'count')
  assert.equal(formatFromDataType('string.text.value'), 'number')
  assert.equal(formatFromDataType(undefined), 'number')
}

// isDraftComplete: name required; leaf/aggregate completeness
{
  assert.equal(isDraftComplete({ kind: 'leaf', name: '', format: 'number', leaf: { source: 'triplewhale', metric: 'revenue' } }), false)
  assert.equal(isDraftComplete({ kind: 'leaf', name: 'X', format: 'number', leaf: { source: 'supermetrics', dsId: 'FA', metricField: '', account: 'act_1' } }), false)
  assert.equal(isDraftComplete({ kind: 'leaf', name: 'X', format: 'number', leaf: { source: 'supermetrics', dsId: 'FA', metricField: 'SocialSpend', account: 'act_1' } }), true)
  assert.equal(isDraftComplete({ kind: 'aggregate', name: 'X', format: 'number', op: '/', left: { source: 'triplewhale', metric: 'revenue' }, right: { source: 'triplewhale', metric: '' } }), false)
}

// leafToBinding: triplewhale carries non-empty filters
{
  const b = leafToBinding({ source: 'triplewhale', metric: 'spend', filters: [{ column: 'channel', value: 'facebook-ads' }] })
  if (b.source === 'triplewhale') assert.deepEqual(b.filters, [{ column: 'channel', value: 'facebook-ads' }])
}
// empty/incomplete filter rows are dropped (no filters key)
{
  const b = leafToBinding({ source: 'triplewhale', metric: 'spend', filters: [{ column: '', value: '' }, { column: 'channel', value: '' }] })
  if (b.source === 'triplewhale') assert.equal(b.filters, undefined)
}
// no filters provided -> no filters key
{
  const b = leafToBinding({ source: 'triplewhale', metric: 'spend' })
  if (b.source === 'triplewhale') assert.equal(b.filters, undefined)
}

console.log('ok')
