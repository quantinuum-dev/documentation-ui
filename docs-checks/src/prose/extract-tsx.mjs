// Pulls reader-facing prose out of the TSX landing pages.
//
// The landing pages are React components rather than MDX, so their prose lives
// in JSX text nodes, a handful of prose-bearing JSX attributes, and string
// properties of the card/feature arrays. The TypeScript compiler API gives an
// exact syntax tree (and exact offsets) for all three.

import ts from "typescript";

import { pushMarkdownText, SegmentBuilder } from "./segments.mjs";

// Inline formatting tags whose text belongs to the surrounding sentence.
const INLINE_TAGS = new Set([
  "a",
  "b",
  "br",
  "code",
  "em",
  "i",
  "Link",
  "small",
  "span",
  "strong",
  "sub",
  "sup",
]);

/**
 * @param {string} source
 * @param {string} filePath
 * @param {import("./types.mjs").ProseConfig} config
 * @returns {import("./segments.mjs").Segment[]}
 */
export function extractTsx(source, filePath, config) {
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );

  const ctx = {
    source,
    config,
    proseAttributes: new Set(config.proseAttributes),
    proseProperties: new Set(config.proseProperties),
    segments: [],
    consumed: new Set(),
  };

  visit(sourceFile, ctx);
  return ctx.segments;
}

function visit(node, ctx) {
  if (ts.isJsxElement(node) || ts.isJsxFragment(node)) {
    if (!ctx.consumed.has(node)) {
      const builder = new SegmentBuilder();
      collectJsxChildren(node, builder, ctx);
      const segment = builder.build();
      if (segment) ctx.segments.push(segment);
    }
  } else if (ts.isJsxAttribute(node)) {
    collectAttribute(node, ctx);
  } else if (ts.isPropertyAssignment(node)) {
    collectProperty(node, ctx);
  }

  ts.forEachChild(node, (child) => visit(child, ctx));
}

function collectJsxChildren(node, builder, ctx) {
  for (const child of node.children ?? []) {
    if (ts.isJsxText(child)) {
      pushWords(builder, ctx.source.slice(child.pos, child.end), child.pos);
      continue;
    }

    if (ts.isJsxExpression(child)) {
      // `{" "}` is JSX's explicit space, not a value.
      const inner = child.expression;
      if (inner && ts.isStringLiteral(inner) && inner.text.trim() === "")
        builder.pad(" ");
      else
        builder.pushPlaceholder(
          ctx.config.placeholders.expression,
          child.getStart(),
        );
      continue;
    }

    const tag = jsxTagName(child);
    if (!tag || !INLINE_TAGS.has(tag)) continue;

    ctx.consumed.add(child);
    if (ts.isJsxElement(child)) collectJsxChildren(child, builder, ctx);
    else builder.pad(" ");
  }
}

function collectAttribute(node, ctx) {
  const name = node.name.getText();
  if (!ctx.proseAttributes.has(name)) return;

  const initializer = node.initializer;
  if (!initializer) return;

  if (ts.isStringLiteral(initializer)) {
    pushLiteral(initializer, ctx);
    return;
  }

  if (ts.isJsxExpression(initializer) && initializer.expression) {
    pushExpression(initializer.expression, ctx);
  }
}

function collectProperty(node, ctx) {
  const name =
    ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)
      ? node.name.text
      : null;
  if (!name || !ctx.proseProperties.has(name)) return;

  pushExpression(node.initializer, ctx);
}

function pushExpression(expression, ctx) {
  if (
    ts.isStringLiteral(expression) ||
    ts.isNoSubstitutionTemplateLiteral(expression)
  ) {
    pushLiteral(expression, ctx);
    return;
  }

  if (ts.isTemplateExpression(expression)) {
    const builder = new SegmentBuilder();
    builder.push(expression.head.text, expression.head.getStart() + 1);
    for (const span of expression.templateSpans) {
      builder.pushPlaceholder(
        ctx.config.placeholders.expression,
        span.expression.getStart(),
      );
      builder.push(span.literal.text, span.literal.getStart() + 1);
    }
    const segment = builder.build();
    if (segment) ctx.segments.push(segment);
  }
}

function pushLiteral(literal, ctx) {
  if (literal.text.trim().length === 0) return;
  const builder = new SegmentBuilder();
  // +1 skips the opening quote or backtick.
  builder.push(literal.text, literal.getStart() + 1);
  const segment = builder.build();
  if (segment) ctx.segments.push(segment);
}

// JSX collapses runs of whitespace, so each word is recorded separately to keep
// offsets exact while still producing a single readable sentence. Character
// references are resolved so contractions such as `couldn&apos;t` stay whole.
function pushWords(builder, raw, offset) {
  const pattern = /\S+/g;
  let match = pattern.exec(raw);
  while (match !== null) {
    builder.pad(" ");
    pushMarkdownText(builder, match[0], offset + match.index, {
      escapes: false,
    });
    match = pattern.exec(raw);
  }
}

function jsxTagName(node) {
  const opening = ts.isJsxElement(node)
    ? node.openingElement
    : ts.isJsxSelfClosingElement(node)
      ? node
      : null;
  return opening ? opening.tagName.getText() : null;
}
