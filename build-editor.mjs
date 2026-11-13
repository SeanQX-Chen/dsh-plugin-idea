/* Build step for the editor runtime the client half loads at run time.
 *
 * The browser module table has no `@codemirror/*` rows, so the editor has to
 * arrive as one self-contained script. The plugin directory is linked into the
 * installing profile, but its own `node_modules` may not carry the editor
 * packages; resolve them from whichever directory actually provides them, and
 * fail loudly when nothing does.
 */
import { build } from 'esbuild'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire(join(here, 'index.js'))

const roots = [here]
try {
  roots.push(dirname(require.resolve('@codemirror/state/package.json')))
} catch {
  /* not visible from the plugin directory; fall through to the ambient lookup */
}

const editorRoot = (() => {
  const candidates = [
    ...roots,
    join(here, 'node_modules'),
    'C:/Users/chenxuan/.dsh/profiles/desktop/node_modules',
  ]
  for (const candidate of candidates) {
    const scope = join(candidate, '@codemirror')
    if (existsSync(scope)) return candidate
  }
  return undefined
})()

if (editorRoot === undefined) {
  console.error('[dsh-idea] cannot find @codemirror/* to bundle; install the editor packages next to this plugin')
  process.exit(1)
}

await build({
  entryPoints: [join(here, 'editor-bundle.entry.js')],
  outfile: join(here, 'editor.bundle.js'),
  bundle: true,
  format: 'iife',
  target: 'es2022',
  minify: true,
  legalComments: 'none',
  nodePaths: [editorRoot],
})

console.log(`[dsh-idea] wrote editor.bundle.js (editor packages from ${editorRoot})`)
