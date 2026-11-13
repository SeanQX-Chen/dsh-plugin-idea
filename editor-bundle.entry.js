/* Editor runtime surface for the Idea client half.
 *
 * The browser module table exposes React and a handful of harness packages, but
 * no `@codemirror/*` rows, so a plugin cannot `require()` the editor at runtime.
 * This entry is bundled ahead of time into one self-contained file that the host
 * half serves; the client half loads it once through a script tag and reads it
 * from `globalThis.__dshIdeaEditor__`.
 */
import { EditorState, Compartment } from '@codemirror/state'
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, dropCursor, highlightSpecialChars } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { python } from '@codemirror/lang-python'
import { html } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'
import { markdown } from '@codemirror/lang-markdown'
import { yaml } from '@codemirror/lang-yaml'
import { rust } from '@codemirror/lang-rust'
import { go } from '@codemirror/lang-go'
import { java } from '@codemirror/lang-java'
import { cpp } from '@codemirror/lang-cpp'

globalThis.__dshIdeaEditor__ = {
  version: 1,
  EditorState,
  Compartment,
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  drawSelection,
  dropCursor,
  highlightSpecialChars,
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
  languages: { javascript, json, python, html, css, markdown, yaml, rust, go, java, cpp },
}
