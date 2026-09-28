'use client'

import { DocsLayout } from 'fumadocs-ui/layouts/docs'
import { SidebarCollapseTrigger } from 'fumadocs-ui/components/sidebar/base'
import {
  Sidebar,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from 'fumadocs-ui/layouts/docs/slots/sidebar'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { ComponentProps } from 'react'

function ContentsToggle({ floating = false }: { floating?: boolean }) {
  const { collapsed } = useSidebar()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const previousCollapsed = useRef(collapsed)
  const label = collapsed ? 'Show contents' : 'Hide contents'

  useEffect(() => {
    if (previousCollapsed.current !== collapsed && floating === collapsed) {
      buttonRef.current?.focus({ preventScroll: true })
    }
    previousCollapsed.current = collapsed
  }, [collapsed, floating])

  if (floating && !collapsed) return null

  return (
    <SidebarCollapseTrigger
      ref={buttonRef}
      className={`quantinuum-sidebar-toggle${floating ? ' quantinuum-sidebar-reopen' : ''}`}
      aria-label={label}
      aria-controls="nd-sidebar"
      aria-expanded={!collapsed}
      title={label}
    >
      {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
    </SidebarCollapseTrigger>
  )
}

function ContentsSidebar(props: ComponentProps<typeof Sidebar>) {
  return (
    <>
      <Sidebar {...props} collapsible={false} />
      <ContentsToggle floating />
    </>
  )
}

const sidebarSlots = {
  provider: SidebarProvider,
  root: ContentsSidebar,
  trigger: SidebarTrigger,
  useSidebar,
}

export function SidebarLayout({ nav, ...props }: ComponentProps<typeof DocsLayout>) {
  return (
    <DocsLayout
      {...props}
      nav={{ ...nav, children: <ContentsToggle /> }}
      slots={{ sidebar: sidebarSlots }}
    />
  )
}