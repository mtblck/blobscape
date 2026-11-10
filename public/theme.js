/*
 * Runs before first paint so the right palette is on <html> before the page
 * renders. A file, not an inline script: the CSP is script-src 'self'.
 * Shares the portfolio's 'mb-theme' key, so a visitor's choice carries over.
 */
;(function () {
  try {
    var stored = localStorage.getItem('mb-theme')
    var theme =
      stored === 'light' || stored === 'dark'
        ? stored
        : window.matchMedia('(prefers-color-scheme: light)').matches
          ? 'light'
          : 'dark'
    document.documentElement.dataset.theme = theme
  } catch {
    /* storage can throw in private mode; the dark default already applies */
  }
})()
