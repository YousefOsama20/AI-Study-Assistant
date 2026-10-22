import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { App } from './App'
import { I18nProvider } from './lib/i18n'
import { useTheme } from './hooks/useTheme'
import './index.css'

function Root() {
  useTheme()
  return (
    <I18nProvider>
      <HashRouter>
        <App />
      </HashRouter>
    </I18nProvider>
  )
}

const container = document.getElementById('root')
if (!container) {
  throw new Error('Root element not found')
}

createRoot(container).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
