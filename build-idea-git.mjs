/**
 * Build the vendored zhuweiyou/dsh-idea-git halves into this plugin.
 *
 * The sandbox refuses esbuild's JS-API service child (piped-stdio spawn →
 * EPERM), so the build runs in three steps:
 *
 *   1. `node build-idea-git.mjs` — this script. Copies src/client into
 *      .tmp-idea-git/src, rewriting stylesheet imports to generated JS stubs:
 *      CSS modules are scoped vite-style (`:global()` honoured) and export
 *      their class mapping; plain CSS pushes its text onto
 *      `globalThis.__DIG_CSS__` exactly like the upstream vite wrapper.
 *   2. esbuild.exe CLI bundles client and host (no service child — the
 *      standalone binary does everything in-process):
 *        esbuild --bundle .tmp-idea-git/src/index.tsx --format=cjs
 *                --platform=browser --target=es2020 --charset=utf8
 *                --external:react --external:react-dom
 *                --external:react-dom/client
 *                --external:@deepseek-ai/dsh-client-ui-primitives
 *                --alias:clsx=.vendor/clsx-2.1.1/package/dist/clsx.mjs
 *                --tsconfig=.vendor/zhuweiyou-dsh-idea-git-946e7ad/tsconfig.json
 *                --outfile=.tmp-idea-git/client.bundle.js
 *        esbuild --bundle .vendor/zhuweiyou-dsh-idea-git-946e7ad/src/host/index.ts
 *                --format=esm --platform=node --target=node20 --charset=utf8
 *                --outfile=.tmp-idea-git/host.bundle.js
 *   3. `node build-idea-git-post.mjs` — inlines the upstream custom
 *      `react/jsx-runtime` shim, writes idea-git.client.js and
 *      idea-git.host.js.
 *
 * idea-git.client.js is the CJS body build-client.mjs inlines into client.js's
 * GIT_SOURCE template.
 */

import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, readdirSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const VENDOR = path.join(HERE, '.vendor', 'zhuweiyou-dsh-idea-git-946e7ad')
const TMP = path.join(HERE, '.tmp-idea-git')
const TMP_SRC = path.join(TMP, 'src')

/* ------------------------------------------------------------------ */
/* CSS modules (vite-compatible enough for these files)                */
/* ------------------------------------------------------------------ */

