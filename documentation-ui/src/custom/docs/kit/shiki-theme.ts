// Custom Shiki (TextMate) themes matching the Quantinuum 2026 palette.
//
// Light mode: vivid-but-deep tokens on a soft grey card (~4.5:1, GitHub-light
// style). Dark mode: the light tonal tones on a dark card. Token categories use
// the secondary ramps (purple/pink/orange) the style guide reserves for
// "differentiating elements"; Quantum Teal is a sparing accent (types).
// Code-block backgrounds are set in styles/quantinuum-docs-theme.css (fumadocs
// draws the card from --color-fd-card, not the Shiki theme), so `editor.background`
// mirrors them.

type TokenSetting = {
  scope?: string | string[]
  settings: { foreground?: string; fontStyle?: string }
}

export type ShikiTheme = {
  name: string
  type: 'light' | 'dark'
  colors: Record<string, string>
  settings: TokenSetting[]
}

const SCOPES = {
  comment: ['comment', 'punctuation.definition.comment'],
  keyword: [
    'keyword',
    'storage',
    'storage.type',
    'storage.modifier',
    'keyword.control',
    'keyword.operator.new',
    'keyword.operator.expression',
  ],
  string: [
    'string',
    'string.quoted',
    'string.template',
    'string.unquoted',
    'constant.other.symbol',
  ],
  number: [
    'constant.numeric',
    'constant.language',
    'constant.language.boolean',
    'constant.character',
    'support.constant',
  ],
  function: ['entity.name.function', 'support.function', 'meta.function-call', 'variable.function'],
  type: [
    'entity.name.type',
    'entity.name.class',
    'support.type',
    'support.class',
    'storage.type.class',
    'entity.other.inherited-class',
  ],
  tag: [
    'entity.name.tag',
    'entity.name.tag.yaml',
    'support.type.property-name',
    'meta.object-literal.key',
  ],
  attribute: ['entity.other.attribute-name'],
  variable: ['variable', 'variable.parameter', 'variable.other', 'meta.definition.variable'],
  punctuation: ['punctuation', 'meta.brace', 'keyword.operator'],
}

/** @param c per-category foreground colours @param fg default text colour */
function build(c: Record<keyof typeof SCOPES, string>, fg: string): TokenSetting[] {
  return [
    { settings: { foreground: fg } },
    { scope: SCOPES.comment, settings: { foreground: c.comment, fontStyle: 'italic' } },
    { scope: SCOPES.keyword, settings: { foreground: c.keyword } },
    { scope: SCOPES.string, settings: { foreground: c.string } },
    { scope: SCOPES.number, settings: { foreground: c.number } },
    { scope: SCOPES.function, settings: { foreground: c.function } },
    { scope: SCOPES.type, settings: { foreground: c.type } },
    { scope: SCOPES.tag, settings: { foreground: c.tag } },
    { scope: SCOPES.attribute, settings: { foreground: c.attribute } },
    { scope: SCOPES.variable, settings: { foreground: c.variable } },
    { scope: SCOPES.punctuation, settings: { foreground: c.punctuation } },
    { scope: ['markup.heading'], settings: { foreground: c.keyword, fontStyle: 'bold' } },
    { scope: ['markup.bold'], settings: { fontStyle: 'bold' } },
    { scope: ['markup.italic'], settings: { fontStyle: 'italic' } },
    { scope: ['invalid'], settings: { foreground: c.function } },
  ]
}

export const quantinuumLight: ShikiTheme = {
  name: 'quantinuum-light',
  type: 'light',
  colors: { 'editor.background': '#f2f2f2', 'editor.foreground': '#2b2b2b' },
  settings: build(
    {
      comment: '#6b6b6b',
      keyword: '#8064a2', // Entropy Purple (vivid)
      string: '#1d605b', // Teal (deep)
      number: '#92542a', // Benchmark Orange (deep)
      function: '#bb4658', // Interpretable Pink
      type: '#604a7b', // Entropy Purple (deep)
      tag: '#8064a2',
      attribute: '#92542a',
      variable: '#2b2b2b',
      punctuation: '#5c5c5c',
    },
    '#2b2b2b'
  ),
}

export const quantinuumDark: ShikiTheme = {
  name: 'quantinuum-dark',
  type: 'dark',
  colors: { 'editor.background': '#343434', 'editor.foreground': '#e6e6e6' },
  settings: build(
    {
      comment: '#a8a8a8',
      keyword: '#b3a2c7', // Entropy Purple (light)
      string: '#a5e5d7', // Teal (light)
      number: '#ffc29a', // Benchmark Orange (light)
      function: '#f59eaf', // Interpretable Pink (light)
      type: '#6ad3be', // Quantum Teal (accent)
      tag: '#b3a2c7',
      attribute: '#ffc29a',
      variable: '#e6e6e6',
      punctuation: '#cacaca',
    },
    '#e6e6e6'
  ),
}
