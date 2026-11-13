// Smoke-check: the inlined Git client must evaluate and expose a DSH plugin
// definition ({ name, inject, apply }) whose apply can run against a stub ctx.
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('./client.js', import.meta.url), 'utf8')

const open = source.indexOf('    const GIT_SOURCE = `')
if (open < 0) throw new Error('GIT_SOURCE template is missing from client.js')
const bodyStart = open + '    const GIT_SOURCE = `'.length
const close = source.indexOf('\n    `', bodyStart)
if (close < 0) throw new Error('GIT_SOURCE template is unterminated')
const literal = source.slice(bodyStart, close)
console.log(`client.js: GIT_SOURCE is ${literal.length} chars`)

/* Un-escape exactly like an engine would — one pass, so `\\` + `` ` ``
 * adjacencies survive. */
const unescaped = literal.replace(/\\([\`$\\/])/g, '$1')

const react = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  Fragment: 'fragment',
  Component: class { constructor(props) { this.props = props; this.state = {} } setState() {} },
  useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
  useEffect: () => {},
  useMemo: (fn) => fn(),
  useRef: (v) => ({ current: v }),
  useCallback: (fn) => fn,
  useSyncExternalStore: (_s, get) => get(),
  createContext: () => ({ Provider: () => null }),
}
const registry = {
  react,
  'react-dom': {},
  'react-dom/client': {},
  '@deepseek-ai/dsh-client-ui-primitives': new Proxy({}, { get: () => () => null }),
}

const module_ = { exports: {} }
const sandbox = {
  localStorage: { getItem: () => null, setItem: () => {} },
  document: { addEventListener: () => {}, createElement: () => ({ style: {}, setAttribute: () => {}, appendChild: () => {} }), head: { appendChild: () => {} } },
  window: null,
  globalThis: null,
}
sandbox.window = { addEventListener: () => {}, matchMedia: () => ({ matches: false, addEventListener: () => {} }) }
sandbox.globalThis = sandbox
new Function('require', 'module', 'exports', 'window', 'document', 'localStorage', 'globalThis', unescaped)(
  (id) => {
    if (!(id in registry)) throw new Error('unknown module: ' + id)
    return registry[id]
  },
  module_,
  module_.exports,
  sandbox.window,
  sandbox.document,
  sandbox.localStorage,
  sandbox,
)

const definition = module_.exports
console.log('git module:', definition.name, 'inject:', JSON.stringify(definition.inject))
if (typeof definition.apply !== 'function') throw new Error('the Git client registered no apply()')

/* A few slot registrations against a stub ctx prove the plugin wires up. */
const registered = []
const ctx = {
  inject: (names, run) => { try { run({ get: () => undefined }) } catch {} return () => {} },
  effect: (run) => { try { return run() } catch {} return () => {} },
  slots: {
    inject: (name, run) => { registered.push(name); return run() },
    register: (meta, body) => { registered.push(meta.id ?? meta.name); return body },
  },
  get: () => undefined,
  on: () => () => {},
  locale: { register: () => () => {} },
}
const dispose = definition.apply(ctx)
console.log('registered surfaces:', registered.length)
if (typeof dispose === 'function') dispose()
console.log('GIT SMOKE: OK')
