import type { Ast } from './parse'

export class DivByZeroError extends Error {
  constructor() {
    super('division by zero')
    this.name = 'DivByZeroError'
  }
}

/** Evaluate an AST. `resolve(key)` supplies each operand's numeric value (it may
 *  throw to signal an unresolved operand). `÷ 0` throws DivByZeroError. */
export function evaluate(ast: Ast, resolve: (key: string) => number): number {
  switch (ast.n) {
    case 'num': return ast.v
    case 'ref': return resolve(ast.key)
    case 'neg': return -evaluate(ast.operand, resolve)
    case 'bin': {
      const l = evaluate(ast.l, resolve)
      const r = evaluate(ast.r, resolve)
      switch (ast.op) {
        case '+': return l + r
        case '-': return l - r
        case '*': return l * r
        case '/':
          if (r === 0) throw new DivByZeroError()
          return l / r
        default: throw new Error('unknown operator')
      }
    }
    default: throw new Error('unknown formula node')
  }
}
