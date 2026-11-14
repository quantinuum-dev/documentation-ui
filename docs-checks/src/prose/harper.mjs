// Grammar checking via harper.js — Harper's Rust engine compiled to WebAssembly,
// so it runs in-process with no server to manage.
//
// Harper is fed the *extracted* prose rather than raw files. Its own Markdown
// parser does not understand MDX components, so driving it from the extractor
// is what gives it full coverage of component children and attributes.

/**
 * @param {object} options
 * @param {string} options.dialect
 * @param {Record<string, boolean>} [options.rules]
 * @param {string[]} [options.words]
 */
export async function createGrammarChecker({ dialect, rules, words }) {
  const harper = await import("harper.js");
  const { binary } = await import("harper.js/binary");

  const resolvedDialect = harper.Dialect[dialect];
  if (resolvedDialect === undefined) {
    throw new Error(
      `Unknown dialect "${dialect}". Expected one of: ${Object.keys(
        harper.Dialect,
      )
        .filter((key) => Number.isNaN(Number(key)))
        .join(", ")}`,
    );
  }

  const linter = new harper.LocalLinter({ binary, dialect: resolvedDialect });
  await linter.setup();

  if (words?.length) await linter.importWords(words);

  if (rules && Object.keys(rules).length > 0) {
    const current = await linter.getLintConfig();
    const unknown = Object.keys(rules).filter((rule) => !(rule in current));
    if (unknown.length > 0) {
      throw new Error(
        `Unknown Harper rule(s) in the prose config: ${unknown.join(", ")}. ` +
          "Run `docs-check-prose --list-rules` to see the available names.",
      );
    }
    await linter.setLintConfig({ ...current, ...rules });
  }

  return {
    /**
     * Replaces the imported word list. Only affects words added via
     * `importWords`; the built-in dictionary is untouched.
     */
    async setWords(replacement) {
      await linter.clearWords();
      if (replacement?.length) await linter.importWords(replacement);
    },

    /**
     * @param {import("./segments.mjs").Segment} document
     * @returns {Promise<{ index: number, length: number, message: string, kind: string, suggestions: string[] }[]>}
     */
    async lint(document) {
      const lints = await linter.lint(document.text);
      const findings = [];

      for (const lint of lints) {
        const span = lint.span();
        if (!document.isProse(span.start, span.end)) continue;

        findings.push({
          index: span.start,
          length: span.end - span.start,
          message: lint.message(),
          kind: lint.lint_kind(),
          problemText: lint.get_problem_text(),
          suggestions: lint
            .suggestions()
            .map((suggestion) => suggestion.get_replacement_text())
            .filter((text) => typeof text === "string" && text.length > 0),
        });
      }

      return findings.sort((a, b) => a.index - b.index);
    },

    async listRules() {
      return Object.keys(await linter.getLintConfig()).sort();
    },

    async dispose() {
      await linter.dispose();
    },
  };
}
