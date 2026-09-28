// Prose segments and the machinery that maps a position inside extracted prose
// back to a line/column in the original MDX or TSX file.
//
// A segment is a run of reader-facing text (a paragraph, a heading, one JSX
// attribute value, ...). Because prose is stitched together from many source
// nodes, each segment keeps a list of `pieces` recording where each slice of
// text came from in the file.

/**
 * @typedef {object} Piece
 * @property {number} textStart Index of the slice within the segment text.
 * @property {number} textEnd   End index (exclusive) within the segment text.
 * @property {number} offset    Offset of the slice in the source file.
 * @property {boolean} prose    False for placeholder text standing in for code.
 */

export class SegmentBuilder {
  constructor() {
    this.text = "";
    this.pieces = [];
  }

  /** Append reader-facing text originating at `offset` in the source file. */
  push(value, offset) {
    this.#append(value, offset, true);
  }

  /** Append stand-in text for a non-prose node (code span, math, expression). */
  pushPlaceholder(value, offset) {
    this.#append(value, offset, false);
  }

  /** Append separator text that maps to nothing in particular. */
  pad(value = " ") {
    if (this.text.length > 0 && !this.text.endsWith(value)) this.text += value;
  }

  #append(value, offset, prose) {
    if (typeof value !== "string" || value.length === 0) return;
    this.pieces.push({
      textStart: this.text.length,
      textEnd: this.text.length + value.length,
      offset,
      prose,
    });
    this.text += value;
  }

  /** @returns {Segment | null} */
  build() {
    if (!this.pieces.some((piece) => piece.prose)) return null;
    if (this.text.trim().length === 0) return null;
    return new Segment(this.text, this.pieces);
  }
}

export class Segment {
  /**
   * @param {string} text
   * @param {Piece[]} pieces
   */
  constructor(text, pieces) {
    this.text = text;
    this.pieces = pieces;
  }

  /** Source-file offset for `index` within this segment's text. */
  sourceOffset(index) {
    let fallback = this.pieces[0]?.offset ?? 0;
    for (const piece of this.pieces) {
      if (index < piece.textStart) return fallback;
      if (index < piece.textEnd)
        return piece.offset + (index - piece.textStart);
      fallback = piece.offset + (piece.textEnd - piece.textStart);
    }
    return fallback;
  }

  /** True when the whole range lies inside reader-facing prose. */
  isProse(start, end) {
    for (const piece of this.pieces) {
      if (piece.textEnd <= start || piece.textStart >= end) continue;
      if (!piece.prose) return false;
    }
    return true;
  }
}

/**
 * Joins a file's segments into a single document so grammar checking can run
 * once per file instead of once per paragraph. Segments are separated by blank
 * lines so the checker still treats them as unrelated blocks.
 *
 * @param {Segment[]} segments
 * @returns {Segment | null}
 */
export function joinSegments(segments) {
  const separator = "\n\n";
  let text = "";
  const pieces = [];

  for (const segment of segments) {
    if (text.length > 0) text += separator;
    const shift = text.length;
    for (const piece of segment.pieces) {
      pieces.push({
        textStart: piece.textStart + shift,
        textEnd: piece.textEnd + shift,
        offset: piece.offset,
        prose: piece.prose,
      });
    }
    text += segment.text;
  }

  if (pieces.length === 0) return null;
  return new Segment(text, pieces);
}

const MARKDOWN_ESCAPABLE = /[!-/:-@[-`{-~]/;

const NAMED_ENTITIES = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
};

const ENTITY_PATTERN = /^&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|([a-zA-Z]+));/;

/**
 * Appends Markdown text taken straight from the source, resolving backslash
 * escapes and character references while keeping every offset exact.
 *
 * The mdast `value` of a text node has both already resolved, so it is shorter
 * than the source it came from and offsets after the first escape would drift.
 * Pandoc-generated content escapes apostrophes (`installer\'s`) and notebook
 * output is entity-encoded (`1&lt;=signal`), so this is routine rather than
 * rare.
 *
 * @param {SegmentBuilder} builder
 * @param {string} raw Source slice covering the text node.
 * @param {number} start Offset of that slice in the file.
 * @param {{ escapes?: boolean }} [options] Backslash escapes are Markdown-only;
 *   JSX text carries character references but no backslash escapes.
 */
export function pushMarkdownText(builder, raw, start, options = {}) {
  const { escapes = true } = options;
  let index = 0;
  let runStart = 0;

  const flush = (upTo) => {
    if (upTo > runStart)
      builder.push(raw.slice(runStart, upTo), start + runStart);
  };

  while (index < raw.length) {
    if (
      escapes &&
      raw[index] === "\\" &&
      index + 1 < raw.length &&
      MARKDOWN_ESCAPABLE.test(raw[index + 1])
    ) {
      flush(index);
      builder.push(raw[index + 1], start + index + 1);
      index += 2;
      runStart = index;
      continue;
    }

    if (raw[index] === "&") {
      const decoded = decodeEntity(raw.slice(index, index + 12));
      if (decoded) {
        flush(index);
        builder.push(decoded.value, start + index);
        index += decoded.length;
        runStart = index;
        continue;
      }
    }

    index += 1;
  }

  flush(raw.length);
}

function decodeEntity(candidate) {
  const match = ENTITY_PATTERN.exec(candidate);
  if (!match) return null;

  const [entity, decimal, hex, name] = match;

  if (decimal !== undefined) {
    return {
      value: String.fromCodePoint(Number(decimal)),
      length: entity.length,
    };
  }
  if (hex !== undefined) {
    return {
      value: String.fromCodePoint(Number.parseInt(hex, 16)),
      length: entity.length,
    };
  }

  const named = NAMED_ENTITIES[name.toLowerCase()];
  return named ? { value: named, length: entity.length } : null;
}

/** Converts source-file offsets to 1-based line/column pairs. */
export class PositionIndex {
  constructor(source) {
    this.source = source;
    this.lineStarts = [0];
    for (let i = 0; i < source.length; i += 1) {
      if (source[i] === "\n") this.lineStarts.push(i + 1);
    }
  }

  locate(offset) {
    const clamped = Math.max(0, Math.min(offset, this.source.length));
    let low = 0;
    let high = this.lineStarts.length - 1;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (this.lineStarts[mid] <= clamped) low = mid;
      else high = mid - 1;
    }
    return { line: low + 1, column: clamped - this.lineStarts[low] + 1 };
  }

  /** The full source line containing `offset`, for error context. */
  lineText(offset) {
    const { line } = this.locate(offset);
    const start = this.lineStarts[line - 1];
    const end = this.source.indexOf("\n", start);
    return this.source.slice(start, end === -1 ? this.source.length : end);
  }
}
