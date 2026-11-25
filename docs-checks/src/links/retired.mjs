// URLs that still resolve (so lychee reports them as OK) but point at a retired
// location we no longer want published. lychee has no "fail on this pattern"
// option -- exclude/include only filter and accept only matches status codes --
// so these are matched against each page's HTML in a separate pass. Backslashes
// terminate a match so the JSON-escaped copies in Next's RSC flight payload
// (`...\"`, `...\u003c/a\u003e`) collapse onto the plain HTML href.
export const RETIRED_URL_PATTERNS = [
  {
    pattern: /https?:\/\/github\.com\/CQCL\/[^\s"'<>)\]\\]*/gi,
    reason: "GitHub org renamed: use https://github.com/quantinuum/",
  },
  {
    pattern: /https?:\/\/github\.com\/CQCL-Dev\/[^\s"'<>)\]\\]*/gi,
    reason: "GitHub org renamed: use https://github.com/quantinuum-dev/",
  },
  {
    pattern:
      /https?:\/\/(?:[a-z0-9-]+\.)?cambridgequantum\.com[^\s"'<>)\]\\]*/gi,
    reason: "Company domain retired: use quantinuum.com",
  },
];

/**
 * Retired-but-working URLs embedded in a page's HTML.
 * @param {string} html
 * @returns {{ url: string, reason: string }[]}
 */
export function findRetiredUrls(html) {
  const hits = new Map();
  for (const { pattern, reason } of RETIRED_URL_PATTERNS) {
    for (const [match] of html.matchAll(pattern)) {
      hits.set(match, reason);
    }
  }
  return [...hits].map(([url, reason]) => ({ url, reason }));
}
