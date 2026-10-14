// The report frame's height on the editor page (spec 2026-10-14 editor space §4.2): the screen under the sticky
// toolbar, 16px above and 16px below. The editor writes the toolbar's height as a CSS variable on its root; until it
// does (the server render, or no ResizeObserver), 108px stands in, which is the old fixed calc(100vh - 140px).
export const TOOLBAR_HEIGHT_VAR = '--aeo-toolbar-h'
export const FRAME_HEIGHT = `calc(100vh - var(${TOOLBAR_HEIGHT_VAR}, 108px) - 32px)`
export const FRAME_MIN_HEIGHT = 320
/** The toolbar's border-box height as the variable's value, rounded up so a draft never scrolls by a fraction. */
export const toolbarHeightVar = (h: number): string => `${Math.ceil(h)}px`
