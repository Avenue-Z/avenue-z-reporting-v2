// Run: npx tsx lib/dashboard/formula/parse.test.ts
import { strict as assert } from 'node:assert'
import { parse, tokenize, operandKeys, FormulaError, type Ast } from './parse'

// precedence: a + b * c  ->  a + (b*c)
{
  const ast = parse('@a + @b * @c')
  assert.deepEqual(ast, { n: 'bin', op: '+', l: { n: 'ref', key: 'a' }, r: { n: 'bin', op: '*', l: { n: 'ref', key: 'b' }, r: { n: 'ref', key: 'c' } } })
}
// parentheses override precedence: (a + b) * c
{
  const ast = parse('(@a + @b) * @c') as Extract<Ast, { n: 'bin' }>
  assert.equal(ast.op, '*')
  assert.equal((ast.l as Extract<Ast, { n: 'bin' }>).op, '+')
}
// constants are numeric literals
{
  assert.deepEqual(parse('0.8 * @r'), { n: 'bin', op: '*', l: { n: 'num', v: 0.8 }, r: { n: 'ref', key: 'r' } })
}
// left-assoc subtraction: a - b - c -> (a-b)-c
{
  const ast = parse('@a - @b - @c') as Extract<Ast, { n: 'bin' }>
  assert.equal(ast.op, '-'); assert.equal((ast.l as Extract<Ast, { n: 'bin' }>).op, '-'); assert.equal((ast.r as Extract<Ast, { n: 'ref' }>).key, 'c')
}
// operandKeys: unique refs
assert.deepEqual(operandKeys('(@a - @b) / @a').sort(), ['a', 'b'])
assert.deepEqual(operandKeys('1 + 2').sort(), [])
// tokenize rejects unknown chars
assert.throws(() => tokenize('@a & @b'), (e: unknown) => e instanceof FormulaError)
// parse rejects malformed
assert.throws(() => parse(''), (e: unknown) => e instanceof FormulaError)          // empty
assert.throws(() => parse('(@a + @b'), (e: unknown) => e instanceof FormulaError)  // unbalanced
assert.throws(() => parse('@a +'), (e: unknown) => e instanceof FormulaError)      // dangling op
assert.throws(() => parse('@a @b'), (e: unknown) => e instanceof FormulaError)     // trailing
assert.throws(() => parse('@'), (e: unknown) => e instanceof FormulaError)         // bad ref
console.log('ok')
