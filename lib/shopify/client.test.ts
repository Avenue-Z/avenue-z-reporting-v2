// Run: npx tsx lib/shopify/client.test.ts
import { strict as assert } from 'node:assert'
import { buildShopifyQl, sumFirstColumn, runShopifyQl, runShopifyQlTable, ShopifyQlError } from './client'

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })

async function run() {
  // buildShopifyQl appends the SINCE/UNTIL clause to a query body
  assert.equal(
    buildShopifyQl("FROM sales SHOW orders_first_time WHERE subscription_or_one_time = 'subscription'", '2026-06-09', '2026-06-15'),
    "FROM sales SHOW orders_first_time WHERE subscription_or_one_time = 'subscription' SINCE 2026-06-09 UNTIL 2026-06-15",
  )

  // sumFirstColumn sums the first column across rows; 0 on empty
  assert.equal(sumFirstColumn({ columns: [{ name: 'orders_first_time' }], rows: [{ orders_first_time: '3952' }] }), 3952)
  assert.equal(sumFirstColumn({ columns: [{ name: 'c' }], rows: [{ c: '10' }, { c: '5' }] }), 15)
  assert.equal(sumFirstColumn({ columns: [{ name: 'c' }], rows: [] }), 0)
  assert.equal(sumFirstColumn({ columns: [], rows: [] }), 0)

  // runShopifyQl: success path — header, URL, body shape + summed value
  {
    let captured: { url: string; init: RequestInit } | null = null
    const fetchImpl = (async (url: string, init: RequestInit) => {
      captured = { url, init }
      return ok({ data: { shopifyqlQuery: { parseErrors: [], tableData: { columns: [{ name: 'orders_first_time' }], rows: [{ orders_first_time: '3952' }] } } } })
    }) as unknown as typeof fetch
    const v = await runShopifyQl({ shop: 'bright-patches.myshopify.com', token: 'shpca_x', query: "FROM sales SHOW orders_first_time WHERE subscription_or_one_time = 'subscription'", startDate: '2026-06-09', endDate: '2026-06-15' }, { fetchImpl })
    assert.equal(v, 3952)
    assert.ok(captured!.url.includes('bright-patches.myshopify.com/admin/api/'))
    assert.ok(captured!.url.endsWith('/graphql.json'))
    assert.equal((captured!.init.headers as Record<string, string>)['X-Shopify-Access-Token'], 'shpca_x')
    const body = JSON.parse(captured!.init.body as string)
    assert.ok(body.query.includes('shopifyqlQuery'))
    assert.ok(body.variables.q.includes('SINCE 2026-06-09 UNTIL 2026-06-15'))
  }

  // parseErrors → ShopifyQlError
  {
    const fetchImpl = (async () => ok({ data: { shopifyqlQuery: { parseErrors: ['bad field'], tableData: null } } })) as unknown as typeof fetch
    await assert.rejects(
      runShopifyQl({ shop: 's', token: 't', query: 'q', startDate: 'a', endDate: 'b' }, { fetchImpl }),
      (e: unknown) => e instanceof ShopifyQlError,
    )
  }

  // GraphQL top-level errors → ShopifyQlError
  {
    const fetchImpl = (async () => ok({ errors: [{ message: 'nope' }] })) as unknown as typeof fetch
    await assert.rejects(
      runShopifyQl({ shop: 's', token: 't', query: 'q', startDate: 'a', endDate: 'b' }, { fetchImpl }),
      (e: unknown) => e instanceof ShopifyQlError,
    )
  }

  // HTTP error → ShopifyQlError
  {
    const fetchImpl = (async () => new Response('forbidden', { status: 403 })) as unknown as typeof fetch
    await assert.rejects(
      runShopifyQl({ shop: 's', token: 't', query: 'q', startDate: 'a', endDate: 'b' }, { fetchImpl }),
      (e: unknown) => e instanceof ShopifyQlError,
    )
  }

  // runShopifyQlTable returns the raw TableData (columns + rows), not a scalar
  {
    const fetchImpl = (async () => ({
      ok: true,
      json: async () => ({ data: { shopifyqlQuery: { parseErrors: [], tableData: {
        columns: [{ name: 'sales_channel' }, { name: 'net_sales' }],
        rows: [{ sales_channel: 'Online Store', net_sales: '100.5' }, { sales_channel: 'TikTok', net_sales: '40' }],
      } } } }),
    })) as unknown as typeof fetch
    const td = await runShopifyQlTable(
      { shop: 's.myshopify.com', token: 't', query: 'FROM sales SHOW net_sales GROUP BY sales_channel', startDate: '2026-05-01', endDate: '2026-05-31' },
      { fetchImpl },
    )
    assert.equal(td.columns.length, 2)
    assert.equal(td.rows.length, 2)
    assert.equal(td.columns[0].name, 'sales_channel')
  }

  console.log('ok')
}
run().catch((e) => { console.error(e); process.exit(1) })
