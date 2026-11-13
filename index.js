// Host half of Idea: scans a project directory, recognises languages and
// stack, and reads/writes files with the host filesystem's version guard.

import { readFileSync } from 'node:fs'
import Schema from '@deepseek-ai/schemastery'
import { scanProject, listTree as listTreeEntries } from './scan.js'
import { detectStack } from './stack.js'
import { normalizeRoot, isInside } from './path-util.js'
import { apply as ideaGitApply } from './idea-git.host.js'

const API_CHANNEL = '/api/idea.'
const EDITOR_ROUTE = '/idea/editor.js'
const MAX_REQUEST_BYTES = 32 * 1024 * 1024

const DEFAULTS = {
  maxFiles: 100_000,
  maxMs: 2_000,
  maxFileBytes: 1_048_576,
  languagesTopN: 8,
}

export const name = 'dsh-idea'

/* The Git tool window (ported zhuweiyou/dsh-idea-git) registers its own
   /api/idea-git RPC channel and reads its settings itself; it needs no llm
   binding here — its AI commit-message flow talks to the llm service through
   the host context directly. */
export const inject = ['webServer', 'connection', 'sessions', 'workingDirectory', 'fs']

export const Config = Schema.object({
  skipDirs: Schema.array(Schema.string()).description('Directory names never entered while scanning.'),
  maxFiles: Schema.number().default(DEFAULTS.maxFiles).description('Entry budget for one scan.'),
  maxMs: Schema.number().default(DEFAULTS.maxMs).description('Time budget for one scan, in milliseconds.'),
  maxFileBytes: Schema.number().default(DEFAULTS.maxFileBytes).description('Largest file the editor will open, in bytes.'),
  languagesTopN: Schema.number().default(DEFAULTS.languagesTopN).description('How many languages the summary lists separately.'),
})

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

function fail(status, code, message, extra) {
  return json({ ok: false, error: { code, message, ...extra } }, status)
}

