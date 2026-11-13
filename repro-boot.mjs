// Reproduce the renderer-side import failure without Electron.
// The plugin exposes window.__ModuleLoader__.load({ id, factory }); the host calls
// factory(require). This script does exactly that with a stub require and reports
// the first throw, which is what the renderer logs as "import failed: ...".
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('./client.js', import.meta.url), 'utf8')

let definition = null
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
  'react-dom': { createRoot: () => ({ render: () => {}, unmount: () => {} }) },
  'react-dom/client': { createRoot: () => ({ render: () => {}, unmount: () => {} }) },
}

const globalScope = {
  __ModuleLoader__: { load: (def) => { definition = def; return () => {} } },
  window: undefined,
  document: undefined,
  localStorage: undefined,
}
globalScope.window = globalScope
globalScope.document = {
  head: { appendChild: () => {} },
  getElementById: () => null,
  createElement: () => ({}),
  querySelector: () => null,
  addEventListener: () => {},
  removeEventListener: () => {},
  documentElement: { setAttribute: () => {}, dataset: {} },
}
globalScope.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }
globalScope.matchMedia = () => ({ matches: false, addEventListener: () => {} })
globalScope.MutationObserver = class { observe() {} disconnect() {} }
globalScope.setTimeout = setTimeout
globalScope.clearTimeout = clearTimeout

const names = Object.keys(globalScope)
const values = names.map((n) => globalScope[n])
const run = new Function(...names, source)
run(...values)

if (definition === null) {
  console.error('FAIL: the plugin never called __ModuleLoader__.load')
  process.exit(1)
}
console.log('module id:', definition.id)

const require = (id) => {
  if (Object.prototype.hasOwnProperty.call(registry, id)) return registry[id]
  throw new Error('module not provided: ' + id)
}
try {
  const api = definition.factory(require)
  console.log('factory returned:', typeof api)
  console.log('inject:', JSON.stringify(api.inject))
  console.log('apply:', typeof api.apply)
  console.log('REPRO: OK')
} catch (error) {
  console.error('REPRO: FAIL ->', error.name + ': ' + error.message)
  console.error(String(error.stack).split('\n').slice(0, 6).join('\n'))
  process.exit(1)
}
