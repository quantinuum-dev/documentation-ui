'use client'
import React from 'react' // do not remove
import { Navigation } from './NavigationMenu'
import { QuantinuumLogo } from './QuantinuumLogo'
import { MobileMenu } from './MobileMenu'
import { QuantinuumIdent } from './QuantinuumIdent'
import { ModeSelector } from './ModeSelector'
import { SystemsLogo } from '../logos/SystemsLogo'
import { NexusLogo } from '../logos/NexusLogo'
import { Button } from '@quantinuum/quantinuum-ui'


const navConfig = {
  navTextLinks: [
    {
      title: 'Systems',
      href: '/systems/index.html',
      pathMatch: 'somewhere',
      logo: <SystemsLogo width={150 * 1.5} height={16 * 1.5}></SystemsLogo>,
      description: "Quantinuum's QCCD ion-trap hardware, the world's highest peforming quantum computer.",
      dropDown: [{
        title: "Guides",
        href: "/systems/guides.html",
      },{
        title: "Getting Started",
        href: "/systems/trainings/getting_started/getting_started_index.html",
      },{
        title: "Knowledge Articles",
        href: "/systems/trainings/knowledge_articles/ka_index.html",
      },{
        title: "Support",
        href: "/systems/support.html",
      }]
    }, {
      title: 'Nexus',
      href: '/nexus/index.html',
      pathMatch: 'somewhere',
      logo: <NexusLogo variant="horizontal"  className="h-10 w-48 -mt-1"  />,
      description: "Cloud platform connecting users with hardware and compilation services, alongside associated data.",
      dropDown: [{
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
      },]
    }, 
    {
      title: "Developer Suite",
      href: "",
      pathMatch: "",
      logo: <></>,
      description: "Developer tools empower users to build and experiment with quantum algorithms.",
      dropDown: [{
        title: 'Pytket',
        href: '/tket/',
      },{
        title: 'Guppy',
        href: "/guppy/",
      }, {
        title: "Selene",
        href: "/selene/"
      }, {
        title: "qnexus",
        href: "https://docs.quantinuum.com/nexus/trainings/notebooks/basics/getting_started.html"
      }, {
        title: "Q-NET",
        href: "https://www.quantinuum.com/q-net#get-started"
      }, {
        title: "Startup Partner Program",
        href: "https://www.quantinuum.com/startup-partner-program#join"
      }
    ]
    }, {
      title: "Solutions",
      href: "",
      pathMatch: "",
      logo: <></>,
      description: "End-to-end Application Solutions leveraging Quantinuum Systems.",
      dropDown: [{
        title: 'InQuanto',
        href: '/inquanto/',
      },{
        title: 'Quantum Origin',
        href: "/origin/",
      }, {
        title: "\u03BBambeq",
        href: "/lambeq/"
      }, 
    ]
    },
  ],
}


export const NavBar = (props: {
  activePath: string
  enableModeSelector?: boolean
}) => {
  return (
    <div className="bg-background text-foreground border-border sticky top-0 z-[100] w-full border-b shadow text-sm">
      <div className=" bg-background px-3 md:px-4 flex h-12 items-center justify-between mx-auto max-w-[90rem]">
        <div className="mr-4 flex items-center">
          <div className='block md:hidden mr-3'>
            <MobileMenu {...navConfig}/>
          </div>
          <div className="whitespace-nowrap flex items-center gap-2">
            <a href="/" aria-label='Quantinuum Documentation' title="Quantinuum Documentation" className='hover:cursor-pointer hover:opacity-50 transition'>
              <div className='hidden sm:block'><QuantinuumLogo />
              </div>
              <div className='block sm:hidden'>
                <QuantinuumIdent/>
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
          {props.enableModeSelector ? <> <div className='w-px h-6 bg-muted-foreground/50'></div><ModeSelector /> </>: null}
        </div>
        <div className='relative flex items-center gap-2'>
          {/* <svg
            width="24"
            height="24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            className="absolute mr-4 ml-2 w-10 flex-none text-slate-300 dark:text-slate-400"
            aria-hidden="true"
          >
            <path d="m19 19-3.5-3.5"></path>
            <circle cx="11" cy="11" r="6"></circle>
          </svg> */}
          {/* <Input
            id="sphinx-searchbox"
            type="search"
            className="pl-10 pb-1.5"
            placeholder="Search documentation..."
          /> */}
          <Button 
          variant="outline"
          className='bg-black text-white border border-border/60 shadow-md rounded-md hover:bg-white hover:text-black hover:border-black'
          ><a href="https://nexus.quantinuum.com/auth/login">Nexus Portal</a>
          </Button>
          <Button 
          variant="outline"
          className='bg-black text-white border border-border/60 shadow-md rounded-md hover:bg-white hover:text-black hover:border-black'
          ><a href="/product-updates">Platform Updates</a>
          </Button>
        </div>
      </div>
    </div>
  )
}
