// Console and JSON reporting for the prose checker.

import path from "node:path";

const useColour = process.stdout.isTTY && process.env.NO_COLOR === undefined;
const inGitHubActions = process.env.GITHUB_ACTIONS === "true";

const paint = (code, value) =>
  useColour ? `\u001B[${code}m${value}\u001B[0m` : value;

const style = {
  bold: (value) => paint("1", value),
  dim: (value) => paint("2", value),
  red: (value) => paint("31", value),
  yellow: (value) => paint("33", value),
  cyan: (value) => paint("36", value),
};

const MAX_EXCERPT = 100;
const EXCERPT_LEAD = 40;

// The source line around a finding, minus indentation; long lines are windowed.
export function excerptLine(line, start, length) {
  const lineStart = line.length - line.trimStart().length;
  const lineEnd = line.trimEnd().length;
  let from = lineStart;
  let to = lineEnd;

  if (to - from > MAX_EXCERPT) {
    from = Math.max(
      lineStart,
      Math.min(start - EXCERPT_LEAD, lineEnd - MAX_EXCERPT),
    );
    to = from + MAX_EXCERPT;
  }

  const prefix = from > lineStart ? "…" : "";
  const suffix = to < lineEnd ? "…" : "";
  return {
    text: `${prefix}${line.slice(from, to)}${suffix}`,
    start: prefix.length + start - from,
    length: Math.max(1, Math.min(length, to - start)),
  };
}

/**
 * @param {{ file: string, line: number, column: number, severity: string, message: string, ruleId: string, source: string, context?: { text: string, start: number, length: number } }[]} findings
 */
export function reportText(findings, { fileCount, elapsedMs }) {
  if (findings.length === 0) {
    process.stdout.write(
      `${style.bold("Prose check passed")} ${style.dim(
        `(${fileCount} files, ${(elapsedMs / 1000).toFixed(1)}s)`,
      )}\n`,
    );
    return;
  }

  const byFile = new Map();
  for (const finding of findings) {
    if (!byFile.has(finding.file)) byFile.set(finding.file, []);
    byFile.get(finding.file).push(finding);
  }

  for (const [file, fileFindings] of byFile) {
    process.stdout.write(`\n${style.bold(style.cyan(file))}\n`);

    for (const finding of fileFindings) {
      if (inGitHubActions) {
        process.stdout.write(annotation(finding));
        continue;
      }

      const position = `${finding.line}:${finding.column}`.padEnd(9);
      const severity =
        finding.severity === "error"
          ? style.red("error  ")
          : style.yellow("warning");

      process.stdout.write(
        `  ${style.dim(position)} ${severity}  ${finding.message}  ${style.dim(
          `${finding.source}/${finding.ruleId}`,
        )}\n`,
      );

      if (finding.context) {
        const { text, start, length } = finding.context;
        const indent = " ".repeat(12);
        process.stdout.write(
          `${indent}${text}\n${indent}${" ".repeat(start)}${style.red(
            "^".repeat(length),
          )}\n`,
        );
      }
    }
  }

  const errors = findings.filter(
    (finding) => finding.severity === "error",
  ).length;
  const warnings = findings.length - errors;

  process.stdout.write(
    `\n${style.bold(`${findings.length} problems`)} ` +
      `(${style.red(`${errors} errors`)}, ${style.yellow(`${warnings} warnings`)}) ` +
      `${style.dim(`in ${fileCount} files, ${(elapsedMs / 1000).toFixed(1)}s`)}\n`,
  );

  if (findings.some((finding) => finding.file.startsWith("generated/"))) {
    process.stdout.write(
      `\n${style.dim(
        "Note: files under generated/ are built from the product documentation " +
          "sources by scripts/generate-docs.mjs.\nFix those findings in the " +
          "upstream module's source files, then re-run `pnpm generate-docs`.",
      )}\n`,
    );
  }
}

export function reportJson(findings) {
  process.stdout.write(`${JSON.stringify(findings, null, 2)}\n`);
}

// A workflow command per finding. The runner's stock eslint-stylish matcher
// stops at the first excerpt line, so it cannot be relied on here.
function annotation(finding) {
  const workspace = process.env.GITHUB_WORKSPACE ?? process.cwd();
  const properties = {
    file: path.relative(workspace, path.resolve(finding.file)),
    line: finding.line,
    col: finding.column,
    title: `${finding.source}/${finding.ruleId}`,
  };

  let message = `${finding.line}:${finding.column}  ${finding.message}  ${properties.title}`;
  if (finding.context) {
    const { text, start, length } = finding.context;
    properties.endColumn = finding.column + length;
    message += `\n    ${text}\n    ${" ".repeat(start)}${"^".repeat(length)}`;
  }

  const command = finding.severity === "error" ? "error" : "warning";
  const props = Object.entries(properties)
    .map(([key, value]) => `${key}=${escapeProperty(String(value))}`)
    .join(",");
  return `::${command} ${props}::${escapeData(message)}\n`;
}

const escapeData = (value) =>
  value.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");

const escapeProperty = (value) =>
  escapeData(value).replace(/:/g, "%3A").replace(/,/g, "%2C");
