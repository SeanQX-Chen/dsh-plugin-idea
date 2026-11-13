// Project scan: walks the tree with a file/time budget and reports the
// language distribution. Uses only the host `ctx.fs` provider.

import { extensionOf } from './path-util.js'

export const DEFAULT_SKIP_DIRS = [
  '.git',
  '.hg',
  '.svn',
  '.pnpm-store',
  '.yarn',
  '.turbo',
  '.turbopack',
  '.next',
  '.nuxt',
  '.output',
  '.cache',
  '.parcel-cache',
  '.svelte-kit',
  '.angular',
  '.gradle',
  '.idea',
  '.vs',
  '.worktrees',
  '.worktree',
  'node_modules',
  'bower_components',
  'coverage',
  'dist',
  'build',
  'out',
  'target',
  'vendor',
  '.venv',
  'venv',
  'env',
  '__pycache__',
  '.mypy_cache',
  '.pytest_cache',
  '.ruff_cache',
  '.tox',
  'bin',
  'obj',
]

const EXT_LANGUAGE = {
  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'javascript',
  vue: 'vue',
  svelte: 'svelte',
  astro: 'astro',
  py: 'python',
  pyi: 'python',
  ipynb: 'jupyter',
  rb: 'ruby',
  go: 'go',
  rs: 'rust',
  java: 'java',
  kt: 'kotlin',
  kts: 'kotlin',
  scala: 'scala',
  groovy: 'groovy',
  cs: 'csharp',
  fs: 'fsharp',
  c: 'c',
  h: 'c',
  cc: 'cpp',
  cpp: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  hh: 'cpp',
  hxx: 'cpp',
  m: 'objective-c',
  mm: 'objective-c',
  swift: 'swift',
  php: 'php',
  pl: 'perl',
  lua: 'lua',
  r: 'r',
  jl: 'julia',
  dart: 'dart',
  ex: 'elixir',
  exs: 'elixir',
  erl: 'erlang',
  hs: 'haskell',
  clj: 'clojure',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  fish: 'shell',
  ps1: 'powershell',
  psm1: 'powershell',
  bat: 'batch',
  cmd: 'batch',
  sql: 'sql',
  html: 'html',
  htm: 'html',
  css: 'css',
  scss: 'scss',
  sass: 'sass',
  less: 'less',
  styl: 'stylus',
  json: 'json',
  jsonc: 'json',
  json5: 'json',
  yml: 'yaml',
  yaml: 'yaml',
  toml: 'toml',
  ini: 'ini',
  cfg: 'ini',
  conf: 'config',
  env: 'config',
  properties: 'config',
  xml: 'xml',
  svg: 'svg',
  md: 'markdown',
  mdx: 'markdown',
  rst: 'rst',
  txt: 'text',
  log: 'text',
  proto: 'protobuf',
  graphql: 'graphql',
  gql: 'graphql',
  tf: 'terraform',
  hcl: 'hcl',
  cmake: 'cmake',
  gradle: 'gradle',
  dockerfile: 'dockerfile',
  makefile: 'makefile',
  zig: 'zig',
  nim: 'nim',
  v: 'verilog',
  vhd: 'vhdl',
  vhdl: 'vhdl',
  tex: 'latex',
  diff: 'diff',
  patch: 'diff',
  lock: 'lockfile',
}

const NAME_LANGUAGE = {
  dockerfile: 'dockerfile',
  makefile: 'makefile',
  'cmakelists.txt': 'cmake',
  gemfile: 'ruby',
  rakefile: 'ruby',
  'go.mod': 'go',
  'cargo.toml': 'toml',
  'cargo.lock': 'lockfile',
  'package-lock.json': 'lockfile',
  'pnpm-lock.yaml': 'lockfile',
  'yarn.lock': 'lockfile',
  '.gitignore': 'config',
  '.gitattributes': 'config',
  '.editorconfig': 'config',
  '.npmrc': 'config',
  '.nvmrc': 'config',
}

