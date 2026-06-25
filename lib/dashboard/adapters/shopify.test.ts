// Run: npx tsx lib/dashboard/adapters/shopify.test.ts
import { strict as assert } from 'node:assert'
import { resolveShopifyCreds } from './shopify'

// slug → env var convention: SHOPIFY_SHOP_<SLUG> / SHOPIFY_ADMIN_TOKEN_<SLUG> (uppercase, - → _)
assert.deepEqual(
  resolveShopifyCreds('kind-patches', {
    SHOPIFY_SHOP_KIND_PATCHES: 'bright-patches.myshopify.com',
    SHOPIFY_ADMIN_TOKEN_KIND_PATCHES: 'shpca_x',
  }),
  { shop: 'bright-patches.myshopify.com', token: 'shpca_x' },
)

// missing token → null
assert.equal(resolveShopifyCreds('kind-patches', { SHOPIFY_SHOP_KIND_PATCHES: 's' }), null)
// missing shop → null
assert.equal(resolveShopifyCreds('kind-patches', { SHOPIFY_ADMIN_TOKEN_KIND_PATCHES: 't' }), null)
// neither → null
assert.equal(resolveShopifyCreds('kind-patches', {}), null)

console.log('ok')
