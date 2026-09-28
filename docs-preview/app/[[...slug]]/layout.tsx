import { QuantinuumDocsLayout } from "@quantinuum/documentation-ui/docs-kit";
import type { ReactNode } from "react";

import { source } from "@/lib/source";
import { PreviewBanner } from "@/components/preview-banner";
import { previewSettings } from "@/lib/preview-settings";

export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <QuantinuumDocsLayout
      tree={source.pageTree}
      activePath={previewSettings.basePath}
      banner={<PreviewBanner />}
      highlightCiteTargets
    >
      {children}
    </QuantinuumDocsLayout>
  );
}
