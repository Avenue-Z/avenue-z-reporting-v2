// scripts/gen-aeo-contract.ts
// Writes the contract-core YAML design copy for the AEO Informed Social adapter from lib/organic-social/aeo-informed/contract.ts.
// Run from the repo root: npx tsx scripts/gen-aeo-contract.ts   (contract-yaml.test.ts fails if the committed files differ from this output)
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { CONTRACT_DIR, renderContractFiles } from '../lib/organic-social/aeo-informed/contract-yaml'

const root = join(process.cwd(), CONTRACT_DIR)
const files = renderContractFiles()
for (const [path, text] of Object.entries(files)) {
  mkdirSync(dirname(join(root, path)), { recursive: true })
  writeFileSync(join(root, path), text)
}
console.log(`wrote ${Object.keys(files).length} files under ${CONTRACT_DIR}`)
