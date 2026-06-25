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
// deeply nested parens collapse to the inner node
assert.deepEqual(parse('(((@a)))'), { n: 'ref', key: 'a' })
// parse rejects malformed
assert.throws(() => parse(''), (e: unknown) => e instanceof FormulaError)          // empty
assert.throws(() => parse('(@a + @b'), (e: unknown) => e instanceof FormulaError)  // unbalanced
assert.throws(() => parse('@a +'), (e: unknown) => e instanceof FormulaError)      // dangling op
assert.throws(() => parse('@a @b'), (e: unknown) => e instanceof FormulaError)     // trailing
assert.throws(() => parse('@'), (e: unknown) => e instanceof FormulaError)         // bad ref
// unary minus
assert.deepEqual(parse('-@a'), { n: 'neg', operand: { n: 'ref', key: 'a' } })
assert.deepEqual(parse('-1 * @b'), { n: 'bin', op: '*', l: { n: 'neg', operand: { n: 'num', v: 1 } }, r: { n: 'ref', key: 'b' } })
// negative term mid-expression parses (was previously a "+ -" error)
{
  const ast = parse('@a + -1 * @b') as Extract<Ast, { n: 'bin' }>
  assert.equal(ast.op, '+')
  assert.equal((ast.r as Extract<Ast, { n: 'bin' }>).op, '*')
}
// binary minus then unary minus: a - (-b)
{
  const ast = parse('@a - -@b') as Extract<Ast, { n: 'bin' }>
  assert.equal(ast.op, '-')
  assert.equal((ast.r as Extract<Ast, { n: 'neg' }>).n, 'neg')
}
// a lone '-' is still an error
assert.throws(() => parse('-'), (e: unknown) => e instanceof FormulaError)
console.log('ok')
