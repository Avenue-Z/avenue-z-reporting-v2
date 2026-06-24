export type Op = '+' | '-' | '*' | '/'

export type Ast =
  | { n: 'num'; v: number }
  | { n: 'ref'; key: string }
  | { n: 'bin'; op: Op; l: Ast; r: Ast }

export class FormulaError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FormulaError'
  }
}

type Tok =
  | { t: 'num'; v: number }
  | { t: 'op'; v: Op }
  | { t: 'lp' }
  | { t: 'rp' }
  | { t: 'ref'; key: string }

const REF_RE = /[A-Za-z_][A-Za-z0-9_]*/y
const NUM_RE = /\d+(\.\d+)?/y

export function tokenize(expr: string): Tok[] {
  const toks: Tok[] = []
  let i = 0
  while (i < expr.length) {
    const c = expr[i]
    if (c === ' ' || c === '\t' || c === '\n') { i++; continue }
    if (c === '(') { toks.push({ t: 'lp' }); i++; continue }
    if (c === ')') { toks.push({ t: 'rp' }); i++; continue }
    if (c === '+' || c === '-' || c === '*' || c === '/') { toks.push({ t: 'op', v: c }); i++; continue }
    if (c === '@') {
      REF_RE.lastIndex = i + 1
      const m = REF_RE.exec(expr)
      if (!m || m.index !== i + 1) throw new FormulaError(`bad reference at position ${i}`)
      toks.push({ t: 'ref', key: m[0] }); i = REF_RE.lastIndex; continue
    }
    if (c >= '0' && c <= '9') {
      NUM_RE.lastIndex = i
      const m = NUM_RE.exec(expr)
      if (!m) throw new FormulaError(`bad number at position ${i}`)
      toks.push({ t: 'num', v: Number(m[0]) }); i = NUM_RE.lastIndex; continue
    }
    throw new FormulaError(`unexpected character '${c}' at position ${i}`)
  }
  return toks
}

export function parse(expr: string): Ast {
  const toks = tokenize(expr)
  if (toks.length === 0) throw new FormulaError('empty formula')
  let pos = 0
  const peek = (): Tok | undefined => toks[pos]

  function parseExpr(): Ast {
    let left = parseTerm()
    for (;;) {
      const t = peek()
      if (t?.t === 'op' && (t.v === '+' || t.v === '-')) { pos++; left = { n: 'bin', op: t.v, l: left, r: parseTerm() } }
      else break
    }
    return left
  }
  function parseTerm(): Ast {
    let left = parseFactor()
    for (;;) {
      const t = peek()
      if (t?.t === 'op' && (t.v === '*' || t.v === '/')) { pos++; left = { n: 'bin', op: t.v, l: left, r: parseFactor() } }
      else break
    }
    return left
  }
  function parseFactor(): Ast {
    const t = peek()
    if (!t) throw new FormulaError('unexpected end of formula')
    if (t.t === 'num') { pos++; return { n: 'num', v: t.v } }
    if (t.t === 'ref') { pos++; return { n: 'ref', key: t.key } }
    if (t.t === 'lp') {
      pos++
      const e = parseExpr()
      if (peek()?.t !== 'rp') throw new FormulaError('expected closing parenthesis')
      pos++
      return e
    }
    throw new FormulaError('expected a number, reference, or "("')
  }

  const ast = parseExpr()
  if (pos !== toks.length) throw new FormulaError('unexpected trailing tokens')
  return ast
}

export function operandKeys(expr: string): string[] {
  const keys = new Set<string>()
  for (const t of tokenize(expr)) if (t.t === 'ref') keys.add(t.key)
  return [...keys]
}
