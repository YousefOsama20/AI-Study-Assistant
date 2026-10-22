;(function () {
  try {
    var preference = 'system'
    var raw = window.localStorage.getItem('ai-study-assistant-settings')
    if (raw) {
      try {
        var parsed = JSON.parse(raw)
        var stored = parsed && parsed.state && parsed.state.theme
        if (stored === 'light' || stored === 'dark' || stored === 'system') {
          preference = stored
        }
      } catch {
        preference = 'light'
      }
    }

    var resolved = preference
    if (preference === 'system') {
      resolved = window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
    }

    var root = document.documentElement
    root.classList.toggle('dark', resolved === 'dark')
    root.dataset.theme = resolved
    root.style.colorScheme = resolved

    var meta = document.querySelector('meta[name="theme-color"]')
    if (meta) {
      meta.setAttribute(
        'content',
        resolved === 'dark' ? '#211B1A' : '#F8F4EC',
      )
    }
  } catch {
    // Ignore blocked or malformed storage and use the light default.
  }
})()
