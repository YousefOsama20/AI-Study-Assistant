import type { ReactNode } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar, MobileNav } from './Sidebar'
import { BackendBanner } from './BackendBanner'
import { BackendStatusChip } from './BackendStatusChip'
import { Toaster } from '../ui/Toaster'
import { TooltipProvider } from '../ui/Tooltip'

export function AppShell({ children }: { children?: ReactNode }) {
  return (
    <TooltipProvider>
      <div className="flex min-h-screen bg-bg">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <BackendBanner />
          <header className="sticky top-0 z-40 flex h-14 items-center justify-between gap-3 border-b border-border bg-surface/90 px-4 backdrop-blur">
            <div className="min-w-0" />
            <BackendStatusChip />
          </header>
          <main id="main-content" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 pb-20 md:pb-6">
            {children ?? <Outlet />}
          </main>
          <MobileNav />
        </div>
        <Toaster />
      </div>
    </TooltipProvider>
  )
}
