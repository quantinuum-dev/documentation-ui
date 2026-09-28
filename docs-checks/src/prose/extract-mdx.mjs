// Pulls reader-facing prose out of MDX.
//
// This is the part Vale could not do: `remark-mdx` parses custom components
// into a real syntax tree, so prose nested inside `<Callout>`, `<Tab>` and
// friends becomes ordinary text nodes. Prose passed as JSX *attributes* is not
// part of the children, so it is collected separately.

import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkMdx from "remark-mdx";
import remarkParse from "remark-parse";
import { unified } from "unified";

import { pushMarkdownText, SegmentBuilder } from "./segments.mjs";

// Mirrors the site's own pipeline in source.config.ts. remark-math matters here
// as well as at build time: without it `$\frac{a}{b}$` parses as a JSX
// expression and the whole file fails.
const processor = unified()
  .use(remarkParse)
  .use(remarkFrontmatter, ["yaml"])
  .use(remarkGfm)
  .use(remarkMath)
  .use(remarkMdx);

// Block nodes whose children are inline content, i.e. the natural unit of prose.
const PROSE_BLOCKS = new Set(["paragraph", "heading", "tableCell"]);

// Nodes that carry no prose at all. `definition` is a link reference
// (`[id]: https://...`); footnote definitions are *not* listed because the
// converted docs put their bibliographies there.
const SKIPPED = new Set([
  "code",
  "definition",
  "html",
  "mdxjsEsm",
  "math",
  "thematicBreak",
  "yaml",
]);

// Inline nodes whose children should flow into the surrounding sentence.
const INLINE_CONTAINERS = new Set([
  "delete",
  "emphasis",
  "footnote",
  "link",
  "linkReference",
  "strong",
]);

const isJsxElement = (node) =>
  node.type === "mdxJsxFlowElement" || node.type === "mdxJsxTextElement";

// Notebook outputs embed whole HTML documents as entity-escaped text (the
// pytket circuit renderer, plotly, ...). Once decoded these are markup, not
// prose, and every rule fires on them.
//
// The test is proportional rather than "contains a tag": ordinary prose does
// carry the odd `<sub>` or `<br>`, and dropping those paragraphs would lose
// real sentences along with them.
const HTML_TAG = /<\/?[a-zA-Z][a-zA-Z0-9-]*(?:\s[^<>]*)?\/?>/g;
const DOCUMENT_MARKUP = /<!DOCTYPE|<script[\s>]|<iframe[\s>]|<style[\s>]/i;
const MARKUP_SHARE = 0.3;

function looksLikeMarkup(text) {
  if (DOCUMENT_MARKUP.test(text)) return true;

  let tagged = 0;
  for (const match of text.matchAll(HTML_TAG)) tagged += match[0].length;
  return tagged / text.length > MARKUP_SHARE;
}

/**
 * @param {string} source
 * @param {import("./types.mjs").ProseConfig} config
 * @param {{ apiReference?: boolean }} [options]
 * @returns {import("./segments.mjs").Segment[]}
 */
export function extractMdx(source, config, options = {}) {
  const tree = processor.parse(source);
  const ctx = {
    source,
    config,
    proseAttributes: new Set(config.proseAttributes),
    apiReference: options.apiReference === true,
    segments: [],
  };

  // In the API reference the title is always the module or class name.
  if (!ctx.apiReference) extractFrontmatterTitle(tree, ctx);
  walk(tree, ctx);
  return ctx.segments;
}

