import { describe, expect, it } from 'vitest'
import { MATH_PARAGRAPH_CLASS, remarkMathParagraphs } from './remark-math-paragraphs'

describe('remarkMathParagraphs', () => {
  const math = { type: 'inlineMath', value: 'H' }
  const paragraph = (...children: object[]) => ({ type: 'paragraph', children })
  const run = (node: object) => {
    remarkMathParagraphs()({
      type: 'root',
      children: [{ type: 'listItem', children: [node] }],
    } as never)
    return node
  }

  it('tags a paragraph holding only one math span', () => {
    expect(run(paragraph({ type: 'text', value: '\n' }, math))).toMatchObject({
      data: { hProperties: { className: [MATH_PARAGRAPH_CLASS] } },
    })
  })

  it('leaves prose containing inline math alone', () => {
    expect(
      run(
        paragraph({ type: 'text', value: 'A Hamiltonian operator, ' }, math, {
          type: 'text',
          value: ',',
        })
      )
    ).not.toHaveProperty('data')
  })

  it('leaves paragraphs with several math spans alone', () => {
    expect(run(paragraph(math, { type: 'text', value: ' ' }, math))).not.toHaveProperty('data')
  })
})
