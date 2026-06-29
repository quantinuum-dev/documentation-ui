import { Separator } from "@quantinuum/quantinuum-ui";

import { QuantinuumLogo } from '@/custom/docs/QuantinuumLogo';

const footerConfig = {
  columns: [
    {
      name: 'User Community',
      items: [
        {
          name: 'Compute Platform Updates',
          href: '/product-updates',
        },
        {
          name: 'Q-NET',
          href: 'https://www.quantinuum.com/q-net#get-started',
        },
        {
          name: 'Quantinuum Startup Partner Program',
          href: 'https://www.quantinuum.com/startup-partner-program#join',
        },
      ],
    },
    {
      name: 'Compute Platform',
      items: [
        {
          name: 'Quantinuum Systems',
          href: '/systems',
        },
        {
          name: 'Quantinuum Nexus',
          href: '/nexus',
        },
        {
          name: 'Guppy',
          href: '/guppy',
        },
        {
          name: 'Selene',
          href: '/selene',
        },
        {
          name: 'Pytket',
          href: '/tket',
        },
      ],
    },
    {
      name: 'Applications',
      items: [
        {
          name: 'InQuanto',
          href: '/inquanto',
        },
        {
          name: 'Quantum Origin',
          href: '/origin',
        },
        {
          name: '\u03BBambeq',
          href: '/lambeq/',
        },
      ],
    },
    {
      name: 'Quantinuum',
      items: [
        {
          name: 'About',
          href: 'https://www.quantinuum.com/about',
        },
        {
          name: 'Careers',
          href: 'https://www.quantinuum.com/careers',
        },
        {
          name: 'Events',
          href: 'https://www.quantinuum.com/events',
        },
      ],
    },
  ],
}

export const Footer = () => {
  return (
    <div className="mb-24">
      <div className="my-24"></div>
      <Separator />
      <div className="my-12"></div>

      <footer className="text-muted-foreground flex flex-col items-start xl:justify-between  xl:flex-row gap-12 xl:gap-24">
        <div>
          <div className="-mt-4">
            <a href="https://www.quantinuum.com/" target='_blank' className='hover:opacity-75 transition'>
              <QuantinuumLogo />
            </a>
          </div>
          <p className="max-w-[24rem] text-xs leading-5">
            Copyright © {new Date().getFullYear()} Quantinuum Inc. All rights reserved.{' '}
          </p>
          <div className='flex items-center flex-wrap gap-2 mt-2'>
            <a href="https://www.quantinuum.com/terms-conditions" target="_blank" className='font-medium text-xs tracking-tight text-blue-600 dark:text-blue-300'>
              Terms and Conditions
            </a> <div className="text-input">/</div>
            <a target="_blank" href="https://www.quantinuum.com/privacy-statement" className='font-medium text-xs tracking-tight text-blue-600 dark:text-blue-300'>
              Privacy Policy
            </a><div className="text-input">/</div>
            <a target="_blank" href="https://www.quantinuum.com/cookie-notice" className='font-medium text-xs tracking-tight text-blue-600 dark:text-blue-300'>
              Cookie Notice
            </a>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-20 xl:gap-x-12 xl:grid-cols-4 gap-12">
          {footerConfig.columns.map((col) => {
            return (
              <div key={col.name} className="flex flex-col max-w-[10rem]">
                <span className="text-foreground text-[0.675rem] font-semibold uppercase tracking-wide xl:text-right">
                  {col.name}
                </span>
                <ul className="mt-3 flex flex-col gap-2 xl:items-end">
                  {col.items.map((item) => {
                    return (
                      <li key={item.href}>
                        <a
                          className="block text-muted-foreground text-[0.75rem] font-medium xl:text-right"
                          href={item.href}
                        >
                          {item.name}
                        </a>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })}
        </div>
      </footer>
    </div>
  )
}
