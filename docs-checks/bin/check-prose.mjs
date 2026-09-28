#!/usr/bin/env node
// Terminology and grammar checker for Quantinuum documentation.
//
//   docs-check-prose                     check the configured files (default: docs/**/*.mdx)
//   docs-check-prose src/app/page.tsx    check specific files/directories
//   docs-check-prose --strict            fail on warnings too
//   docs-check-prose --list-rules        print Harper's rule names
//
// Accepts the same --config / --words / --api-reference options as
// docs-check-spelling, which runs cspell over the same extracted prose.

import { loadContext } from "../src/context.mjs";
import {
  loadBaseWords,
  loadProductWords,
  moduleForFile,
} from "../src/prose/dictionaries.mjs";
import { extractFile } from "../src/prose/extract.mjs";
import { discoverFiles, resolveArguments } from "../src/prose/files.mjs";
import { createGrammarChecker } from "../src/prose/harper.mjs";
import { reportJson, reportText } from "../src/prose/report.mjs";
import { joinSegments, PositionIndex } from "../src/prose/segments.mjs";
import {
  checkTerminology,
  compileTerminology,
} from "../src/prose/terminology.mjs";

async function main() {
  const { config, argv } = await loadContext(process.argv.slice(2));
  const options = parseArguments(argv);

  if (options.listRules) {
    const checker = await createGrammarChecker({ dialect: config.dialect });
    process.stdout.write(`${(await checker.listRules()).join("\n")}\n`);
    await checker.dispose();
    return 0;
  }

  const files =
    options.files.length > 0
      ? await resolveArguments(options.files)
      : await discoverFiles();

  if (files.length === 0) {
    process.stderr.write("No files to check. Build the documentation first?\n");
    return 0;
  }

  const rules = compileTerminology(config.terminology);
  const warnOnlyKinds = new Set(config.harper.warnOnlyKinds ?? []);

  const baseWords = await loadBaseWords();
  const productWords = await loadProductWords();

  const grammar = options.grammar
    ? await createGrammarChecker({
        dialect: config.dialect,
        rules: config.harper.rules,
        words: baseWords,
      })
    : null;

  const started = Date.now();
  const findings = [];

  // Files are sorted, so each product's pages are contiguous and the word list
  // is swapped once per product rather than once per file.
  let loadedModule;

  for (const file of files) {
    const module = moduleForFile(file);

    if (grammar && module !== loadedModule) {
      loadedModule = module;
      await grammar.setWords([
        ...baseWords,
        ...(productWords.get(module)?.words ?? []),
      ]);
    }

    findings.push(
      ...(await checkFile(file, {
        config,
        rules,
        grammar,
        warnOnlyKinds,
        options,
      })),
    );
  }

  if (grammar) await grammar.dispose();

  const elapsedMs = Date.now() - started;

  if (options.json) reportJson(findings);
  else reportText(findings, { fileCount: files.length, elapsedMs });

  const failing = findings.filter(
    (finding) => finding.severity === "error" || options.strict,
  );
  return failing.length > 0 ? 1 : 0;
}

async function checkFile(
  file,
  { config, rules, grammar, warnOnlyKinds, options },
) {
  const { source, segments, error } = await extractFile(file);

  if (error) {
    return [
      {
        file,
        line: 1,
        column: 1,
        severity: "error",
        message: `Could not read or parse file: ${error}`,
        ruleId: "parse",
        source: "prose",
      },
    ];
  }

  const document = joinSegments(segments);
  if (!document) return [];

  const positions = new PositionIndex(source);
  const findings = [];

  const locate = (index) => positions.locate(document.sourceOffset(index));

  if (options.terminology) {
    for (const finding of checkTerminology(document, rules)) {
      const { line, column } = locate(finding.index);
      findings.push({
        file,
        line,
        column,
        severity: config.terminologySeverity,
        message: `Use "${finding.expected}" instead of "${finding.actual}"`,
        ruleId: finding.ruleId,
        source: "terminology",
      });
    }
  }

  if (grammar) {
    for (const finding of await grammar.lint(document)) {
      if (isSuppressed(config, finding)) continue;

      const { line, column } = locate(finding.index);
      const suggestion = finding.suggestions[0];
      findings.push({
        file,
        line,
        column,
        severity: warnOnlyKinds.has(finding.kind) ? "warning" : "error",
        message: suggestion
          ? `${finding.message} (suggested: "${suggestion}")`
          : finding.message,
        ruleId: finding.kind,
        source: "grammar",
      });
    }
  }

  return dedupe(findings).sort(
    (a, b) => a.line - b.line || a.column - b.column,
  );
}

// Terminology and grammar often catch the same word ("python" -> "Python").
// Reporting both is just noise, and the house style file is the authority, so
// the terminology finding wins.
function dedupe(findings) {
  const byPosition = new Map();

  for (const finding of findings) {
    const key = `${finding.line}:${finding.column}`;
    const existing = byPosition.get(key);
    if (!existing) {
      byPosition.set(key, finding);
      continue;
    }
    if (existing.source !== "terminology" && finding.source === "terminology") {
      byPosition.set(key, finding);
    }
  }

  return [...byPosition.values()];
}

// Harper hard-codes a few preferences that clash with house style (it insists on
// "WASM", for example) and they are not individually switchable, so they are
// suppressed by matching the flagged text instead.
function isSuppressed(config, finding) {
  return (config.harper.ignore ?? []).some(
    (entry) =>
      (entry.kind === undefined || entry.kind === finding.kind) &&
      (entry.text === undefined || entry.text === finding.problemText),
  );
}

function parseArguments(argv) {
  const options = {
    files: [],
    json: false,
    strict: false,
    grammar: true,
    terminology: true,
    listRules: false,
  };

  for (const argument of argv) {
    switch (argument) {
      case "--json":
        options.json = true;
        break;
      case "--strict":
        options.strict = true;
        break;
      case "--no-grammar":
        options.grammar = false;
        break;
      case "--no-terminology":
        options.terminology = false;
        break;
      case "--list-rules":
        options.listRules = true;
        break;
      default:
        if (argument.startsWith("--")) {
          throw new Error(`Unknown option: ${argument}`);
        }
        options.files.push(argument);
        break;
    }
  }

  return options;
}

process.exitCode = await main();
