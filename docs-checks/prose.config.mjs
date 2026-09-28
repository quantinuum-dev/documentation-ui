// House style shared by every Quantinuum documentation repo.
//
// The checkers merge a consumer's own `prose.config.mjs` (if any) over this, so
// a repo only states what is specific to it: which files to check, which trees
// are generated API reference, and any product word list. Company-wide
// vocabulary lives in ./project-words.txt beside this file.

/** @type {Partial<import("./src/prose/types.mjs").ProseConfig>} */
const houseStyle = {
  // Harper's English dialect. One of: American, British, Australian, Canadian.
  dialect: "British",

  // JSX attributes whose values are shown to readers. Everything else
  // (className, href, type, value, ...) is treated as code and ignored.
  proseAttributes: [
    "alt",
    "aria-label",
    "ariaLabel",
    "caption",
    "description",
    "heading",
    "imageAlt",
    "imageDescription",
    "label",
    "placeholder",
    "subtitle",
    "summary",
    "title",
  ],

  // Object-literal keys in TSX that hold prose, e.g. the product card arrays in
  // a landing page.
  proseProperties: [
    "blurb",
    "body",
    "caption",
    "description",
    "heading",
    "icon_description",
    "iconDescription",
    "label",
    "name",
    "subtitle",
    "summary",
    "tagline",
    "title",
  ],

  // Stand-in words substituted for non-prose inline nodes (code spans, math,
  // JSX expressions) so that surrounding sentences stay grammatical. Rules
  // never fire on the placeholders themselves.
  placeholders: {
    code: "code",
    math: "value",
    expression: "value",
  },

  // Terminology rules. Two forms:
  //   "TKET"                        - enforce exactly this capitalisation
  //   { pattern, replacement, ... } - regex (case-insensitive by default),
  //                                   `replacement` may use $1 backreferences
  // Set `word: false` to opt out of the automatic \b...\b wrapping.
  terminology: [
    // -- Qubit counts -------------------------------------------------------
    // House style spells out counts below ten and hyphenates the compound
    // ("two-qubit gate"), reserving digits for larger counts ("20-qubit").
    // The docs currently mix both, so this is the main convention being
    // introduced. To switch to the digit style instead, swap the patterns and
    // replacements below.
    { pattern: "(?:1|one)[- ]qubit", replacement: "single-qubit" },
    { pattern: "2[- ]qubit", replacement: "two-qubit" },
    { pattern: "3[- ]qubit", replacement: "three-qubit" },
    { pattern: "4[- ]qubit", replacement: "four-qubit" },
    { pattern: "5[- ]qubit", replacement: "five-qubit" },
    { pattern: "6[- ]qubit", replacement: "six-qubit" },
    { pattern: "7[- ]qubit", replacement: "seven-qubit" },
    { pattern: "8[- ]qubit", replacement: "eight-qubit" },
    { pattern: "9[- ]qubit", replacement: "nine-qubit" },
    {
      pattern: "(two|three|four|five|six|seven|eight|nine) qubit gate",
      replacement: "$1-qubit gate",
    },
    { pattern: "multi qubit", replacement: "multi-qubit" },

    // -- Product and brand names -------------------------------------------
    "Quantinuum",
    "Quantum Origin",
    "Nexus",
    "Guppy",
    "Selene",
    "InQuanto",
    "Helios",
    "TKET",
    "pytket",
    "lambeq",
    "qnexus",

    // -- Technology names ---------------------------------------------------
    "JavaScript",
    "TypeScript",
    "Python",
    "Jupyter",
    "GitHub",
    "macOS",
    "Linux",
    "Windows",
    "Docker",
    "Kubernetes",
    "npm",
    "PyPI",
    "Conda",
    "NumPy",
    "SciPy",
    "Matplotlib",
    "Qiskit",
    "OpenQASM",
    "WebAssembly",

    // -- Common phrasing ----------------------------------------------------
    { pattern: "e\\.g\\.(?!,)", replacement: "e.g.,", word: false },
    { pattern: "i\\.e\\.(?!,)", replacement: "i.e.,", word: false },
    { pattern: "back[- ]end(\\w*)", replacement: "backend$1" },
    { pattern: "front[- ]end(\\w*)", replacement: "frontend$1" },
    {
      pattern: "command[- ]line interface",
      replacement: "command-line interface",
    },
    {
      pattern: "run[- ]time(?= (?:error|behaviour|behavior))",
      replacement: "runtime",
    },
  ],

  // Harper grammar rules. Any of Harper's ~800 rule names can be toggled here;
  // run `docs-check-prose --list-rules` to see them all.
  harper: {
    rules: {
      // cspell owns spelling, so Harper's checker is off to avoid duplicate
      // reports against two separate dictionaries.
      SpellCheck: false,
      // Headings and table cells are legitimately sentence fragments.
      SentenceCapitalization: false,
      SpelledNumbers: false,
      // Python docstrings routinely double-space after a full stop and align
      // text into columns; none of that survives into the rendered page.
      Spaces: false,
      // `i` is an index variable far more often than it is a pronoun.
      CapitalizePersonalPronouns: false,
      // Fires on `...` in repr output and elided signatures.
      EllipsisLength: false,
      UseEllipsisCharacter: false,
    },
    // Harper lint kinds downgraded to warnings rather than errors.
    warnOnlyKinds: ["Style", "Readability", "Repetition", "WordChoice"],

    // Escape hatch for individual false positives that no rule toggle covers.
    // `text` is matched against the exact flagged word. Prefer adding a term to
    // project-words.txt first — that clears most domain-vocabulary reports.
    ignore: [
      // Harper insists on "WASM"; the ecosystem and our docs use "Wasm".
      { kind: "Capitalization", text: "Wasm" },
      { kind: "Capitalization", text: "wasm" },
      // These are electrons, not the Electron application framework.
      { kind: "Capitalization", text: "electron" },
      { kind: "Capitalization", text: "electrons" },
    ],
  },

  // Citation entries are skipped: author names, paper titles and journal names
  // are bibliographic data, not prose anyone here writes or corrects, and they
  // were by far the largest source of spurious spelling reports.
  //
  // Matched against `<a id="..." />` anchors (which precede each bibliography
  // entry) and against footnote labels such as `[^cite_preskill2018]`. Glossary
  // anchors (`term-...`) are deliberately absent — those definitions are prose.
  citationPrefixes: ["bib-", "cite_", "cite-"],

  terminologySeverity: "error",
};

export default houseStyle;
