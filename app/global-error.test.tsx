// @vitest-environment node
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, expect, test } from 'vitest'

// The crash screen stays exactly as next 16.1.6 drew it. next 16.2 redesigned its default
// (builtin/global-error.js); these strings are 16.1.6's own default rendered to static HTML for the same
// inputs (a server error with a digest, a client error without one), captured before the upgrade.
const SERVER = "<html id=\"__next_error__\"><head></head><body><div style=\"font-family:system-ui,&quot;Segoe UI&quot;,Roboto,Helvetica,Arial,sans-serif,&quot;Apple Color Emoji&quot;,&quot;Segoe UI Emoji&quot;;height:100vh;text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:center\"><div><h2 style=\"font-size:14px;font-weight:400;line-height:28px;margin:0 8px\">Application error: a server-side exception has occurred while loading reporting.example.test (see the server logs for more information).</h2><p style=\"font-size:14px;font-weight:400;line-height:28px;margin:0 8px\">Digest: 1234567890</p></div></div></body></html>"
const CLIENT = "<html id=\"__next_error__\"><head></head><body><div style=\"font-family:system-ui,&quot;Segoe UI&quot;,Roboto,Helvetica,Arial,sans-serif,&quot;Apple Color Emoji&quot;,&quot;Segoe UI Emoji&quot;;height:100vh;text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:center\"><div><h2 style=\"font-size:14px;font-weight:400;line-height:28px;margin:0 8px\">Application error: a client-side exception has occurred while loading reporting.example.test (see the browser console for more information).</h2></div></div></body></html>"

const host = globalThis as { window?: unknown }
beforeEach(() => { host.window = { location: { hostname: 'reporting.example.test' } } })
afterEach(() => { delete host.window })

test('a server error draws 16.1.6 crash screen, digest included', async () => {
  const { default: GlobalError } = await import('./global-error')
  const error = Object.assign(new Error('boom'), { digest: '1234567890' })
  expect(renderToStaticMarkup(createElement(GlobalError, { error, reset() {} }))).toBe(SERVER)
})

test('a client error draws 16.1.6 crash screen, with no digest line', async () => {
  const { default: GlobalError } = await import('./global-error')
  expect(renderToStaticMarkup(createElement(GlobalError, { error: new Error('boom'), reset() {} }))).toBe(CLIENT)
})
