# Idea

Recognise the languages and frameworks of the project behind the current
session, then browse and edit its files without leaving the Harness window.

- **Session header** — the lightbulb button beside the conversation title opens
  the Idea dialog: the scan root (follows the session directory, or pin one), the
  language distribution, the detected stack, and a file tree with a name search.
- **Right column** — clicking a file opens it in a CodeMirror tab. `Ctrl+S`
  writes it through the host filesystem with the version guard it read, so an
  external change surfaces as a non-blocking conflict bar instead of a silent
  overwrite.

## Settings

`skipDirs`, `maxFiles` (default 100000), `maxMs` (default 2000),
`maxFileBytes` (default 1048576), `languagesTopN` (default 8).

## Scope

The scan is static: manifests (`package.json`, `pyproject.toml`, `go.mod`,
`Cargo.toml`, `pom.xml`, `composer.json`, `Gemfile`), marker files, and file
extensions. No project toolchain is executed.

## Building the editor

The browser module table exposes no `@codemirror/*` rows, so a client half cannot
`require()` the editor at run time. The editor is bundled ahead of time into
`editor.bundle.js`, which the host half serves over `GET /idea/editor.js` and the
client half loads once through a script tag.

```sh
node build-editor.mjs      # needs @codemirror/* resolvable from this directory
```

Rebuild after changing `editor-bundle.entry.js` or the editor packages. The
bundle is committed, so a fresh install works without a build step.
