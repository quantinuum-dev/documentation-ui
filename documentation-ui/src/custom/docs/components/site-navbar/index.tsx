'use client'

import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  Sheet,
  SheetClose,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from '@quantinuum/quantinuum-ui'
import { ArrowRight, ArrowUpRight, Menu, MessageCircleQuestion, Search } from 'lucide-react'
import type { ReactNode } from 'react'

import { openSearch } from '../../kit/search-events'
import { type NavBarLink, type NavBarLinkGroup, type NavBarMenu } from '../navmenu/NavBarOptions'
import { useDocsNavBarOptions } from '../navmenu/useDocsNavBarOptions'
import { QuantinuumWordmark } from './QuantinuumWordmark'

// Brand fonts: the central site's variables, else the docs theme's.
const displayFont = 'font-[family-name:var(--font-figtree,var(--font-origin-sans))]'
const labelFont =
  'font-[family-name:var(--font-rajdhani,var(--font-origin-accent))] uppercase tracking-[0.15em]'

const isExternal = (href: string) => /^(https?:|mailto:)/.test(href)
const newTabProps = (href: string) =>
  isExternal(href) ? { target: '_blank', rel: 'noopener noreferrer' } : {}

const itemClass = (active: boolean) =>
  `inline-flex h-9 items-center rounded-md bg-transparent px-3 text-[0.95rem] font-medium transition-colors hover:bg-[#F2F2F2] hover:text-[#2B2B2B] focus:bg-[#F2F2F2] data-[state=open]:bg-[#F2F2F2] data-[state=open]:text-[#2B2B2B] dark:hover:bg-white/10 dark:hover:text-white dark:focus:bg-white/10 dark:data-[state=open]:bg-white/10 dark:data-[state=open]:text-white ${
    active
      ? 'text-[#2B2B2B] shadow-[inset_0_-2px_0_#6AD3BE] dark:text-white'
      : 'text-[#555] dark:text-[#CACACA]'
  }`

const panelLink =
  'block rounded-lg p-2 transition-colors hover:bg-[#F2F2F2] focus:bg-[#F2F2F2] focus:outline-none dark:hover:bg-white/10 dark:focus:bg-white/10'

const groupLinks = (group: NavBarLinkGroup) => [...group.links, ...(group.subgroup?.links ?? [])]

const allLinks = (menu: NavBarMenu) => [
  ...(menu.featured ?? []),
  ...menu.groups.flatMap(groupLinks),
]

export interface NavBarProps {
  /** Id of the menu to mark as the current section. */
  activeMenu?: string
  /** Docs root of the current page (e.g. `/guppy`): marks the menu linking to it. */
  activePath?: string
}

/**
 * The Quantinuum documentation site navbar. Its menus come from the host via
 * `DocsNavBarProvider`, so a product's standalone build can show just its own.
 * The bar is `h-14` plus a 1px border (`DOCS_NAV_HEIGHT`).
 */
