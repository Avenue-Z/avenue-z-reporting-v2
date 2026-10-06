import { expect, test, vi } from 'vitest'
import { ExportNotReadyError, ExportRenderError, renderPdf, type BrowserLike, type PageLike } from './render-pdf'

const PDF = new Uint8Array([37, 80, 68, 70])
const timeout = () => Object.assign(new Error('Waiting failed: 45000ms exceeded'), { name: 'TimeoutError' })

function fakes(over: Partial<PageLike> = {}, landed = 'https://app.example/export/renaissance/organic-social?dateRange=x') {
  const page: PageLike = {
    setViewport: vi.fn(async () => {}),
    goto: vi.fn(async () => ({ status: () => 200 })),
    url: vi.fn(() => landed),
    waitForFunction: vi.fn(async () => true),
    emulateMediaType: vi.fn(async () => {}),
    pdf: vi.fn(async () => PDF),
    ...over,
  }
  const browser: BrowserLike = { setCookie: vi.fn(async () => {}), newPage: vi.fn(async () => page), close: vi.fn(async () => {}) }
  return { page, browser, launch: vi.fn(async () => browser) }
}
const opts = { url: 'https://app.example/export/renaissance/organic-social?dateRange=x', cookies: [{ name: '__Secure-authjs.session-token', value: 'v' }] }

test('renders the export page at the content width, once ready, with screen media, as letter landscape', async () => {
  const { page, browser, launch } = fakes()
  expect(await renderPdf(opts, { launch })).toBe(PDF)
  expect(browser.setCookie).toHaveBeenCalledWith({ name: '__Secure-authjs.session-token', value: 'v', domain: 'app.example', path: '/', httpOnly: true, secure: true })
  expect(page.setViewport).toHaveBeenCalledWith({ width: 979, height: 739 })
  expect(page.waitForFunction).toHaveBeenCalledWith('window.__exportReady === true', expect.objectContaining({ timeout: expect.any(Number) }))
  expect(page.emulateMediaType).toHaveBeenCalledWith('screen')
  expect(page.pdf).toHaveBeenCalledWith({ width: '11in', height: '8.5in', margin: { top: '0.4in', right: '0.4in', bottom: '0.4in', left: '0.4in' }, printBackground: true })
  expect(browser.close).toHaveBeenCalled()
})

test('a page never ready is a not-ready error, with no PDF taken and the browser closed', async () => {
  const { page, browser, launch } = fakes({ waitForFunction: vi.fn(async () => { throw timeout() }) })
  await expect(renderPdf(opts, { launch })).rejects.toBeInstanceOf(ExportNotReadyError)
  expect(page.pdf).not.toHaveBeenCalled()
  expect(browser.close).toHaveBeenCalled()
})

test('a page still streaming when the budget runs out is also not ready', async () => {
  const { launch } = fakes({ goto: vi.fn(async () => { throw timeout() }) })
  await expect(renderPdf(opts, { launch })).rejects.toBeInstanceOf(ExportNotReadyError)
})

test.each(['/login', '/unauthorized'])('landing on %s is an auth failure', async (path) => {
  const { page, launch } = fakes({}, `https://app.example${path}`)
  await expect(renderPdf(opts, { launch })).rejects.toMatchObject({ step: 'auth' })
  expect(page.pdf).not.toHaveBeenCalled()
})

test('an error status from the export page is a navigation failure', async () => {
  const { launch } = fakes({ goto: vi.fn(async () => ({ status: () => 500 })) })
  await expect(renderPdf(opts, { launch })).rejects.toMatchObject({ step: 'navigate' })
})

test('a browser that will not start is a launch failure', async () => {
  await expect(renderPdf(opts, { launch: vi.fn(async () => { throw new Error('spawn ENOENT') }) })).rejects.toMatchObject({ step: 'launch' })
})

test('a failure printing is a pdf failure, and the browser is still closed', async () => {
  const { browser, launch } = fakes({ pdf: vi.fn(async () => { throw new Error('Printing failed') }) })
  const err = await renderPdf(opts, { launch }).catch((e) => e)
  expect(err).toBeInstanceOf(ExportRenderError)
  expect(err.step).toBe('pdf')
  expect(browser.close).toHaveBeenCalled()
})
