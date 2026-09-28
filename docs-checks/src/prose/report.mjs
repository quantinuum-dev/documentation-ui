// Console and JSON reporting for the prose checker.

const useColour = process.stdout.isTTY && process.env.NO_COLOR === undefined;

const paint = (code, value) =>
  useColour ? `\u001B[${code}m${value}\u001B[0m` : value;

const style = {
  bold: (value) => paint("1", value),
  dim: (value) => paint("2", value),
  red: (value) => paint("31", value),
  yellow: (value) => paint("33", value),
  cyan: (value) => paint("36", value),
};

/**
 * @param {{ file: string, line: number, column: number, severity: string, message: string, ruleId: string, source: string }[]} findings
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
