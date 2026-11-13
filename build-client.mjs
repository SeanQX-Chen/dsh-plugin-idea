/**
 * Inline the built zhuweiyou/dsh-idea-git client half into this plugin's
 * client.js, replacing the content of the GIT_SOURCE template between its two
 * marker lines. The template body is evaluated by client.js's own Git loader
 * (new Function('require','module','exports', source)), so the bundle stays
 * CommonJS — the esbuild output already is, and its external `react`,
 * `react-dom` and `@deepseek-ai/dsh-client-ui-primitives` requires are
 * satisfied by the host page's module table.
 *
 * Run `node build-idea-git.mjs` (plus its esbuild CLI steps) first.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const CLIENT = path.join(HERE, 'client.js')
const SOURCE = path.join(HERE, 'idea-git.client.js')

const OPEN_ANCHOR = '    const GIT_SOURCE = `'
const CLOSE_ANCHOR = '\n    `'

const client = readFileSync(CLIENT, 'utf8')
const open = client.indexOf(OPEN_ANCHOR)
if (open < 0) throw new Error('GIT_SOURCE open anchor not found in client.js')
const bodyStart = open + OPEN_ANCHOR.length
const close = client.indexOf(CLOSE_ANCHOR, bodyStart)
if (close < 0) throw new Error('GIT_SOURCE close anchor not found in client.js')

/* Escape for a template literal: backslash, backtick, ${, and the closing
 * script sequence. */
const raw = readFileSync(SOURCE, 'utf8')
const escaped = raw
  .replace(/\\/g, '\\\\')
  .replace(/`/g, '\\`')
  .replace(/\$\{/g, '\\${')
  .replace(/<\/script/g, '<\\/script')

/* Round-trip guard: un-escape in ONE pass (a sequential multi-pass unescape
 * would corrupt `\\` + `` ` `` adjacencies that escaped sources may contain). */
const unescapeTemplate = (text) => text.replace(/\\([\`$\\/])/g, '$1')
const back = unescapeTemplate(escaped)
if (back !== raw) throw new Error('template escaping is not reversible; aborting')

const indent = (text) => text.split('\n').map((line) => (line === '' ? '' : '    ' + line)).join('\n')

const next = client.slice(0, bodyStart) + '\n' + indent(escaped) + client.slice(close)
const unified = next.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n')
writeFileSync(CLIENT, unified)

const lines = unified.split('\r\n').length
console.log(`client.js rebuilt: GIT_SOURCE now holds ${raw.length} bytes of idea-git client (${lines} lines)`)