export function apply(ctx, config = {}) {
  const settings = { ...DEFAULTS, ...(config ?? {}) }
  const pins = new Map()
  const cache = new Map()

  const fs = ctx.fs
  const sessions = ctx.sessions
  const wd = ctx.get('workingDirectory')

  function sessionOf(sessionId) {
    if (typeof sessionId !== 'string' || sessionId === '') return undefined
    return sessions.get(sessionId)
  }

  /* The client can only name a Session it was told about. When it names none,
     the Host answers for the most recently active one, and reports that back so
     every later call carries the same identifier. Falling back to the default
     directory alone would scan a root whose Session nobody knows. */
  function activeSessionId() {
    const live = sessions.list()
    if (!Array.isArray(live) || live.length === 0) return ''
    let best = ''
    let bestAt = -1
    for (const session of live) {
      const id = session?.id
      if (typeof id !== 'string' || id === '') continue
      const at = session?.header?.updatedAt ?? session?.updatedAt ?? 0
      const stamp = typeof at === 'number' ? at : Date.parse(at) || 0
      if (stamp >= bestAt) {
        bestAt = stamp
        best = id
      }
    }
    return best
  }

  function resolveSessionId(sessionId) {
    return typeof sessionId === 'string' && sessionId !== '' ? sessionId : activeSessionId()
  }

  function cwdOf(sessionId) {
    const session = sessionOf(sessionId)
    if (session) {
      try {
        const dir = wd?.get(session)
        if (typeof dir === 'string' && dir !== '') return dir
      } catch {
        /* fall through to the header */
      }
      if (typeof session.header?.cwd === 'string' && session.header.cwd !== '') return session.header.cwd
    }
    try {
      const fallback = wd?.defaultDirectory
      if (typeof fallback === 'string' && fallback !== '') return fallback
    } catch {
      /* ignore */
    }
    return undefined
  }

  function policyFor(sessionId) {
    try {
      const policy = ctx.get('sandboxPolicy')
      if (!policy) return undefined
      return policy.resolve({ session: sessionOf(sessionId) })
    } catch {
      return undefined
    }
  }

  function rootFor(sessionId, directory) {
    const pinned = pins.get(sessionId)
    if (typeof pinned === 'string' && pinned !== '') return { root: pinned, pinned: true }
    /* A client-supplied workspace directory (the GUI's selected file window)
       wins over the Session cwd, so IM sessions can follow the project the
       user is actually viewing. Absolute paths only; anything else falls back. */
    if (typeof directory === 'string' && directory !== '') return { root: directory, pinned: false }
    const cwd = cwdOf(sessionId)
    return cwd ? { root: cwd, pinned: false } : undefined
  }

  async function targetOf(path, baseDir) {
    const target = await fs.resolve(path, baseDir ? { cwd: baseDir } : {})
    return target
  }

  function rootOfTarget(target) {
    return target.displayPath
  }

  async function scan(sessionId, options = {}) {
    const resolved = rootFor(sessionId, options.directory)
    if (!resolved) throw Object.assign(new Error('No working directory for this session.'), { code: 'NO_ROOT' })
    const rootTarget = await targetOf(resolved.root)
    const root = rootOfTarget(rootTarget)
    const key = `${root}::${options.force ? Math.random() : 'cached'}`
    const now = Date.now()
    const cached = cache.get(root)
    if (!options.force && cached && now - cached.at < 15_000) return cached.value

    const policy = policyFor(sessionId)
    const result = await scanProject(fs, rootTarget, {
      maxFiles: settings.maxFiles,
      maxMs: settings.maxMs,
      skipDirs: settings.skipDirs,
      policy,
    })
    const stack = await detectStack(fs, rootTarget, result.stackFiles, { policy })
    // `scanProject` already reports unrecognised extensions under the `other`
    // id, so that bucket is kept apart and folded into the tail bucket below;
    // keeping it inline would emit two entries with the same id.
    const languages = result.languages.filter((item) => item.id !== 'other')
    const unnamed = result.languages.find((item) => item.id === 'other')
    const total = result.languages.reduce((sum, item) => sum + item.files, 0) || 1
    const topN = Math.max(1, settings.languagesTopN)
    const head = languages.slice(0, topN).map((item) => ({ ...item, share: item.files / total }))
    const tailFiles = languages.slice(topN).reduce((sum, item) => sum + item.files, 0)
    const tailBytes = languages.slice(topN).reduce((sum, item) => sum + item.bytes, 0)
    const otherFiles = tailFiles + (unnamed?.files ?? 0)
    if (otherFiles > 0) {
      head.push({
        id: 'other',
        label: 'Other',
        files: otherFiles,
        bytes: tailBytes + (unnamed?.bytes ?? 0),
        share: otherFiles / total,
      })
    }
    const value = {
      root,
      pinned: resolved.pinned,
      sessionId,
      sessionRoot: cwdOf(sessionId) ?? null,
      languages: head,
      stack,
      counts: {
        files: result.files,
        dirs: result.dirs,
        truncated: result.truncated,
        elapsedMs: result.elapsedMs,
        totalBytes: result.totalBytes,
      },
      generatedAt: now,
    }
    cache.set(root, { at: now, value })
    return value
  }

  async function readFile(sessionId, path, directory) {
    const resolved = rootFor(sessionId, directory)
    if (!resolved) throw Object.assign(new Error('No working directory for this session.'), { code: 'NO_ROOT' })
    const rootTarget = await targetOf(resolved.root)
    const target = await targetOf(path, rootOfTarget(rootTarget))
    const inside = fs.contains(rootTarget, target)
    const info = await fs.stat(target)
    if (info.type !== 'file') throw Object.assign(new Error('Not a regular file.'), { code: 'NOT_A_FILE' })
    const size = Number(info.size ?? 0)
    if (size > settings.maxFileBytes) {
      return {
        path: target.displayPath,
        root: rootOfTarget(rootTarget),
        inside,
        tooLarge: true,
        size,
        version: null,
        text: '',
      }
    }
    const bytes = await fs.readBytes(target, undefined, settings.maxFileBytes)
    const binary = bytes.includes(0)
    const text = binary ? '' : new TextDecoder('utf-8').decode(bytes)
    return {
      path: target.displayPath,
      root: rootOfTarget(rootTarget),
      inside,
      tooLarge: false,
      binary,
      size,
      version: info.version,
      text,
    }
  }

  async function writeFile(sessionId, path, text, version, directory) {
    const resolved = rootFor(sessionId, directory)
    if (!resolved) throw Object.assign(new Error('No working directory for this session.'), { code: 'NO_ROOT' })
    const rootTarget = await targetOf(resolved.root)
    const target = await targetOf(path, rootOfTarget(rootTarget))
    if (!fs.contains(rootTarget, target)) {
      throw Object.assign(new Error('The file is outside the project root.'), { code: 'OUTSIDE_ROOT' })
    }
    const expected = typeof version === 'string' && version !== '' ? { kind: 'replaceIfVersion', version } : undefined
    /* writeText(target, content, expected, signal, sandboxPolicy): the loaded
       provider is the sandboxed file system, whose fifth parameter is the
       per-call policy. Omitting it falls back to the deployment default, which
       fences the write to the project root and refuses anything the user pinned
       outside it. */
    let outcome
    try {
      outcome = await fs.writeText(target, String(text ?? ''), expected, undefined, policyFor(sessionId))
    } catch (error) {
      const code = error?.code ?? error?.cause?.code
      if (code === 'FS_STALE_VERSION') {
        const info = await fs.stat(target).catch(() => undefined)
        return { stale: true, version: info?.version ?? null, path: target.displayPath }
      }
      throw error
    }
    cache.delete(rootOfTarget(rootTarget))
    /* The write is reported from what the file system now holds, not from what
       the call returned, so a no-op can never masquerade as a save. */
    const confirmation = await readFile(sessionId, target.displayPath).catch(() => undefined)
    const stored = confirmation?.text
    if (typeof stored === 'string' && stored !== String(text ?? '')) {
      throw Object.assign(new Error('The file on disk does not match what was written.'), { code: 'WRITE_UNCONFIRMED' })
    }
    return {
      stale: false,
      path: target.displayPath,
      version: confirmation?.version ?? outcome.version,
      operation: outcome.operation,
      bytes: new TextEncoder().encode(String(text ?? '')).length,
      confirmed: typeof stored === 'string',
    }
  }

  async function searchFiles(sessionId, needle, limit, directory) {
    const resolved = rootFor(sessionId, directory)
    if (!resolved) throw Object.assign(new Error('No working directory for this session.'), { code: 'NO_ROOT' })
    const rootTarget = await targetOf(resolved.root)
    const root = rootOfTarget(rootTarget)
    const text = String(needle ?? '').trim().toLowerCase()
    if (text === '') return { root, matches: [], truncated: false }
    const budget = Math.max(1, Math.min(Number(limit ?? 200), 2_000))
    const preview = await scanProject(fs, rootTarget, {
      maxFiles: settings.maxFiles,
      maxMs: settings.maxMs,
      skipDirs: settings.skipDirs,
      policy: policyFor(sessionId),
    })
    const matches = []
    let truncated = preview.truncated
    const queue = ['']
    while (queue.length > 0 && matches.length < budget) {
      const relative = queue.shift()
      const dirTarget = relative === '' ? rootTarget : await targetOf(relative, root)
      let entries
      try {
        entries = await listTreeEntries(fs, dirTarget, policyFor(sessionId))
      } catch {
        continue
      }
      for (const entry of entries) {
        const child = relative === '' ? entry.name : `${relative}/${entry.name}`
        if (entry.type === 'directory') {
          queue.push(child)
          continue
        }
        if (entry.type !== 'file') continue
        if (!child.toLowerCase().includes(text)) continue
        matches.push({ path: child, relative: child, name: entry.name, size: entry.size ?? null })
        if (matches.length >= budget) {
          truncated = true
          break
        }
      }
    }
    return { root, matches, truncated }
  }

  async function listTree(sessionId, options = {}) {
    const resolved = rootFor(sessionId, options.directory)
    if (!resolved) throw Object.assign(new Error('No working directory for this session.'), { code: 'NO_ROOT' })
    const rootTarget = await targetOf(resolved.root)
    const baseTarget = options.path ? await targetOf(options.path, rootOfTarget(rootTarget)) : rootTarget
    const entries = await listTreeEntries(fs, baseTarget, policyFor(sessionId))
    return {
      root: rootOfTarget(rootTarget),
      path: baseTarget.displayPath,
      entries: entries.map((entry) => ({
        name: entry.name,
        type: entry.type,
        version: entry.version ?? null,
        size: entry.size ?? null,
      })),
    }
  }

  const handlers = {
    'project.scan': async (body) => ({
      value: await scan(resolveSessionId(body.sessionId), { force: Boolean(body.force), directory: body.directory }),
    }),
    'tree.list': async (body) => ({
      value: await listTree(resolveSessionId(body.sessionId), body),
    }),
    'project.search': async (body) => ({
      value: await searchFiles(resolveSessionId(body.sessionId), body.query, body.limit, body.directory),
    }),
    'file.read': async (body) => ({
      value: await readFile(resolveSessionId(body.sessionId), body.path, body.directory),
    }),
    'file.write': async (body) => ({
      value: await writeFile(resolveSessionId(body.sessionId), body.path, body.content, body.version, body.directory),
    }),
    'root.pin': async (body) => {
      const sessionId = resolveSessionId(body.sessionId)
      if (body.path == null || body.path === '') {
        pins.delete(sessionId)
      } else {
        const target = await targetOf(String(body.path))
        const info = await fs.stat(target)
        if (info.type !== 'directory') throw Object.assign(new Error('Not a directory.'), { code: 'NOT_A_DIRECTORY' })
        pins.set(sessionId, rootOfTarget(target))
        cache.delete(rootOfTarget(target))
      }
      const resolved = rootFor(sessionId)
      return { value: { root: resolved?.root ?? null, pinned: Boolean(resolved?.pinned) } }
    },
    'config.get': async () => ({
      value: {
        maxFileBytes: settings.maxFileBytes,
        maxFiles: settings.maxFiles,
        maxMs: settings.maxMs,
        languagesTopN: settings.languagesTopN,
      },
    }),
  }

  function routeOf(method) {
    return `${API_CHANNEL}${method.replace(/[^A-Za-z0-9_$.-]/g, '_')}`
  }

  function makeHandler(method) {
    const handler = handlers[method]
    return async (request) => {
      if (request.method !== 'POST') return fail(405, 'METHOD_NOT_ALLOWED', 'Use POST.')

      let body
      try {
        const raw = await request.text()
        if (raw.length > MAX_REQUEST_BYTES) return fail(413, 'REQUEST_TOO_LARGE', 'The request body is too large.')
        body = raw === '' ? {} : JSON.parse(raw)
      } catch {
        return fail(400, 'BAD_REQUEST', 'The request body is not valid JSON.')
      }

      try {
        const result = await handler(body ?? {})
        return json({ ok: true, ...result })
      } catch (error) {
        const code = error?.code ?? error?.cause?.code ?? 'INTERNAL'
        const message = error?.message ?? String(error)
        ctx.logger?.('idea')?.warn?.(`${method} failed: ${message}`)
        return fail(500, code, message)
      }
    }
  }

  /* The editor runtime ships as one bundled script because the browser module
     table exposes no `@codemirror/*` rows. Serving it over a GET route keeps the
     client half free of a build step of its own: it fetches the script once and
     reads the surface from the global the bundle installs. */
  const editorBundle = (() => {
    try {
      return readFileSync(new URL('./editor.bundle.js', import.meta.url), 'utf8')
    } catch (error) {
      ctx.logger?.('idea')?.warn?.(`editor bundle is missing: ${error?.message ?? error}`)
      return undefined
    }
  })()

  function serveEditor() {
    if (editorBundle === undefined) {
      return new Response('// the Idea editor bundle was not built', {
        status: 503,
        headers: { 'content-type': 'text/javascript; charset=utf-8' },
      })
    }
    return new Response(editorBundle, {
      status: 200,
      headers: {
        'content-type': 'text/javascript; charset=utf-8',
        'cache-control': 'no-cache',
      },
    })
  }

  const disposers = []
  const registerFetch = ctx.connection?.fetch?.register
  if (typeof registerFetch !== 'function') {
    throw new Error('[dsh-idea] connection.fetch is unavailable, so the Idea API cannot be served.')
  }
  for (const method of Object.keys(handlers)) {
    disposers.push(
      registerFetch.call(ctx.connection.fetch, {
        path: routeOf(method),
        methods: ['POST'],
        requestBody: 'buffered',
        fetch: makeHandler(method),
      }),
    )
  }

  /* A prefix route rather than an exact one: the editor script is fetched by the
     page, and a prefix keeps the path stable if the bundle ever gains siblings. */
  const registerResource = ctx.webServer?.register
  if (typeof registerResource === 'function') {
    disposers.push(
      registerResource.call(ctx.webServer, {
        kind: 'prefix',
        path: EDITOR_ROUTE,
        resource: serveEditor,
      }),
    )
  } else {
    ctx.logger?.('idea')?.warn?.('webServer is unavailable, so the editor bundle cannot be served')
  }

  /* The Git tool window is the ported zhuweiyou/dsh-idea-git host half, mounted
     on its own /api/idea-git RPC channel. It stays optional exactly like the
     editor bundle: a failure to mount degrades to a log line, and the Idea
     panel keeps scanning and editing without Git. */
  try {
    const disposeGit = ideaGitApply(ctx)
    if (typeof disposeGit === 'function') disposers.push(disposeGit)
  } catch (error) {
    ctx.logger?.('idea')?.warn?.(`the Git tool window failed to mount: ${error?.message ?? error}`)
  }

  ctx.effect(() => () => {
    for (const dispose of disposers) {
      try {
        const value = dispose()
        if (value && typeof value.catch === 'function') value.catch(() => {})
      } catch {
        /* ignore */
      }
    }
  })
}
