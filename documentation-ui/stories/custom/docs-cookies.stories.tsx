import { Meta, StoryObj } from "@storybook/react";
import { ComponentProps } from "react"; // do not remove

import { CookieConsentManager, CookieConsentProvider } from 'src';


export function DocsCookiesDemo() {
    return (
    <CookieConsentProvider>
      <CookieConsentManager />
    </CookieConsentProvider>
    )
}


const meta: Meta<typeof DocsCookiesDemo> = {
  component: DocsCookiesDemo,
};

export default meta;

export const Default: StoryObj<typeof DocsCookiesDemo> = {
  args: {},
};
