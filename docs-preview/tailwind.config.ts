import { tailwindTheme } from "@quantinuum/documentation-ui/tailwindTheme";
import path from "node:path";
import { createRequire } from "node:module";
import type { Config } from "tailwindcss";

const require = createRequire(import.meta.url);

export default {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
    // The shared kit's markup ships prebuilt, so its utility classes have to be
    // scanned here or the harness renders unstyled chrome.
    path.join(
      path.dirname(require.resolve("@quantinuum/documentation-ui")),
      "**/*.{js,ts,jsx,tsx,mdx}",
    ),
    path.join(
      path.dirname(require.resolve("@quantinuum/quantinuum-ui")),
      "**/*.{js,ts,jsx,tsx,mdx}",
    ),
  ],
  presets: [tailwindTheme],
} satisfies Config;