export function NavBar({ activeMenu, activePath }: NavBarProps) {
  const { menus = [], cta, support, search, themeToggle } = useDocsNavBarOptions()
  const root = activePath ? `${activePath.replace(/\/$/, '')}/` : undefined
  const active =
    activeMenu ?? menus.find((menu) => allLinks(menu).some((link) => link.href === root))?.id

  return (
    <header
      className={`${displayFont} sticky top-0 z-50 border-b border-[#2B2B2B]/10 bg-white/90 text-[#2B2B2B] backdrop-blur dark:border-white/10 dark:bg-[#101010]/90 dark:text-white`}
    >
      <div className="mx-auto flex h-14 max-w-[88rem] items-center gap-6 px-4 md:px-8">
        <a
          href="/"
          aria-label="Quantinuum Documentation"
          className="-mx-2 flex shrink-0 items-center gap-3 self-stretch px-2"
        >
          <QuantinuumWordmark className="h-4 w-auto dark:invert" aria-hidden="true" />
          <span className="hidden border-l border-[#2B2B2B]/15 pl-3 text-sm font-medium text-[#555] xl:inline-flex dark:border-white/20 dark:text-[#CACACA]">
            Documentation
          </span>
        </a>

        {menus.length > 0 ? (
          <NavigationMenu className="hidden lg:flex">
            <NavigationMenuList>
              {menus.map((menu) => (
                <NavigationMenuItem key={menu.id}>
                  <NavigationMenuTrigger className={itemClass(menu.id === active)}>
                    {menu.title}
                  </NavigationMenuTrigger>
                  <NavigationMenuContent>
                    <MenuPanel menu={menu} />
                  </NavigationMenuContent>
                </NavigationMenuItem>
              ))}
            </NavigationMenuList>
          </NavigationMenu>
        ) : null}

        <div className="ml-auto flex items-center gap-2">
          {search ? (
            <button
              type="button"
              onClick={() => openSearch()}
              aria-label="Search documentation"
              title="Search documentation (⌘K)"
              className="inline-flex h-9 items-center gap-2 rounded-full border border-[#2B2B2B]/15 px-3 text-sm text-[#7F7F7F] transition-colors hover:border-[#30A08E] hover:text-[#2B2B2B] dark:border-white/20 dark:text-[#CACACA] dark:hover:text-white"
            >
              <Search className="h-4 w-4" aria-hidden />
              <span className="hidden md:inline">Search</span>
              <kbd className="hidden rounded border border-[#2B2B2B]/15 px-1 text-xs md:inline dark:border-white/20">
                ⌘K
              </kbd>
            </button>
          ) : null}
          {themeToggle}
          {support ? (
            <a
              href={support.href}
              {...newTabProps(support.href)}
              aria-label={support.title}
              title={support.title}
              className="hidden h-9 items-center gap-2 rounded-full border border-[#2B2B2B]/15 px-2.5 text-sm text-[#555] transition-colors hover:border-[#30A08E] hover:text-[#2B2B2B] sm:inline-flex dark:border-white/20 dark:text-[#CACACA] dark:hover:text-white"
            >
              <MessageCircleQuestion className="h-4 w-4" aria-hidden />
              <span className="hidden xl:inline">Support</span>
            </a>
          ) : null}
          {cta ? (
            <a
              href={cta.href}
              {...newTabProps(cta.href)}
              className={`${labelFont} hidden h-9 items-center gap-1.5 rounded-full bg-[#6AD3BE] px-4 text-sm font-bold text-[#2B2B2B] transition-colors hover:bg-[#A5E5D7] xl:inline-flex`}
            >
              {cta.title}
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
            </a>
          ) : null}
          {menus.length > 0 || cta || support ? (
            <MobileMenu
              menus={menus}
              more={[cta, support].filter((link): link is NavBarLink => link !== undefined)}
            />
          ) : null}
        </div>
      </div>
    </header>
  )
}

