import type { Preview } from "@storybook/react";
import "@quantinuum/quantinuum-ui/tokens.css"
import "./styles.css"

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
};

export default preview;
