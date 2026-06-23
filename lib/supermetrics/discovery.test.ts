// Run: npx tsx lib/supermetrics/discovery.test.ts
import { strict as assert } from 'node:assert'
import { parseFields, parseAccounts, smFields, smAccounts, parseDimensions, smDimensions, smDimensionValues } from './discovery'
import { SmQueryError } from './types'

const okFetch = (body: unknown): typeof fetch =>
  (async () => ({ ok: true, status: 200, json: async () => body }) as unknown as Response) as unknown as typeof fetch
const failFetch = (status: number): typeof fetch =>
  (async () => ({ ok: false, status, json: async () => ({}) }) as unknown as Response) as unknown as typeof fetch

async function main() {
  // parseFields: keep only ds_metric; map id/label/group/dataType
  {
    const opts = parseFields({ data: [
      { '@type': 'ds_dimension', field_id: 'date', field_name: 'Date', data_type: 'string.time.date', group_name: 'TIME' },
      { '@type': 'ds_metric', field_id: 'SocialSpend', field_name: 'Social spend', data_type: 'float.currency.value', group_name: 'SPEND' },
    ] })
    assert.equal(opts.length, 1)
    assert.deepEqual(opts[0], { value: 'SocialSpend', label: 'Social spend', group: 'SPEND', dataType: 'float.currency.value' })
  }

  // parseAccounts: flatten connections, dedupe by id, flag closed, sort closed last
  {
    const opts = parseAccounts({ data: [
      { accounts: [
        { account_id: 'act_1', account_name: 'Avenue Z', group_name: '' },
        { account_id: 'act_2', account_name: 'Dead', group_name: 'CLOSED AND DISABLED ACCOUNTS' },
      ] },
      { accounts: [
        { account_id: 'act_1', account_name: 'Avenue Z', group_name: '' }, // dupe
        { account_id: 'act_3', account_name: 'Begin' },
      ] },
    ] })
    assert.deepEqual(opts.map((o) => o.value), ['act_1', 'act_3', 'act_2']) // closed last
    assert.equal(opts.find((o) => o.value === 'act_2')?.disabled, true)
    assert.equal(opts.find((o) => o.value === 'act_3')?.label, 'Begin')
  }

  // smFields/smAccounts use injected fetch
  {
    const f = await smFields('k', 'FA', okFetch({ data: [{ '@type': 'ds_metric', field_id: 'cost', field_name: 'Cost' }] }))
    assert.equal(f[0].value, 'cost')
    const a = await smAccounts('k', 'FA', okFetch({ data: [{ accounts: [{ account_id: 'act_9', account_name: 'Nine' }] }] }))
    assert.equal(a[0].value, 'act_9')
  }

  // non-ok throws SmQueryError
  await assert.rejects(smFields('k', 'FA', failFetch(403)), (e: unknown) => e instanceof SmQueryError)

  // --- dimensions + dimension values ---
  // parseDimensions keeps only ds_dimension
  {
    const dims = parseDimensions({ data: [
      { '@type': 'ds_metric', field_id: 'total_sales', field_name: 'Total sales' },
      { '@type': 'ds_dimension', field_id: 'order_shipping_country', field_name: 'Shipping country', group_name: 'GEO' },
    ] })
    assert.deepEqual(dims.map((d) => d.value), ['order_shipping_country'])
    assert.equal(dims[0].label, 'Shipping country')
  }

  async function dimMain() {
    // smDimensions via /query/fields
    const dims = await smDimensions('k', 'SHP', okFetch({ data: [
      { '@type': 'ds_dimension', field_id: 'order_shipping_country', field_name: 'Shipping country' },
      { '@type': 'ds_metric', field_id: 'total_sales', field_name: 'Total sales' },
    ] }))
    assert.deepEqual(dims.map((d) => d.value), ['order_shipping_country'])

    // smDimensionValues: SM sync response shape (header row + value rows); dedupe non-empty first column
    const vals = await smDimensionValues('k', 'SHP', 'acct1', 'order_shipping_country',
      { startDate: '2026-05-01', endDate: '2026-06-23' },
      { fetchImpl: okFetch({ meta: { status_code: 'SUCCESS' }, data: [['Shipping country'], ['United States'], ['Canada'], [''], ['United States']] }) })
    assert.deepEqual(vals, ['United States', 'Canada'])

    // unsafe column rejected
    await assert.rejects(smDimensionValues('k', 'SHP', 'a', 'bad col', { startDate: 'x', endDate: 'y' }, { fetchImpl: okFetch({}) }))
  }
  await dimMain()

  console.log('ok')
}
main()
