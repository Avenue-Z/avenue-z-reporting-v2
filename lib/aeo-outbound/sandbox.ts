// The one sandbox for every place the report runs (spec v1.1 §9): the editor's iframe attribute, and the CSP header of
// the view route and the public link. allow-popups lets the avenuez.com links open. There is no allow-same-origin, so
// the report keeps an opaque origin everywhere (main spec §8).
export const REPORT_SANDBOX = 'allow-scripts allow-popups allow-popups-to-escape-sandbox'
export const REPORT_CSP = `sandbox ${REPORT_SANDBOX}`
