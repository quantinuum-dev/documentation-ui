import type { Metadata } from "next";
import { Figtree, Rajdhani, Source_Code_Pro } from "next/font/google";
import type { ReactNode } from "react";

import "@/styles/globals.css";
// KaTeX styles for `$...$` math rendered via remark-math/rehype-katex.
import "katex/dist/katex.min.css";

// The shared docs theme reads these variables, so the harness has to define the
// same three the central site does or the brand typography silently falls back.
const figtree = Figtree({ subsets: ["latin"], variable: "--font-origin-sans" });
const rajdhani = Rajdhani({
  subsets: ["latin"],
  variable: "--font-origin-accent",
  weight: ["500", "700"],
});
const sourceCodePro = Source_Code_Pro({
  subsets: ["latin"],
  variable: "--font-code",
});

export const metadata: Metadata = {
  title: "Documentation preview",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${figtree.variable} ${rajdhani.variable} ${sourceCodePro.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
