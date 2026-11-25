-- Pandoc filter making the converted output safe to post-process as MDX.

-- Drop raw passthrough blocks/inlines (from RST `.. raw:: html` etc.). These are
-- things like the interactive config-generator widget (<script>/<style>/<form>)
-- that can't work as static MDX and break the strict MDX/acorn parser. Figures
-- are pandoc `Figure` elements (not raw), so they are unaffected.
function RawBlock() return {} end
function RawInline() return {} end

-- Give every unclassed code block a language. Pandoc writes an attribute-less
-- code block as a 4-space INDENTED block, which the MDX safety pass cannot tell
-- apart from prose, so its `<` and `{` get escaped into visible entities. A class
-- makes pandoc emit a fenced block instead, which is passed through verbatim.
-- `text` matches the pipeline's `fallbackLanguage` (RST `::` declares none).
function CodeBlock(el)
  if #el.classes == 0 then
    el.classes = { "text" }
  end
  return el
end

-- MDX has no definition-list syntax, and pandoc's `term` / `:   definition` form
-- renders as a literal `:` followed by mis-indented content. Flatten each entry
-- to a term paragraph followed by its definition blocks. Kept as plain Markdown
-- so links, inline code and `$math$` in the definition still go through the
-- normal remark/rehype pipeline.
--
-- Many of these are not authored as definition lists at all: RST reads a nested
-- bullet list indented past its parent item's text column as a term plus
-- definition, so ordinary sub-lists arrive here. A term ending in `:` is such a
-- lead-in sentence and stays plain; a real defined term is emphasised, as the
-- Sphinx themes' bold `<dt>` did.
function DefinitionList(el)
  local blocks = {}
  for _, entry in ipairs(el.content) do
    local term, definitions = entry[1], entry[2]
    local leadIn = pandoc.utils.stringify(term):match(":%s*$") ~= nil
    table.insert(
      blocks,
      pandoc.Para(leadIn and term or { pandoc.Strong(term) })
    )
    for _, definition in ipairs(definitions) do
      for _, block in ipairs(definition) do
        table.insert(blocks, block)
      end
    end
  end
  return blocks
end
