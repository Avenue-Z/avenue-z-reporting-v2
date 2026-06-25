import { strict as assert } from 'node:assert'
import { citationTotalsByModel, sumModelMap } from './by-model'

const map = {
  'me.com':    { ChatGPT: 10, Gemini: 5 },
  'other.com': { ChatGPT: 20, Gemini: 0, Claude: 7 },
}
const { totalByModel, yourByModel } = citationTotalsByModel(map, (d) => d === 'me.com')
assert.equal(totalByModel.ChatGPT, 30)        // 10 + 20
assert.equal(totalByModel.Gemini, 5)          // 5 + 0
assert.equal(totalByModel.Claude, 7)          // 0 + 7
assert.equal(yourByModel.ChatGPT, 10)         // only me.com
assert.equal(yourByModel.Gemini, 5)
assert.equal(yourByModel.Claude ?? 0, 0)      // me.com has no Claude

assert.equal(sumModelMap(totalByModel, ['ChatGPT']), 30)
assert.equal(sumModelMap(totalByModel, ['ChatGPT', 'Gemini']), 35)
assert.equal(sumModelMap(totalByModel, null), 42)   // 30 + 5 + 7 across all models
assert.equal(sumModelMap(yourByModel, ['Claude']), 0)

console.log('ok')
