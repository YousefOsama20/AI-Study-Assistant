import { useEffect, useState } from 'react'
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { DashboardPage } from './pages/Dashboard'
import { ProjectsPage } from './pages/Projects'
import { WorkspacePage } from './pages/Workspace'
import { DocumentsPage } from './pages/Documents'
import { SearchPage } from './pages/Search'
import { ChatPage } from './pages/Chat'
import { SettingsPage } from './pages/Settings'
import { AboutPage } from './pages/About'
import { SetupPage } from './pages/Setup'
import logoMark from './assets/logo-mark.png'

function StartupScreen() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4">
      <img src={logoMark} alt="" className="size-14 rounded-full" />
      <p className="text-sm text-muted">Starting AI-Study-Assistant…</p>
    </main>
  )
}

export function App() {
  const navigate = useNavigate()
  const bridge = typeof window !== 'undefined' ? window.aiStudyAssistant : undefined
  // Avoid mounting the dashboard (and firing API calls) before the first-run
  // check has decided whether the setup wizard is required.
  const [checking, setChecking] = useState(Boolean(bridge))

  useEffect(() => {
    if (!bridge) return
    let cancelled = false
    void bridge
      .getSetupStatus()
      .then((status) => {
        if (!cancelled && !status.configured) {
          navigate('/setup', { replace: true })
        }
      })
      .catch(() => {
        // A failed status read is surfaced by the backend banner.
      })
      .finally(() => {
        if (!cancelled) setChecking(false)
      })
    return () => {
      cancelled = true
    }
  }, [bridge, navigate])

  if (checking) {
    return <StartupScreen />
  }

  return (
    <Routes>
      <Route path="/setup" element={<SetupPage />} />
      <Route element={<AppShell />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/projects/:projectId" element={<WorkspacePage />}>
          <Route index element={<Navigate to="documents" replace />} />
          <Route path="documents" element={<DocumentsPage />} />
          <Route path="search" element={<SearchPage />} />
          <Route path="chat" element={<ChatPage />} />
        </Route>
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
