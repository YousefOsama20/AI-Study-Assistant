import { NavLink } from 'react-router-dom'
import {
  FolderKanban,
  LayoutDashboard,
  Settings,
  Info,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react'
import { useSettingsStore } from '../../stores/settings'
import { useI18n } from '../../lib/i18n'
import { cn } from '../../lib/utils'
import logoMark from '../../assets/logo-mark.png'

const mainLinks = [
  { to: '/', labelKey: 'nav.dashboard', icon: LayoutDashboard, end: true },
  { to: '/projects', labelKey: 'nav.projects', icon: FolderKanban, end: false },
] as const

const bottomLinks = [
  { to: '/settings', labelKey: 'nav.settings', icon: Settings, end: false },
  { to: '/about', labelKey: 'nav.about', icon: Info, end: false },
] as const

export function Sidebar() {
  const collapsed = useSettingsStore((s) => s.sidebarCollapsed)
  const toggle = useSettingsStore((s) => s.toggleSidebar)
  const { t } = useI18n()

  return (
    <aside
      className={cn(
        'sticky top-0 hidden h-screen shrink-0 flex-col border-e border-border bg-surface transition-[width] md:flex',
        collapsed ? 'w-16' : 'w-60',
      )}
      aria-label="Main navigation"
    >
      <div
        className={cn(
          'flex h-14 items-center border-b border-border',
          collapsed ? 'justify-center px-2' : 'justify-between px-4',
        )}
      >
        {!collapsed ? (
          <div className="flex min-w-0 items-center gap-2">
            <img
              src={logoMark}
              alt=""
              className="size-8 shrink-0 rounded-full"
              decoding="async"
            />
            <span className="min-w-0 text-xs font-semibold leading-tight text-fg">
              {t('app.name')}
            </span>
          </div>
        ) : (
          <img
            src={logoMark}
            alt={t('app.name')}
            className="size-8 shrink-0 rounded-full"
            decoding="async"
          />
        )}
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')}
          className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-fg"
        >
          {collapsed ? (
            <PanelLeftOpen className="size-4" />
          ) : (
            <PanelLeftClose className="size-4" />
          )}
        </button>
      </div>

      <nav className="flex flex-1 flex-col gap-1 p-2">
        {[...mainLinks, ...bottomLinks].map((link, index) => {
          const Icon = link.icon
          const isBottom = index >= mainLinks.length
          return (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isBottom && 'mt-auto',
                  index === mainLinks.length && 'mt-auto',
                  isActive
                    ? 'bg-primary-soft text-primary-text'
                    : 'text-muted hover:bg-surface-2 hover:text-fg',
                  collapsed && 'justify-center px-0',
                )
              }
              title={t(link.labelKey)}
            >
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              {!collapsed ? <span className="truncate">{t(link.labelKey)}</span> : null}
            </NavLink>
          )
        })}
      </nav>
    </aside>
  )
}

export function MobileNav() {
  const { t } = useI18n()
  return (
    <nav
      className="sticky bottom-0 z-40 flex border-t border-border bg-surface md:hidden"
      aria-label="Mobile navigation"
    >
      {[...mainLinks, ...bottomLinks].map((link) => {
        const Icon = link.icon
        return (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.end}
            className={({ isActive }) =>
              cn(
                'flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium',
                isActive ? 'text-primary-text' : 'text-muted',
              )
            }
          >
            <Icon className="size-4" aria-hidden="true" />
            {t(link.labelKey)}
          </NavLink>
        )
      })}
    </nav>
  )
}
