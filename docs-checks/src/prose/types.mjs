/**
 * @typedef {object} ProseConfig
 * @property {string} dialect
 * @property {string} dictionary Absolute path to the company-wide word list.
 * @property {{ dir: string, extensions: string[], kind: "mdx" | "tsx" }[]} include
 * @property {string[]} exclude
 * @property {string[]} [apiReference] Path prefixes checked in API-reference mode.
 * @property {string[]} [citationPrefixes]
 * @property {string[]} proseAttributes
 * @property {string[]} proseProperties
 * @property {{ code: string, math: string, expression: string }} placeholders
 * @property {(string | { pattern: string, replacement: string, word?: boolean, caseSensitive?: boolean })[]} terminology
 * @property {{ rules?: Record<string, boolean>, warnOnlyKinds?: string[], ignore?: { kind?: string, text?: string }[] }} harper
 * @property {"error" | "warning"} terminologySeverity
 */

export {};
