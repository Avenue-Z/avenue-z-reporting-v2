import { strict as assert } from 'node:assert'
import { aiSourceModel, visibleSubsections } from './constants'

// --- visibleSubsections: hide nav sub-tabs whose id is in the client's hiddenReports ---
const subs = [
  { id: null, label: 'Overview' },
  { id: 'pr-influence', label: 'PR Influence' },
  { id: 'technical-audit', label: 'Technical Performance' },
]
// nothing hidden → all retained
assert.equal(visibleSubsections(subs, []).length, 3)
assert.equal(visibleSubsections(subs).length, 3) // undefined hidden
// hide technical-audit → dropped, Overview (id null) always kept
const v = visibleSubsections(subs, ['technical-audit'])
assert.equal(v.length, 2)
assert.equal(v.some((s) => s.id === 'technical-audit'), false)
assert.equal(v.some((s) => s.id === null), true)

assert.equal(aiSourceModel('chatgpt.com'), 'ChatGPT')
assert.equal(aiSourceModel('chat.openai.com'), 'ChatGPT')
assert.equal(aiSourceModel('perplexity.ai'), 'Perplexity')
assert.equal(aiSourceModel('claude.ai'), 'Claude')
assert.equal(aiSourceModel('gemini.google.com'), 'Gemini')
assert.equal(aiSourceModel('copilot.microsoft.com'), 'Copilot')
assert.equal(aiSourceModel('www.bing.com'), 'Copilot')
assert.equal(aiSourceModel('you.com'), null)     // generic AI search — unmapped
assert.equal(aiSourceModel('google.com'), null)  // plain google — not AI-Overview attributable
assert.equal(aiSourceModel(null), null)
console.log('ok')
