// Path helpers shared by the Host half. Pure string work — no filesystem.

export function normalizeRoot(path) {
  if (typeof path !== 'string') return ''
  let value = path.replace(/\\/g, '/')
  if (value.length > 1 && value.endsWith('/')) value = value.slice(0, -1)
  return value
}

export function isInside(parent, child) {
  const a = normalizeRoot(parent).toLowerCase()
  const b = normalizeRoot(child).toLowerCase()
  if (a === '' || b === '') return false
  if (a === b) return true
  return b.startsWith(a.endsWith('/') ? a : `${a}/`)
}

export function joinPath(base, name) {
  const root = normalizeRoot(base)
  if (root === '') return name
  return `${root}/${name}`
}

export function baseName(path) {
  const value = normalizeRoot(path)
  const index = value.lastIndexOf('/')
  return index < 0 ? value : value.slice(index + 1)
}

export function extensionOf(name) {
  const index = name.lastIndexOf('.')
  if (index <= 0) return ''
  return name.slice(index + 1).toLowerCase()
}

export function relativeTo(root, path) {
  const a = normalizeRoot(root).toLowerCase()
  const b = normalizeRoot(path)
  if (a !== '' && b.toLowerCase().startsWith(`${a}/`)) return b.slice(a.length + 1)
  return b
}
