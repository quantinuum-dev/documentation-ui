// Terminology rules: enforce a single house spelling for phrases that are
// otherwise written inconsistently ("2-qubit" vs "two-qubit", "Github" vs
// "GitHub"). Rules run only over prose, never over the placeholders that stand
// in for code spans and expressions.

const ESCAPE_PATTERN = /[.*+?^${}()|[\]\\]/g;

const escapeRegExp = (value) => value.replace(ESCAPE_PATTERN, "\\$&");

/**
 * @param {(string | object)[]} terms
 * @returns {object[]}
 */
export function compileTerminology(terms) {
  return terms.map((term) => {
    if (typeof term === "string") {
      return {
        id: term,
        regex: new RegExp(`\\b${escapeRegExp(term)}\\b`, "gi"),
        // A bare string means "this exact capitalisation", so the replacement
        // is the term itself and only differently-cased matches are reported.
        replacement: term,
        exactCase: true,
      };
    }

    const {
      pattern,
      replacement,
      name,
      word = true,
      caseSensitive = false,
    } = term;
    const body = word ? `\\b(?:${pattern})\\b` : pattern;
    return {
      id: name ?? replacement,
      regex: new RegExp(body, caseSensitive ? "g" : "gi"),
      replacement,
      exactCase: false,
    };
  });
}

/**
 * @param {import("./segments.mjs").Segment} document
 * @param {object[]} rules
 * @returns {{ index: number, length: number, actual: string, expected: string, ruleId: string }[]}
 */
export function checkTerminology(document, rules) {
  const findings = [];

  for (const rule of rules) {
    rule.regex.lastIndex = 0;
    let match = rule.regex.exec(document.text);

    while (match !== null) {
      const actual = match[0];
      const start = match.index;
      const end = start + actual.length;

      if (document.isProse(start, end)) {
        const expected = rule.exactCase
          ? rule.replacement
          : applyBackreferences(rule.replacement, match);

        if (actual !== expected) {
          findings.push({
            index: start,
            length: actual.length,
            actual,
            expected,
            ruleId: rule.id,
          });
        }
      }

      // Guard against zero-length matches looping forever.
      if (rule.regex.lastIndex === match.index) rule.regex.lastIndex += 1;
      match = rule.regex.exec(document.text);
    }
  }

  return findings.sort((a, b) => a.index - b.index);
}

function applyBackreferences(replacement, match) {
  return replacement.replace(
    /\$(\d)/g,
    (_, digit) => match[Number(digit)] ?? "",
  );
}
