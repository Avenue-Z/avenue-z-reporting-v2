import { beforeEach, expect, test } from 'vitest'
import { isDocumentReady } from './readiness'

beforeEach(() => { document.body.innerHTML = '' })

test('a page with nothing pending is ready', () => {
  document.body.innerHTML = '<section><h2>Top Content</h2></section>'
  expect(isDocumentReady(document)).toBe(true)
})

test('a loading placeholder still on the page means not ready', () => {
  document.body.innerHTML = '<div data-export-pending></div>'
  expect(isDocumentReady(document)).toBe(false)
})

test('an image that has not finished loading means not ready', () => {
  document.body.innerHTML = '<img src="https://example.com/a.png">'
  Object.defineProperty(document.images[0], 'complete', { value: false })
  expect(isDocumentReady(document)).toBe(false)
})

test('a chart that has not drawn yet means not ready', () => {
  document.body.innerHTML = '<div class="recharts-responsive-container"></div>'
  expect(isDocumentReady(document)).toBe(false)
  document.querySelector('.recharts-responsive-container')!.innerHTML = '<svg class="recharts-surface"></svg>'
  expect(isDocumentReady(document)).toBe(true)
})
