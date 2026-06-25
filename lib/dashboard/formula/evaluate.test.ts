// Run: npx tsx lib/dashboard/formula/evaluate.test.ts
import { strict as assert } from 'node:assert'
import { parse } from './parse'
import { evaluate, DivByZeroError } from './evaluate'

const vals: Record<string, number> = { a: 1000, b: 200, c: 250 }
const resolve = (k: string) => vals[k]

// precedence + refs: a + b * 2 = 1000 + 400 = 1400
assert.equal(evaluate(parse('@a + @b * 2'), resolve), 1400)
// parens: (a - b) / c = 800/250 = 3.2
assert.equal(evaluate(parse('(@a - @b) / @c'), resolve), 3.2)
// constants only
assert.equal(evaluate(parse('0.8 * 10'), resolve), 8)
// division by zero throws sentinel
assert.throws(() => evaluate(parse('@a / 0'), resolve), (e: unknown) => e instanceof DivByZeroError)
// resolve callback errors propagate
assert.throws(() => evaluate(parse('@missing'), () => { throw new Error('boom') }))
// unary minus
assert.equal(evaluate(parse('-@a'), () => 5), -5)
assert.equal(evaluate(parse('@a + -1 * @b'), (k) => (k === 'a' ? 10 : 3)), 7) // 10 + (-1*3)
assert.equal(evaluate(parse('-1 * 0.8'), () => 0), -0.8)
assert.equal(evaluate(parse('@a - -@b'), (k) => (k === 'a' ? 5 : 2)), 7)      // 5 - (-2)
console.log('ok')
