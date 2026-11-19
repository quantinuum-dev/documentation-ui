// Builds a "masked" copy of a source file: every character that is not
// reader-facing prose is replaced by a space, and everything else stays at its
// original offset.
//
// This is how cspell is fed the MDX parse. Rather than mapping positions back
// afterwards, the masked copy is the same length and shape as the original, so
// any line/column cspell reports is already correct for the real file. It also
// means cspell keeps its own config, dictionary and suggestion handling instead
// of us reimplementing them.

// Longest source run that may collapse to fewer prose characters, i.e. a
// character reference such as `&#x1F600;`.
const MAX_COLLAPSE = 12;

/**
 * @param {string} source
 * @param {import("./segments.mjs").Segment[]} segments
 * @returns {string}
 */
export function maskNonProse(source, segments) {
  const mask = Array.from(source, (character) =>
    character === "\n" || character === "\r" ? character : " ",
  );

  for (const segment of segments) {
    let previous = null;
    let cursor = -1;

    for (const piece of segment.pieces) {
      if (!piece.prose) {
        previous = null;
        cursor = -1;
        continue;
      }

      const text = segment.text.slice(piece.textStart, piece.textEnd);
      let start = piece.offset;

      // A Markdown escape (`installer\'s`) is recorded as its own piece
      // starting at the escaped character. Writing one character earlier
      // consumes the blanked backslash instead of leaving a hole mid-word.
      if (start > 0 && source[start - 1] === "\\") start -= 1;

      // `couldn&apos;t` occupies 13 source characters but 8 prose ones, which
      // would otherwise leave five blanks inside the word and split it into two
      // unknown tokens. Pull the piece back to meet the previous one when they
      // are adjacent in the prose and only collapsed markup lies between them.
      if (
        previous !== null &&
        cursor >= 0 &&
        piece.textStart === previous.textEnd &&
        start > cursor &&
        start - cursor <= MAX_COLLAPSE &&
        !source.slice(cursor, start).includes("\n")
      ) {
        start = cursor;
      }

      // Copy the prose in, resynchronising at line breaks. A piece that spans a
      // wrapped line is written a character or two off its true offset (see
      // above), so without resynchronising the character following a newline
      // would land on the newline itself and be dropped, silently beheading the
      // first word of the line.
      let target = start;

      for (const character of text) {
        if (character === "\n" || character === "\r") {
          const newline = source.indexOf("\n", target);
          target = newline === -1 ? mask.length : newline + 1;
          continue;
        }

        while (
          target < mask.length &&
          (mask[target] === "\n" || mask[target] === "\r")
        ) {
          target += 1;
        }

        if (target >= mask.length) break;
        mask[target] = character;
        target += 1;
      }

      previous = piece;
      cursor = target;
    }
  }

  return mask.join("");
}
