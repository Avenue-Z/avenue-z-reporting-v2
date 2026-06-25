// scripts/check-rsc-props.ts
// Guard against the React Server Components boundary bug where a Server Component
// passes a *function* as a prop to a Client Component (e.g. `<BarChart valueFormatter={usd} />`
// from a non-'use client' file). Functions can't be serialized across that boundary, so the
// page throws "Functions cannot be passed directly to Client Components" at render time —
// invisible to `tsc` and `next build` for dynamically-rendered routes.
//
// Server Actions (functions exported from a 'use server' module) ARE allowed to cross, so
// they're explicitly excluded.
//
// Run: npx tsx scripts/check-rsc-props.ts
import ts from 'typescript'
import path from 'node:path'

const cwd = process.cwd()
const configPath = ts.findConfigFile(cwd, ts.sys.fileExists, 'tsconfig.json')
if (!configPath) {
  console.error('tsconfig.json not found')
  process.exit(2)
}
const { config } = ts.readConfigFile(configPath, ts.sys.readFile)
const parsed = ts.parseJsonConfigFileContent(config, ts.sys, path.dirname(configPath))
const program = ts.createProgram(parsed.fileNames, parsed.options)
const checker = program.getTypeChecker()

/** True if a source file opens with a `'use client'` directive. */
function hasTopDirective(sf: ts.SourceFile, directive: string): boolean {
  for (const stmt of sf.statements) {
    if (ts.isExpressionStatement(stmt) && ts.isStringLiteralLike(stmt.expression)) {
      if (stmt.expression.text === directive) return true
    } else {
      break // directive prologue ends at the first non-string-literal statement
    }
  }
  return false
}

const isClientFile = (sf: ts.SourceFile) => hasTopDirective(sf, 'use client')
const isServerActionFile = (sf: ts.SourceFile) => hasTopDirective(sf, 'use server')

function resolveAlias(sym: ts.Symbol | undefined): ts.Symbol | undefined {
  if (sym && sym.flags & ts.SymbolFlags.Alias) return checker.getAliasedSymbol(sym)
  return sym
}

function typeIsFunction(type: ts.Type): boolean {
  if (type.getCallSignatures().length > 0) return true
  if (type.isUnion()) return type.types.some(typeIsFunction)
  return false
}

/** A function value is a legal Server Action if it's declared in a 'use server' module, or
 * is an inline function whose body opens with a 'use server' directive. */
function isServerAction(expr: ts.Expression): boolean {
  if (ts.isArrowFunction(expr) || ts.isFunctionExpression(expr)) {
    if (expr.body && ts.isBlock(expr.body)) {
      const first = expr.body.statements[0]
      if (first && ts.isExpressionStatement(first) && ts.isStringLiteralLike(first.expression)) {
        return first.expression.text === 'use server'
      }
    }
    return false
  }
  const sym = resolveAlias(checker.getSymbolAtLocation(expr))
  const decls = sym?.getDeclarations() ?? []
  return decls.some((d) => isServerActionFile(d.getSourceFile()))
}

const errors: string[] = []

for (const sf of program.getSourceFiles()) {
  if (sf.isDeclarationFile) continue
  if (sf.fileName.includes('/node_modules/')) continue
  if (sf.fileName.includes('/.claude/')) continue // throwaway worktree copies
  if (!sf.fileName.startsWith(cwd)) continue
  if (isClientFile(sf)) continue // Client Components may receive function props

  const visit = (node: ts.Node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName
      // Only component tags (Capitalized); DOM elements are lowercase.
      if (ts.isIdentifier(tag) && /^[A-Z]/.test(tag.text)) {
        const tagSym = resolveAlias(checker.getSymbolAtLocation(tag))
        const targetIsClient = (tagSym?.getDeclarations() ?? []).some((d) =>
          isClientFile(d.getSourceFile()),
        )
        if (targetIsClient) {
          for (const attr of node.attributes.properties) {
            if (
              ts.isJsxAttribute(attr) &&
              attr.initializer &&
              ts.isJsxExpression(attr.initializer) &&
              attr.initializer.expression
            ) {
              const expr = attr.initializer.expression
              const t = checker.getTypeAtLocation(expr)
              if (typeIsFunction(t) && !isServerAction(expr)) {
                const { line } = sf.getLineAndCharacterOfPosition(attr.getStart())
                const propName = ts.isIdentifier(attr.name) ? attr.name.text : attr.name.getText()
                errors.push(
                  `${path.relative(cwd, sf.fileName)}:${line + 1} — <${tag.text}> receives function prop "${propName}" from a Server Component (RSC boundary violation)`,
                )
              }
            }
          }
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
}

if (errors.length) {
  console.error('RSC boundary check FAILED:\n' + errors.map((e) => '  ✗ ' + e).join('\n'))
  console.error(
    '\nMove the function into the Client Component, or pass a serializable descriptor instead.',
  )
  process.exit(1)
}
console.log('RSC boundary check passed — no function props cross the server→client boundary.')
