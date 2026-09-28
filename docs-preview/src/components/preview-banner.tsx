import {
  InquantoLogo,
  LambeqLogo,
  NexusLogo,
  OriginLogo,
  SystemsLogo,
  TKETLogo,
} from "@quantinuum/documentation-ui/docs-kit";
import type { ComponentProps } from "react";

import { previewSettings } from "@/lib/preview-settings";

const LOGOS: Record<string, (props: ComponentProps<"svg">) => React.ReactNode> = {
  origin: OriginLogo,
  inquanto: InquantoLogo,
  lambeq: LambeqLogo,
  nexus: NexusLogo,
  systems: SystemsLogo,
  tket: TKETLogo,
};

/** Sidebar banner: the module's wordmark when the kit ships one, else its name. */
export function PreviewBanner() {
  const { basePath, moduleName } = previewSettings;
  const Logo = LOGOS[moduleName];
  return (
    <a href={basePath} aria-label={`${moduleName || "Documentation"} preview home`}>
      {Logo ? (
        <Logo className="h-6 w-auto" />
      ) : (
        <span className="font-semibold capitalize">{moduleName || "Docs preview"}</span>
      )}
    </a>
  );
}