export const LANGUAGE_LABELS = {
  typescript: 'TypeScript',
  javascript: 'JavaScript',
  vue: 'Vue',
  svelte: 'Svelte',
  astro: 'Astro',
  python: 'Python',
  jupyter: 'Jupyter',
  ruby: 'Ruby',
  go: 'Go',
  rust: 'Rust',
  java: 'Java',
  kotlin: 'Kotlin',
  scala: 'Scala',
  groovy: 'Groovy',
  csharp: 'C#',
  fsharp: 'F#',
  c: 'C',
  cpp: 'C++',
  'objective-c': 'Objective-C',
  swift: 'Swift',
  php: 'PHP',
  perl: 'Perl',
  lua: 'Lua',
  r: 'R',
  julia: 'Julia',
  dart: 'Dart',
  elixir: 'Elixir',
  erlang: 'Erlang',
  haskell: 'Haskell',
  clojure: 'Clojure',
  shell: 'Shell',
  powershell: 'PowerShell',
  batch: 'Batch',
  sql: 'SQL',
  html: 'HTML',
  css: 'CSS',
  scss: 'SCSS',
  sass: 'Sass',
  less: 'Less',
  stylus: 'Stylus',
  json: 'JSON',
  yaml: 'YAML',
  toml: 'TOML',
  ini: 'INI',
  config: 'Config',
  xml: 'XML',
  svg: 'SVG',
  markdown: 'Markdown',
  rst: 'reStructuredText',
  text: 'Text',
  protobuf: 'Protocol Buffers',
  graphql: 'GraphQL',
  terraform: 'Terraform',
  hcl: 'HCL',
  cmake: 'CMake',
  gradle: 'Gradle',
  dockerfile: 'Dockerfile',
  makefile: 'Makefile',
  zig: 'Zig',
  nim: 'Nim',
  verilog: 'Verilog',
  vhdl: 'VHDL',
  latex: 'LaTeX',
  diff: 'Diff',
  lockfile: 'Lockfile',
  other: 'Other',
}

export function languageOf(name) {
  const lower = name.toLowerCase()
  const byName = NAME_LANGUAGE[lower]
  if (byName) return byName
  const ext = extensionOf(lower)
  if (ext === '') return 'other'
  return EXT_LANGUAGE[ext] ?? 'other'
}

export function isTextLanguage(language) {
  return language !== 'other'
}

/**
 * Walk `rootTarget` breadth-first within the budget.
 * Returns per-language file counts, plus the manifest evidence the stack
 * detector needs.
 */
export async function scanProject(fs, rootTarget, options = {}) {
  const maxFiles = Number(options.maxFiles ?? 100_000)
  const maxMs = Number(options.maxMs ?? 2_000)
  const skip = new Set((options.skipDirs ?? DEFAULT_SKIP_DIRS).map((name) => String(name).toLowerCase()))
  const policy = options.policy
  const startedAt = Date.now()

  const languages = new Map()
  const stackFiles = { root: [], dirs: [], files: [] }
  let files = 0
  let dirs = 0
  let totalBytes = 0
  let truncated = false
  let visited = 0

  const queue = [{ target: rootTarget, depth: 0, relative: '' }]
  while (queue.length > 0) {
    if (Date.now() - startedAt > maxMs || visited >= maxFiles) {
      truncated = true
      break
    }
    const current = queue.shift()
    let entries
    try {
      entries = await fs.listDir(current.target, policy)
    } catch {
      continue
    }
    for (const entry of entries) {
      visited += 1
      if (visited >= maxFiles || Date.now() - startedAt > maxMs) {
        truncated = true
        break
      }
      const relative = current.relative === '' ? entry.name : `${current.relative}/${entry.name}`
      if (entry.type === 'directory') {
        if (skip.has(entry.name.toLowerCase())) continue
        dirs += 1
        if (current.depth < 8) {
          queue.push({ target: entry.target, depth: current.depth + 1, relative })
        } else {
          stackFiles.dirs.push(relative)
        }
        if (current.depth <= 1) stackFiles.dirs.push(relative)
        continue
      }
      if (entry.type !== 'file') continue
      files += 1
      const size = Number(entry.size ?? 0)
      totalBytes += size
      const language = languageOf(entry.name)
      const bucket = languages.get(language) ?? { id: language, label: LANGUAGE_LABELS[language] ?? language, files: 0, bytes: 0 }
      bucket.files += 1
      bucket.bytes += size
      languages.set(language, bucket)

      if (current.depth === 0) stackFiles.root.push(entry.name)
      else if (current.depth === 1) stackFiles.files.push(relative)
      const lower = entry.name.toLowerCase()
      if (lower === 'package.json' || lower === 'pyproject.toml' || lower === 'go.mod' || lower === 'cargo.toml') {
        if (current.depth <= 2) stackFiles.manifests ??= []
        if (current.depth <= 2) stackFiles.manifests.push({ path: relative, target: entry.target })
      }
    }
  }

  const list = [...languages.values()].sort((a, b) => b.files - a.files || a.id.localeCompare(b.id))
  return {
    languages: list,
    files,
    dirs,
    totalBytes,
    truncated,
    elapsedMs: Date.now() - startedAt,
    stackFiles,
  }
}

/** One directory listing, sorted directories-first then by name. */
export async function listTree(fs, dirTarget, policy) {
  const entries = await fs.listDir(dirTarget, policy)
  const mapped = entries.map((entry) => ({
    name: entry.name,
    type: entry.type,
    version: entry.version,
    size: entry.size,
  }))
  mapped.sort((a, b) => {
    const rank = (entry) => (entry.type === 'directory' ? 0 : entry.type === 'file' ? 1 : 2)
    const byRank = rank(a) - rank(b)
    if (byRank !== 0) return byRank
    return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : a.name.toLowerCase() > b.name.toLowerCase() ? 1 : 0
  })
  return mapped
}