function MenuPanel({ menu }: { menu: NavBarMenu }) {
  const { featured, groups, footer } = menu
  let body: ReactNode
  if (featured?.length) {
    body = (
      <div className="w-[min(46rem,calc(100vw-22rem))]">
        <div className="grid gap-4 p-4 md:grid-cols-[15rem_1fr]">
          <div className="flex flex-col gap-2">
            {featured.map((link) => (
              <NavigationMenuLink
                key={link.href}
                href={link.href}
                {...newTabProps(link.href)}
                className="flex flex-col rounded-xl bg-[#E1F6F2] p-4 transition-colors hover:bg-[#A5E5D7]/60 dark:bg-[#30A08E]/20 dark:hover:bg-[#30A08E]/30"
              >
                {menu.featuredLabel ? (
                  <span className="text-xs font-semibold text-[#1D605B] dark:text-[#A5E5D7]">
                    {menu.featuredLabel}
                  </span>
                ) : null}
                <span className={`${displayFont} mt-2 font-bold leading-snug`}>{link.title}</span>
              </NavigationMenuLink>
            ))}
          </div>
          <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
            {groups.map((group, i) => (
              <Group key={group.title ?? i} group={group} />
            ))}
          </div>
        </div>
      </div>
    )
  } else if (groups.length > 1) {
    body = (
      <div
        className={
          groups.length > 2
            ? 'w-[min(52rem,calc(100vw-22rem))]'
            : 'w-[min(40rem,calc(100vw-22rem))]'
        }
      >
        <div
          className={`grid gap-4 p-4 ${groups.length > 2 ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}
        >
          {groups.map((group, i) => (
            <Group key={group.title ?? i} group={group} />
          ))}
        </div>
      </div>
    )
  } else {
    body = (
      <ul className="grid w-[24rem] gap-1 p-3">
        {groups[0]?.links.map((link) => (
          <li key={link.href}>
            <PanelLink link={link} />
          </li>
        ))}
      </ul>
    )
  }

  return (
    <>
      {body}
      {footer?.length ? (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-[#2B2B2B]/10 bg-[#F2F2F2]/60 px-5 py-3 text-sm dark:border-white/10 dark:bg-white/5">
          {footer.map((link) => (
            <FooterLink key={link.href} link={link} />
          ))}
        </div>
      ) : null}
    </>
  )
}

function Group({ group }: { group: NavBarLinkGroup }) {
  return (
    <div>
      {group.title ? (
        <p
          className={`${labelFont} flex items-start gap-2 px-2 text-[0.8rem] font-bold leading-snug text-[#7F7F7F]`}
        >
          {group.accent ? (
            <span
              className="mt-[0.3em] h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: group.accent }}
              aria-hidden
            />
          ) : null}
          {group.title}
        </p>
      ) : null}
      <ul className="mt-1">
        {group.links.map((link) => (
          <li key={link.href}>
            <PanelLink link={link} />
          </li>
        ))}
      </ul>
      {group.subgroup ? (
        <div className="mt-2 ml-2 border-l border-[#2B2B2B]/10 pl-2 dark:border-white/10">
          <p className={`${labelFont} px-2 text-[0.75rem] font-bold text-[#7F7F7F]`}>
            {group.subgroup.title}
          </p>
          <ul className="mt-1">
            {group.subgroup.links.map((link) => (
              <li key={link.href}>
                <PanelLink link={link} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

function PanelLink({ link }: { link: NavBarLink }) {
  if (link.detail) {
    return (
      <NavigationMenuLink
        href={link.href}
        {...newTabProps(link.href)}
        className={`${panelLink} flex items-baseline justify-between gap-3`}
      >
        <span className="text-sm font-semibold">{link.title}</span>
        <code className="text-xs text-[#7F7F7F]">{link.detail}</code>
      </NavigationMenuLink>
    )
  }
  if (link.description) {
    return (
      <NavigationMenuLink href={link.href} {...newTabProps(link.href)} className={panelLink}>
        <span className={`${displayFont} flex items-center gap-1 text-sm font-bold`}>
          {link.title}
          {isExternal(link.href) ? (
            <ArrowUpRight className="h-3.5 w-3.5 text-[#7F7F7F]" aria-hidden />
          ) : null}
        </span>
        <span className="block text-xs leading-[1.4] text-[#555] dark:text-[#CACACA]">
          {link.description}
        </span>
      </NavigationMenuLink>
    )
  }
  return (
    <NavigationMenuLink
      href={link.href}
      {...newTabProps(link.href)}
      className={`${panelLink} py-1.5 text-sm`}
    >
      {link.title}
    </NavigationMenuLink>
  )
}

function FooterLink({ link }: { link: NavBarLink }) {
  const Icon = isExternal(link.href) ? ArrowUpRight : ArrowRight
  return (
    <NavigationMenuLink
      href={link.href}
      {...newTabProps(link.href)}
      className="inline-flex items-center gap-1.5 font-semibold text-[#1D605B] hover:underline dark:text-[#6AD3BE]"
    >
      {link.title}
      <Icon className="h-4 w-4" aria-hidden />
    </NavigationMenuLink>
  )
}

function MobileMenu({ menus, more }: { menus: NavBarMenu[]; more: NavBarLink[] }) {
  const heading = `${labelFont} mb-1 mt-6 text-[0.8rem] font-bold text-[#7F7F7F]`
  const item = (link: NavBarLink) => (
    <li key={link.href}>
      <SheetClose asChild>
        <a
          href={link.href}
          {...newTabProps(link.href)}
          className="block rounded-md px-2 py-1.5 text-sm hover:bg-[#F2F2F2] dark:hover:bg-white/10"
        >
          {link.title}
        </a>
      </SheetClose>
    </li>
  )
  // Menus of titled groups list each group under its own heading; others as one list.
  const sections: (NavBarLinkGroup & { title: string })[] = menus.flatMap((menu) =>
    !menu.featured?.length && menu.groups.length > 1
      ? menu.groups.map((group) => ({ ...group, title: group.title ?? menu.title }))
      : [{ title: menu.title, links: allLinks(menu) }]
  )

  return (
    <Sheet>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label="Open menu"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-[#F2F2F2] lg:hidden dark:hover:bg-white/10"
        >
          <Menu className="h-5 w-5" aria-hidden />
        </button>
      </SheetTrigger>
      <SheetContent side="right" className={`${displayFont} w-[22rem] max-w-full overflow-y-auto`}>
        <SheetTitle className="text-base font-semibold">Menu</SheetTitle>
        <nav aria-label="Mobile">
          {sections.map((section) => (
            <div key={section.title}>
              <p className={heading}>{section.title}</p>
              <ul>
                {section.links.map(item)}
                {section.subgroup ? (
                  <li>
                    <p className="px-2 pt-1.5 text-xs font-semibold text-[#7F7F7F]">
                      {section.subgroup.title}
                    </p>
                    <ul className="ml-3">{section.subgroup.links.map(item)}</ul>
                  </li>
                ) : null}
              </ul>
            </div>
          ))}
          {more.length > 0 ? (
            <>
              <p className={heading}>More</p>
              <ul>{more.map(item)}</ul>
            </>
          ) : null}
        </nav>
      </SheetContent>
    </Sheet>
  )
}
