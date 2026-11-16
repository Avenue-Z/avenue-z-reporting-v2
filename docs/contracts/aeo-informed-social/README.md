# AEO Informed Social: data contract

A [contract-core](https://github.com/Avenue-Z/data-contract) contract (format v0.7.0) for the boundaries of `lib/organic-social/aeo-informed/`: six raw Peec responses, one normalized input and five outputs. Every boundary is in `observe` mode.

- **Generated, not hand-written.** Everything in this folder except this README is generated from `lib/organic-social/aeo-informed/contract.ts` by `npx tsx scripts/gen-aeo-contract.ts`. `contract-yaml.test.ts` fails in CI if a file is edited by hand, differs from the generated one, or a stray file appears. Change `contract.ts`, run the script, commit both.
- **Enforced in the app, in TypeScript.** contract-core is a Python library, so it cannot run in this repo. The same shapes are enforced by `lib/organic-social/aeo-informed/gate.ts` (every output, plus cross-checks) and `shape.ts` (every Peec response), and `contract.test.ts` proves the parsers reject what the raw contracts forbid. The YAML exists so a Python run can lint the same shapes.
- **Where the Peec shapes come from.** Peec's live OpenAPI (`GET https://api.peec.ai/customer/v1/openapi/json`, read 2026-11-09), not memory. The output shapes mirror `SocialsRow`, `GapRow` and `GraphPoint`.
- **Checked** with contract-core v0.7.0 (Python 3.13 or newer): `contract lint --contract contract.yaml --schemas schemas` passes (12 boundaries). In a scratch copy set to `enforce`, a spec-shaped sample passes and a missing field, a stringified number, a renamed `data` key, a non-list `mentioned_brands`, a negative percentage, a rank of 0 and an unknown unit are each rejected. `contract reconcile` was not run: it needs decorated Python code, and there is none.

Not covered by the contract: which rows are ours and how numbers are derived (see `lib/organic-social/aeo-informed/ENGINEERS.md`), and the cross-checks between fields (the gate rules, listed there).
