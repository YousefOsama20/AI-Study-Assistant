import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { DashboardPage } from './pages/Dashboard'
import { ProjectsPage } from './pages/Projects'
import { WorkspacePage } from './pages/Workspace'
import { DocumentsPage } from './pages/Documents'
import { SearchPage } from './pages/Search'
import { ChatPage } from './pages/Chat'
import { SettingsPage } from './pages/Settings'
import { AboutPage } from './pages/About'

export function App() {
  return (
    <AppShell>
      <Routes>
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
      </Routes>
    </AppShell>
  )
}
