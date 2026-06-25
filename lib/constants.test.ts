import { strict as assert } from 'node:assert'
import { aiSourceModel } from './constants'

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
