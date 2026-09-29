'use client'

import { Button } from '@quantinuum/quantinuum-ui'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@quantinuum/quantinuum-ui'
import { EllipsisIcon, SearchIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { openSearch } from '../../kit/search-events'
import { NexusLogo } from '../logos/NexusLogo'
import { SystemsLogo } from '../logos/SystemsLogo'
import { MobileMenu } from './MobileMenu'
import { Navigation } from './NavigationMenu'
import { useDocsNavBarOptions } from './NavBarOptions'
import { QuantinuumIdent } from './QuantinuumIdent'
import { QuantinuumLogo } from './QuantinuumLogo'

const actionLinks = [
  { title: 'Nexus Portal', href: 'https://nexus.quantinuum.com/auth/login' },
  { title: 'Platform Updates', href: '/product-updates' },
]

const navConfig = {
  navTextLinks: [
    {
      title: 'Systems',
      href: '/systems/index.html',
      pathMatch: 'somewhere',
      logo: <SystemsLogo width={150 * 1.5} height={16 * 1.5}></SystemsLogo>,
      description:
        "Quantinuum's QCCD ion-trap hardware, the world's highest performing quantum computers.",
      dropDown: [
        {
          title: 'Guides',
          href: '/systems/guides.html',
        },
        {
          title: 'Getting Started',
          href: '/systems/trainings/getting_started/getting_started_index.html',
        },
        {
          title: 'Knowledge Articles',
          href: '/systems/trainings/knowledge_articles/ka_index.html',
        },
        {
          title: 'Support',
          href: '/systems/support.html',
        },
      ],
    },
    {
      title: 'Nexus',
      href: '/nexus/index.html',
      pathMatch: 'somewhere',
      logo: <NexusLogo variant="horizontal" className="h-10 w-48 -mt-1" />,
      description:
        'Cloud platform connecting users with hardware and compilation services, alongside associated data.',
      dropDown: [
        {
          title: 'Guides',
          href: '/nexus/guides.html',
        },
        {
          title: 'Trainings',
          href: '/nexus/trainings/getting_started.html',
        },
        {
          title: 'API Reference',
          href: '/nexus/api_index.html',
        },
        {
          title: 'Support',
          href: '/nexus/support_index.html',
        },
      ],
    },
    {
      title: 'Developer Suite',
      href: '',
      pathMatch: '',
      logo: <></>,
      description: 'Developer tools empower users to build and experiment with quantum algorithms.',
      dropDown: [
        {
          title: 'Pytket',
          href: '/tket/',
        },
        {
          title: 'Guppy',
          href: '/guppy/',
        },
        {
          title: 'Selene',
          href: '/selene/',
        },
        {
          title: 'qnexus',
          href: 'https://docs.quantinuum.com/nexus/trainings/notebooks/basics/getting_started.html',
        },
        {
          title: 'Q-NET',
          href: 'https://www.quantinuum.com/q-net#get-started',
        },
        {
          title: 'Startup Partner Program',
          href: 'https://www.quantinuum.com/startup-partner-program#join',
        },
      ],
    },
    {
      title: 'Solutions',
      href: '',
      pathMatch: '',
      logo: <></>,
      description: 'End-to-end Application Solutions leveraging Quantinuum Systems.',
      dropDown: [
        {
          title: 'InQuanto',
          href: '/inquanto/',
        },
        {
          title: 'Quantum Origin',
          href: '/origin/',
        },
        {
          title: '\u03BBambeq',
          href: '/lambeq/',
        },
      ],
    },
  ],
}

const SearchTrigger = () => (
  <button
    type="button"
    onClick={() => openSearch()}
    aria-label="Search all docs"
    title="Search all docs (⌘K)"
    className="inline-flex h-9 w-9 items-center justify-center gap-2 rounded-md border border-border bg-background text-sm text-muted-foreground transition-colors hover:bg-muted min-[80rem]:w-48 min-[80rem]:justify-start min-[80rem]:px-3"
  >
    <SearchIcon className="h-4 w-4 flex-none" aria-hidden="true" />
    <span className="hidden min-[80rem]:inline">Search all docs</span>
    <kbd className="ml-auto hidden rounded border border-border px-1 text-xs min-[80rem]:inline">⌘K</kbd>
  </button>
)

// Between md (hamburger hidden) and 80rem the action buttons don't fit beside
// the product menus, so they collapse into this menu.
const MoreMenu = () => (
  <DropdownMenu modal={false}>
    <DropdownMenuTrigger asChild>
      <Button
        variant="outline"
        className="hidden h-9 w-9 p-0 md:inline-flex min-[80rem]:hidden"
        aria-label="More links"
      >
        <EllipsisIcon className="h-4 w-4" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      {actionLinks.map((link) => (
        <DropdownMenuItem asChild key={link.href}>
          <a href={link.href}>{link.title}</a>
        </DropdownMenuItem>
      ))}
    </DropdownMenuContent>
  </DropdownMenu>
)

export const NavBar = (props: {
  activePath: string
  /** Overrides the `DocsNavBarProvider` setting. */
  search?: boolean
  /** Overrides the `DocsNavBarProvider` setting. */
  themeToggle?: ReactNode
}) => {
  const options = useDocsNavBarOptions()
  const search = props.search ?? options.search
  const themeToggle = props.themeToggle ?? options.themeToggle
  return (
    <div className="bg-background text-foreground border-border sticky top-0 z-[100] w-full border-b shadow text-sm">
      <div className=" bg-background px-3 md:px-4 flex h-12 items-center justify-between mx-auto max-w-[90rem]">
        <div className="mr-4 flex items-center">
          <div className="block md:hidden mr-3">
            <MobileMenu {...navConfig} actionLinks={actionLinks} />
          </div>
          <div className="whitespace-nowrap flex items-center gap-2">
            <a
              href="/"
              aria-label="Quantinuum Documentation"
              title="Quantinuum Documentation"
              className="hover:cursor-pointer hover:opacity-50 transition"
            >
              <div className="hidden lg:block">
                <QuantinuumLogo />
              </div>
              <div className="block lg:hidden">
                <QuantinuumIdent />
              </div>
            </a>
            <div className="text-muted-foreground text-xs font-medium flex items-center gap-1.5">
              {/* <div className='mx-0.5 text-muted-foreground/50'>|</div><div>Developer</div> */}
            </div>
          </div>
          <a href="/" className="ml-4 mr-4 flex items-center space-x-2">
            <span className="hidden font-bold">Quantinuum</span>
          </a>
        </div>
        <div className="flex items-center gap-5 mx-auto">
          <Navigation activePath={props.activePath} navTextLinks={navConfig.navTextLinks} />
        </div>
        <div className="relative flex items-center gap-2">
          {search ? <SearchTrigger /> : null}
          {themeToggle}
          {actionLinks.map((link) => (
            <Button
              key={link.href}
              asChild
              variant="secondary"
              className="hidden min-[80rem]:inline-flex"
            >
              <a href={link.href}>{link.title}</a>
            </Button>
          ))}
          <MoreMenu />
        </div>
      </div>
    </div>
  )
}
