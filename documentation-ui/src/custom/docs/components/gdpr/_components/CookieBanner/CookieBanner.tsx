'use client'

import { Button, Dialog, DialogContent } from '@quantinuum/quantinuum-ui'
import RenderOnClient from 'app/_components/misc/RenderOnClient'

export const CookieBanner = ({
  isOpen,
  onAccept,
  onReject,
  onSettings,
}: {
  isOpen: boolean
  onAccept(): void
  onReject(): void
  onSettings(): void
}) => {
  return (
    // We have a portal nested inside dialog content which causes hydration issues thus we need to wrap the component in RenderOnClient
    <RenderOnClient>
      <Dialog open={isOpen}>
        <DialogContent isDismissable={false} isBottomDialog>
          <div className="max-w-5xl mx-auto">
            <h3 className="text-lg font-semibold capitalize">We value your privacy</h3>

            <div className="pt-1.5 flex flex-col md:flex-row gap-8">
              <p className="text-base md:w-9/12">
                We use essential cookies to ensure the website functions properly. With your permission, we will also
                use optional cookies to analyze site usage and improve the user experience. By using our website, you
                agree to our{' '}
                <a
                  className="font-semibold hover:underline underline-offset-4"
                  href="https://www.quantinuum.com/terms-conditions"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Terms of Use
                </a>{' '}
                and{' '}
                <a
                  className="font-semibold hover:underline underline-offset-4"
                  href="https://www.quantinuum.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Privacy Notice
                </a>
                . For details, including the list of cookies, purposes, vendors and retention periods, please read our{' '}
                <a
                  className="font-semibold hover:underline underline-offset-4"
                  href="https://www.quantinuum.com/cookie-notice"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Cookie Policy
                </a>
                .
              </p>

              <div className="flex flex-col md:hidden">
                <div className="flex mb-4 gap-4">
                  <Button variant="secondary" className="w-full" onClick={onReject}>
                    Required Only
                  </Button>
                  <Button className="w-full" onClick={onAccept}>
                    Accept All
                  </Button>
                </div>
                <Button className="w-full" variant="outline" onClick={onSettings}>
                  Manage Settings
                </Button>
              </div>

              <div className="hidden md:block w-3/12">
                <div className="flex flex-col gap-3">
                  <Button className="w-full" onClick={onAccept}>
                    Accept All
                  </Button>

                  <div className="flex md:flex-col lg:flex-row gap-3">
                    <Button variant="secondary" onClick={onReject} className="flex-1">
                      Required Only
                    </Button>

                    <Button variant="outline" onClick={onSettings} className="flex-1">
                      Settings
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </RenderOnClient>
  )
}
