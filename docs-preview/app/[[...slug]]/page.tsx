import { QuantinuumDocsPage } from "@quantinuum/documentation-ui/docs-kit";
import { notFound, redirect } from "next/navigation";

import { basePathSegments, source } from "@/lib/source";

// Incoming slugs carry the published URL prefix (e.g. ["origin", "user_guides",
// ...]) because the harness serves the docs at their real paths, so root-absolute
// links and asset URLs inside the MDX resolve unchanged.
function stripBasePath(slug: string[] = []) {
  return basePathSegments.every((segment, i) => slug[i] === segment)
    ? slug.slice(basePathSegments.length)
    : null;
}

type TreeNode = { type: string; url?: string; index?: TreeNode; children?: TreeNode[] };

/** The first page in sidebar order. */
function firstPageUrl(nodes: TreeNode[]): string | undefined {
  for (const node of nodes) {
    if (node.type === "page" && node.url) return node.url;
    if (node.type === "folder") {
      const url = node.index?.url ?? firstPageUrl(node.children ?? []);
      if (url) return url;
    }
  }
  return undefined;
}

export default async function Page(props: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug = [] } = await props.params;
  const pageSlug = stripBasePath(slug);
  const page = pageSlug ? source.getPage(pageSlug) : null;
  if (!page) {
    // A product's landing page lives on the central site, so the preview's own
    // root and base path open the first page of the docs instead.
    if (slug.length === 0 || pageSlug?.length === 0) {
      const first = firstPageUrl(source.pageTree.children as TreeNode[]);
      if (first) redirect(first);
    }
    notFound();
  }

  return (
    <QuantinuumDocsPage
      body={page.data.body}
      title={page.data.title}
      description={page.data.description}
      toc={page.data.toc}
    />
  );
}

export function generateStaticParams() {
  const params = source.generateParams().map(({ slug = [] }) => ({
    slug: [...basePathSegments, ...slug],
  }));
  // Also the site root and base path, which redirect when they have no page.
  const seen = new Set(params.map(({ slug }) => slug.join("/")));
  for (const slug of [[], basePathSegments]) {
    if (!seen.has(slug.join("/"))) {
      seen.add(slug.join("/"));
      params.push({ slug });
    }
  }
  return params;
}
