import { describe, expect, it } from 'vitest'
import { remarkCodeLangAlias } from './remark-code-lang-alias'

describe('remarkCodeLangAlias', () => {
  const run = (...children: object[]) => {
    remarkCodeLangAlias({ bash: 'plaintext', '{code}': 'plaintext' })()({
      type: 'root',
      children: [{ type: 'listItem', children }],
    } as never)
    return children
  }

  it('renames aliased languages in nested code blocks', () => {
    expect(run({ type: 'code', lang: 'bash' }, { type: 'code', lang: '{code}' })).toEqual([
      { type: 'code', lang: 'plaintext' },
      { type: 'code', lang: 'plaintext' },
    ])
  })

  it('leaves other languages and inherited keys alone', () => {
    expect(run({ type: 'code', lang: 'python' }, { type: 'code', lang: 'toString' })).toEqual([
      { type: 'code', lang: 'python' },
      { type: 'code', lang: 'toString' },
    ])
  })
})
