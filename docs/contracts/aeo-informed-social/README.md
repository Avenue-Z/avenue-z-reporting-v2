# AEO Informed Social: data contract

A [contract-core](https://github.com/Avenue-Z/data-contract) contract (format v0.7.0) for the Peec boundaries behind `lib/organic-social/aeo-informed/`: six raw Peec responses, one normalized input and
five outputs. Every boundary is in `observe` mode.

- **Design copy, not the runtime check.** contract-core is a Python library and this repo is TypeScript, so nothing here runs in the app. The runtime check is `lib/organic-social/aeo-informed/shape.ts`
  (it throws `PeecShapeError` on a changed vendor shape). Keep the two in step: change both in one PR.
- **Where the shapes come from.** The Peec response schemas were written from Peec's live OpenAPI (`GET https://api.peec.ai/customer/v1/openapi/json`, read 2026-11-09), not from memory. The output schemas mirror
  `SocialsRow`, `GapRow` and `GraphPoint` in the module.
- **Checked** with contract-core v0.7.0 (Python 3.13 or newer): `contract lint --contract contract.yaml --schemas schemas` passes, and in a scratch copy set to `enforce` a spec-shaped sample passed while a missing field,
  a stringified number, a renamed `data` key and a non-list `mentioned_brands` were each rejected. `contract reconcile` was not run: it needs decorated Python code, and there is none.

Not covered by the contract: the decisions about which rows are ours and how numbers are derived. Those are in `lib/organic-social/aeo-informed/ENGINEERS.md`.
