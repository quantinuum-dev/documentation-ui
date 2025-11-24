'use client'

import { CookieCategories } from '../../cookies-consent.config'
import { type CookieCategory, CookieConsent } from '../../types'
import {
  Dialog,
  DialogContent,
  Switch,
  Button,
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
} from '@quantinuum/quantinuum-ui'
import React from 'react'
import { useForm, SubmitHandler } from 'react-hook-form'

function getDefaultCookieValues(categories: CookieCategory[]) {
  return Object.fromEntries(categories.map((category) => [category.name, category.alwaysOn]))
}

export const CookiePreferencesDialog = ({
  isOpen,
  onClose,
  acceptAll,
  saveConsent,
}: {
  isOpen: boolean
  onClose(): void
  acceptAll(): void
  saveConsent(consent: CookieConsent): void
}) => {
  const form = useForm<CookieConsent>({
    defaultValues: getDefaultCookieValues(CookieCategories),
  })

  const onSubmit: SubmitHandler<CookieConsent> = (values) => {
    saveConsent(values)
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        isDismissable
        className="w-full max-w-[90vw] max-h-[90vh] sm:max-w-xl md:max-w-2xl sm:max-h-[80vh] px-5"
        aria-labelledby="cookies-preferences"
      >
        <article>
          <header className="px-1 mb-5">
            <h2 className="text-lg font-semibold mb-1.5">Manage Consent Preferences</h2>
            <p>
              Please choose whether this site may use optional cookies. Optional cookies help us measure usage and
              improve performance. We only set optional cookies with your consent. You can withdraw consent at any time
              in Cookie preferences.
            </p>
            <a
              className="font-semibold hover:underline underline-offset-4 mt-1 block"
              href="https://www.quantinuum.com/cookie-notice"
              target="_blank"
              rel="noopener noreferrer"
            >
              More information about our Cookie Policy
            </a>
          </header>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
              <div className="overflow-y-auto max-h-[40vh] px-1">
                {CookieCategories.map((category) => (
                  <FormField
                    key={category.name}
                    name={category.name}
                    render={({ field }) => (
                      <section aria-labelledby={category.name.toLowerCase()} className="mb-4 md:mb-5 last:mb-0">
                        <FormItem>
                          <div className="flex items-center">
                            <FormLabel className="text-lg font-normal">{category.name}</FormLabel>
                            {category.alwaysOn && (
                              <span className="text-primary text-sm font-semibold ml-2">Always on</span>
                            )}
                            {!category.alwaysOn && (
                              <FormControl>
                                <Switch
                                  checked={field.value}
                                  disabled={category.alwaysOn}
                                  onCheckedChange={field.onChange}
                                  className="mx-2"
                                />
                              </FormControl>
                            )}
                          </div>

                          <FormDescription className="text-sm text-foreground">{category.description}</FormDescription>

                          {category.cookies?.length > 0 && (
                            <Accordion type="single" collapsible className="w-full">
                              <AccordionItem value={`${category.name}-cookies`} className="border-b-0">
                                <AccordionTrigger className="font-semibold flex justify-start gap-3 p-0">
                                  Cookies Details
                                </AccordionTrigger>
                                <AccordionContent className="flex flex-col gap-2 pb-0 mt-8 md:mt-5">
                                  <div className="md:border-[1px] md:rounded-md">
                                    <Table>
                                      <TableBody>
                                        {category.cookies.map((cookie) => (
                                          <React.Fragment key={cookie.name}>
                                            <TableRow className="border-none">
                                              <TableHead className="pl-0 md:pl-3 pr-1 pt-1.5 md:pt-3 pb-1 w-1/5 align-top whitespace-nowrap">
                                                Cookie Name
                                              </TableHead>
                                              <TableCell className="pl-1 pr-0 md:pr-3 pt-1.5 md:pt-3 pb-1 align-top font-medium">
                                                {cookie.name}
                                              </TableCell>
                                            </TableRow>
                                            <TableRow className="border-none">
                                              <TableHead className="pl-0 md:pl-3 pr-1 pt-1 pb-1 w-1/5 align-top whitespace-nowrap">
                                                Purpose
                                              </TableHead>
                                              <TableCell className="pl-1 pr-0 md:pr-3 pt-1 pb-1 align-top">
                                                {cookie.description}
                                              </TableCell>
                                            </TableRow>
                                            <TableRow>
                                              <TableHead className="pl-0 md:pl-3 pr-1 pt-1 pb-1.5 md:pb-3 w-1/5 align-top whitespace-nowrap">
                                                Expiry
                                              </TableHead>
                                              <TableCell className="pl-1 pr-0 md:pr-3 pt-1 pb-1.5 md:pb-3 align-top">
                                                {cookie.expiry}
                                              </TableCell>
                                            </TableRow>
                                          </React.Fragment>
                                        ))}
                                      </TableBody>
                                    </Table>
                                  </div>
                                </AccordionContent>
                              </AccordionItem>
                            </Accordion>
                          )}
                        </FormItem>
                      </section>
                    )}
                  />
                ))}
              </div>

              <div className="flex flex-row-reverse sm:flex-row gap-4 mt-8 md:mt-10 px-1">
                <Button className="flex-1 md:flex-initial" type="button" onClick={acceptAll}>
                  Accept All
                </Button>
                <Button className="flex-1 md:flex-initial" type="submit" variant="secondary">
                  Save Preferences
                </Button>
              </div>
            </form>
          </Form>
        </article>
      </DialogContent>
    </Dialog>
  )
}