// quartodoc renders each member as `### name [#module.qualified.name]`. The
// visible part is an identifier, not prose.
const MEMBER_HEADING = /\[#[\w.]+\]\s*$/;

function walk(node, ctx) {
  if (!node || typeof node !== "object") return;

  if (isJsxElement(node)) collectAttributes(node, ctx);

  if (ctx.apiReference && node.type === "table") {
    collectApiTable(node, ctx);
    return;
  }

  if (PROSE_BLOCKS.has(node.type)) {
    const builder = new SegmentBuilder();
    collectInline(node, builder, ctx);
    const segment = builder.build();
    if (!segment) return;
    if (looksLikeMarkup(segment.text)) return;
    if (
      ctx.apiReference &&
      node.type === "heading" &&
      MEMBER_HEADING.test(segment.text)
    ) {
      return;
    }
    ctx.segments.push(segment);
    return;
  }

  if (SKIPPED.has(node.type)) return;

  if (isCitationFootnote(node, ctx)) return;

  // Bibliography entries are preceded by their own anchor, so an anchor from
  // the configured namespace marks the paragraph that follows as citation data:
  // author lists, paper titles and journal names rather than anything anyone
  // would write or correct here.
  let citationPending = false;

  for (const child of node.children ?? []) {
    if (isCitationAnchor(child, ctx)) {
      citationPending = true;
      continue;
    }

    if (citationPending && child.type === "paragraph") {
      citationPending = false;
      continue;
    }

    citationPending = false;
    walk(child, ctx);
  }
}

function citationPrefixes(ctx) {
  return ctx.config.citationPrefixes ?? [];
}

function isCitationAnchor(node, ctx) {
  if (node?.type !== "mdxJsxFlowElement" || node.name !== "a") return false;

  return (node.attributes ?? []).some(
    (attribute) =>
      attribute.type === "mdxJsxAttribute" &&
      attribute.name === "id" &&
      typeof attribute.value === "string" &&
      citationPrefixes(ctx).some((prefix) =>
        attribute.value.startsWith(prefix),
      ),
  );
}

function isCitationFootnote(node, ctx) {
  return (
    node.type === "footnoteDefinition" &&
    typeof node.identifier === "string" &&
    citationPrefixes(ctx).some((prefix) => node.identifier.startsWith(prefix))
  );
}

function collectInline(node, builder, ctx, fallback) {
  // Some nodes arrive without a position (remark-gfm synthesises them when it
  // splits autolink literals, for example). Defaulting those to offset 0 would
  // write their text at the top of the file, so each child inherits the end of
  // the previous sibling instead.
  let cursor = fallback ?? node.position?.start?.offset ?? 0;

  for (const child of node.children ?? []) {
    const offset = child.position?.start?.offset ?? cursor;

    switch (child.type) {
      case "text": {
        const end = child.position?.end?.offset;
        const raw = end === undefined ? null : ctx.source.slice(offset, end);
        if (raw === null || raw === child.value)
          builder.push(child.value, offset);
        else pushMarkdownText(builder, raw, offset);
        break;
      }

      case "inlineCode":
        builder.pushPlaceholder(ctx.config.placeholders.code, offset);
        break;

      case "inlineMath":
        builder.pushPlaceholder(ctx.config.placeholders.math, offset);
        break;

      case "mdxTextExpression":
        builder.pushPlaceholder(ctx.config.placeholders.expression, offset);
        break;

      case "break":
        builder.pad(" ");
        break;

      case "image":
      case "imageReference":
        // Alt text is a caption in its own right, not part of this sentence.
        pushStandalone(child.alt, offset, ctx);
        break;

      case "mdxJsxTextElement":
        collectAttributes(child, ctx);
        collectInline(child, builder, ctx, offset);
        break;

      case "html":
      case "footnoteReference":
        break;

      default:
        if (INLINE_CONTAINERS.has(child.type))
          collectInline(child, builder, ctx, offset);
        else if (child.children) collectInline(child, builder, ctx, offset);
        break;
    }

    cursor = child.position?.end?.offset ?? cursor;
  }
}

// Every table quartodoc emits is `Name | [Type |] Description [| Default]`, so
// only the Description column holds docstring prose. The rest are identifiers,
// type expressions and default values.
function collectApiTable(node, ctx) {
  const rows = (node.children ?? []).filter((row) => row.type === "tableRow");
  const [header, ...body] = rows;
  if (!header) return;

  const proseColumns = new Set();
  (header.children ?? []).forEach((cell, index) => {
    if (cellText(cell, ctx).trim().toLowerCase() === "description") {
      proseColumns.add(index);
    }
  });

  // An unrecognised table shape is left alone rather than silently dropped.
  if (proseColumns.size === 0) {
    for (const row of rows) walkCells(row, ctx);
    return;
  }

  for (const row of body) {
    (row.children ?? []).forEach((cell, index) => {
      if (proseColumns.has(index)) walk(cell, ctx);
    });
  }
}

function walkCells(row, ctx) {
  for (const cell of row.children ?? []) walk(cell, ctx);
}

function cellText(cell, ctx) {
  const builder = new SegmentBuilder();
  collectInline(cell, builder, ctx);
  return builder.text;
}

function collectAttributes(node, ctx) {
  for (const attribute of node.attributes ?? []) {
    if (attribute.type !== "mdxJsxAttribute") continue;
    if (typeof attribute.value !== "string") continue;
    if (!ctx.proseAttributes.has(attribute.name)) continue;

    // Attribute nodes have a position but the value's own offset is not
    // recorded, so locate the quoted value inside the attribute's source text.
    const start =
      attribute.position?.start?.offset ?? node.position?.start?.offset ?? 0;
    const end = attribute.position?.end?.offset ?? start;
    const raw = ctx.source.slice(start, end);
    const quoteIndex = raw.search(/["']/);
    const offset = quoteIndex === -1 ? start : start + quoteIndex + 1;

    pushStandalone(attribute.value, offset, ctx);
  }
}

function extractFrontmatterTitle(tree, ctx) {
  const yaml = tree.children?.find((child) => child.type === "yaml");
  if (!yaml || typeof yaml.value !== "string") return;

  const match = /^title:[ \t]*(.+)$/m.exec(yaml.value);
  if (!match) return;

  const blockStart = ctx.source.indexOf(
    yaml.value,
    yaml.position?.start?.offset ?? 0,
  );
  if (blockStart === -1) return;

  let value = match[1].trim();
  let offset = blockStart + match.index + match[0].length - match[1].length;

  const quoted = /^(["'])(.*)\1$/.exec(value);
  if (quoted) {
    value = quoted[2];
    offset += 1;
  }

  pushStandalone(value, offset, ctx);
}

function pushStandalone(value, offset, ctx) {
  if (typeof value !== "string" || value.trim().length === 0) return;
  const builder = new SegmentBuilder();
  builder.push(value, offset);
  const segment = builder.build();
  if (segment) ctx.segments.push(segment);
}
