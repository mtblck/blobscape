/*
 * Runs before first paint, so a visitor's saved theme is on <html> before the
 * page renders. With nothing saved the page follows the system (the CSS does
 * that on its own). A file, not an inline script: the CSP is script-src 'self'.
 */
;(function () {
  try {
    var stored = localStorage.getItem('blobscape-theme')
    if (stored === 'light' || stored === 'dark') document.documentElement.dataset.theme = stored
  } catch (e) {
    /* storage can throw in private mode; the system theme applies */
  }
})()