function scopeKey(resolvedPath) {
  const rel = path.relative(VENDOR, resolvedPath).replace(/\\/g, '/')
  return rel.replace(/^src\/client\//, '').replace(/\.module\.css$/, '').replace(/[^a-zA-Z0-9]+/g, '_')
}

function splitSelectors(selector) {
  const parts = []
  let depth = 0
  let current = ''
  for (const ch of selector) {
    if (ch === '(' || ch === '[') depth += 1
    else if (ch === ')' || ch === ']') depth -= 1
    if (ch === ',' && depth === 0) {
      parts.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  if (current.trim() !== '') parts.push(current)
  return parts
}

function extractGlobals(selector, globals) {
  let out = ''
  let index = 0
  while (index < selector.length) {
    const at = selector.indexOf(':global(', index)
    if (at < 0) {
      out += selector.slice(index)
      break
    }
    out += selector.slice(index, at)
    let depth = 1
    let cursor = at + ':global('.length
    while (cursor < selector.length && depth > 0) {
      if (selector[cursor] === '(') depth += 1
      else if (selector[cursor] === ')') depth -= 1
      cursor += 1
    }
    if (depth !== 0) throw new Error(`unbalanced :global( in ${selector}`)
    const inner = selector.slice(at + ':global('.length, cursor - 1)
    const token = `__GLOBAL_${globals.length}__`
    globals.push({ token, inner })
    out += token
    index = cursor
  }
  return out
}

function scopeSelector(selector, key, mapping) {
  const globals = []
  let text = extractGlobals(selector.trim(), globals)
  text = text.replace(/\.(-?[_a-zA-Z][_a-zA-Z0-9-]*)/g, (match, local) => {
    const scoped = `digcm-${key}-${local}`
    mapping[local] = scoped
    return `.${scoped}`
  })
  for (const { token, inner } of globals) text = text.replace(token, inner)
  return text
}

function scopeModuleCss(css, key) {
  const mapping = {}
  const out = []
  let index = 0
  while (index < css.length) {
    if (css.startsWith('/*', index)) {
      const end = css.indexOf('*/', index + 2)
      const stop = end < 0 ? css.length : end + 2
      out.push(css.slice(index, stop))
      index = stop
      continue
    }
    const brace = css.indexOf('{', index)
    if (brace < 0) {
      out.push(css.slice(index))
      break
    }
    const selector = css.slice(index, brace)
    let depth = 1
    let cursor = brace + 1
    while (cursor < css.length && depth > 0) {
      if (css[cursor] === '{') depth += 1
      else if (css[cursor] === '}') depth -= 1
      cursor += 1
    }
    const body = css.slice(brace + 1, cursor - 1)
    if (selector.trim().startsWith('@')) {
      out.push(`${selector}{${scopeModuleCss(body, key).css}}`)
    } else {
      const scoped = splitSelectors(selector).map((part) => scopeSelector(part, key, mapping)).join(',')
      out.push(`${scoped}{${body}}`)
    }
    index = cursor
  }
  return { css: out.join(''), mapping }
}

/* ------------------------------------------------------------------ */
/* copy + rewrite                                                      */
/* ------------------------------------------------------------------ */

const sheets = []

function rewriteDir(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      rewriteDir(full)
      continue
    }
    if (!/\.(tsx?|jsx?)$/.test(entry.name)) continue
    let text = readFileSync(full, 'utf8')
    let changed = false
    const handle = (spec) => {
      const target = path.resolve(path.dirname(full), spec)
      if (!existsSync(target)) throw new Error(`stylesheet not found: ${spec} (from ${full})`)
      const relFromEntry = path.relative(path.dirname(full), target).replace(/\\/g, '/')
      const stubRel = relFromEntry.replace(/\.css$/, '.css.js')
      const isModule = spec.endsWith('.module.css')
      const css = readFileSync(target, 'utf8')
      let stub
      if (isModule) {
        const key = scopeKey(target)
        const { css: scoped, mapping } = scopeModuleCss(css, key)
        sheets.push(scoped)
        const exports = Object.entries(mapping)
          .map(([local, scopedName]) => `${JSON.stringify(local)}:${JSON.stringify(scopedName)}`)
          .join(',')
        /* ESM default export: the plugin package.json sets type:module, and
         * esbuild treats these stubs as ESM accordingly. */
        stub = `export default {${exports}};\n`
      } else {
        sheets.push(css)
        stub = 'try{var g=globalThis;g.__DIG_CSS__=g.__DIG_CSS__||[];g.__DIG_CSS__.push('
          + JSON.stringify(css) + ');}catch(e){}\n'
      }
      writeFileSync(path.join(path.dirname(target), path.basename(stubRel)), stub)
      changed = true
      return `./${stubRel}`
    }
    /* side-effect imports: import "./x.css" */
    text = text.replace(/(import\s+)["']([^"']*\.css)["'](\s*;?)/g, (match, head, spec, tail) => `${head}"${handle(spec)}"${tail}`)
    /* value imports: import styles from "./x.module.css" */
    text = text.replace(/(import\s+[\w$*{},\s]+?from\s*)["']([^"']*\.css)["']/g, (match, head, spec) => `${head}"${handle(spec)}"`)
    if (changed) writeFileSync(full, text)
  }
}

rmSync(TMP, { recursive: true, force: true })
mkdirSync(TMP_SRC, { recursive: true })
cpSync(path.join(VENDOR, 'src', 'client'), TMP_SRC, { recursive: true })
rewriteDir(TMP_SRC)

console.log(`copied client sources to ${TMP_SRC}; ${sheets.length} stylesheet(s) collected`)
