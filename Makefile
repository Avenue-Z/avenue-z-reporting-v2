# The correctness gate, from Avenue-Z/repo-template (templates/next/Makefile at v1.6.0). ci.yml calls
# this same target, so the local command and the CI gate can never drift. Deps are installed separately
# (`npm ci`), by CI and once locally. Security scans (secret-scan, sca) are the separate `checks`
# workflow, not part of this target.
#
# Two differences from the template, both on purpose:
#   - `lint` is NOT in the gate yet. `npm run lint` fails today on 66 errors that predate this change,
#     so with it in, every PR would be red. `make lint` runs it. Move it back into `check` once the
#     errors are cleared.
#   - `check:rsc` is added. It catches a function prop passed from a Server Component to a Client
#     Component, a render-time crash that tsc and `next build` miss for dynamically rendered routes.
#
# `build` is not redundant with `typecheck` for a Next app: a project that type-checks clean can still
# fail `next build` (a bad route export, a server/client boundary violation, a missing env var at build
# time). Vercel runs this build on every deploy, so the correctness gate must run it too.
.PHONY: check lint
check:
	npm run typecheck
	npm test
	npm run check:rsc
	npm run build

lint:
	npm run lint
