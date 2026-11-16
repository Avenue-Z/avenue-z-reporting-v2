// lib/organic-social/aeo-informed/inspect.ts
// For tests and probes only. Runs the same build as getAeoInformedSocial but returns the UNGATED result, the raw rows it came from, and the gate's
// violations, so a test can corrupt a result and check the gate catches it. A view must not import this: its result may be wrong.
import { buildAeoInformed, type AeoInformedInput } from './index'
import { runGate, GATE_RULES, type GateInput, type GateRaw, type GateReport, type GateViolation } from './gate'

export type Inspected = { result: GateInput; raw: GateRaw; violations: GateViolation[]; report: GateReport }

export async function inspectAeoInformedSocial(input: AeoInformedInput): Promise<Inspected> {
  const { draft, raw } = await buildAeoInformed(input)
  const violations = runGate(draft, raw)
  return {
    result: draft,
    raw,
    violations,
    report: { rulesChecked: GATE_RULES.length, errors: violations.filter((v) => v.severity === 'error'), warnings: violations.filter((v) => v.severity === 'warning') },
  }
}
