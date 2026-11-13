/** The bottom Git panel shell: tabs, branch menu, remote actions, resize, minimize/maximize/close. */
import React from "react"
import { createPortal } from "react-dom"
import { useGit, Icon, IconButton, Dropdown, MenuItem } from "./lib/ui"
import { useT, t } from "./lib/i18n"
import { useWindow, setHeight, toggleMaximized, toggleMinimized, closePanel } from "./window"
import * as store from "./store"
import { pickDirectory } from "./api"
import { ChangesView } from "./views/ChangesView"
import { LogView } from "./views/LogView"
import { ConsoleView } from "./views/ConsoleView"
import { StashView } from "./views/StashView"
import { WorktreeView } from "./views/WorktreeView"
import { SubmoduleView } from "./views/SubmoduleView"
import { ShelfView } from "./views/ShelfView"
import { RebasePlanDialog } from "./views/RebasePlanDialog"
import { DiffView } from "./views/DiffView"
import { ConflictView } from "./views/ConflictView"
import { CompareView } from "./views/CompareView"
import { ContextMenuHost } from "./lib/contextMenu"
import { syncAll } from "./services"
import { saveCurrentWorkspace } from "./workspaceState"
import { PromptHost, askText } from "./lib/prompt"
import { ConfirmHost } from "./lib/confirm"
import { MergeConflictsDialog } from "./views/MergeConflictsDialog"
import { TagDialog } from "./views/TagDialog"
import { PatchPreviewDialog } from "./views/PatchPreviewDialog"
import { IncomingOutgoingDialog, CompareBranchesDialog } from "./views/CommitListsDialog"
import { RefChooserHost } from "./lib/refChooser"

const TABS: Array<{ id: store.TabId; label: string }> = [
  { id: "changes", label: "Commit" },
  { id: "log", label: "Log" },
  { id: "console", label: "Console" },
  { id: "worktree", label: "Worktrees" },
  { id: "submodule", label: "Submodules" },
]

function errorText(t: (s: string, p?: any) => string, code: string | null, fallback: string | null): string {
  switch (code) {
    case "git/not-a-repository":
      return t("Not a Git repository")
    case "git/not-found":
      return t("Git was not found. Install Git or set its path in the plugin settings.")
    case "git/no-target":
      return t("No workspace is open yet.")
    case "git/empty-message":
      return t("Please enter a commit message.")
    case "idea-git/no-connection":
      return t("Connection to the Host is unavailable.")
    default:
      return fallback || t("Something went wrong")
  }
}

function ResizeHandle() {
  const w = useWindow()
  const startDrag = (e: React.PointerEvent) => {
    e.preventDefault()
    const startY = e.clientY
    const startH = w.height
    const move = (ev: PointerEvent) =>
      setHeight(Math.max(140, Math.min(window.innerHeight - 80, startH + (startY - ev.clientY))))
    const up = () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
  }
  return <div className="dig-panel__grip" role="separator" aria-orientation="horizontal" onPointerDown={startDrag} />
}

export class ViewBoundary extends React.Component<{ children: React.ReactNode }, { err: any }> {
  state: { err: any } = { err: null }
  static getDerivedStateFromError(err: any) {
    return { err }
  }
  componentDidCatch(err: any, info: any) {
    try {
      console.error("[idea-git] view crashed", err, info)
    } catch {}
  }
  render() {
    if (this.state.err) {
      const msg = String(this.state.err?.stack || this.state.err?.message || this.state.err)
      return (
        <div className="dig-errorpane">
          <div className="dig-errorpane__title">{t("View render error")}</div>
          <pre className="dig-errorpane__msg">{msg}</pre>
          <div className="dig-errorpane__actions">
            <button type="button" className="dig-btn" onClick={() => this.setState({ err: null })}>
              {t("Retry")}
            </button>
            <button
              type="button"
              className="dig-btn"
              onClick={() => {
                try {
                  window.location.reload()
                } catch {}
              }}
            >
              {t("Reload page")}
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

function CommitTabView() {
  const t = useT()
  const [sub, setSub] = React.useState<"changes" | "stash" | "shelf" | "combined">(() => {
    const v = localStorage.getItem("dig.commitSub")
    return v === "stash" || v === "shelf" || v === "combined" ? v : "changes"
  })
  const combine = (() => {
    try {
      return localStorage.getItem("dig.combineStashShelf") === "1"
    } catch {
      return false
    }
  })()
  const pick = (v: "changes" | "stash" | "shelf" | "combined") => {
    setSub(v)
    try {
      localStorage.setItem("dig.commitSub", v)
    } catch {}
  }
  const tabs: Array<{ id: "changes" | "stash" | "shelf" | "combined"; label: string }> = combine
    ? [
        { id: "changes", label: t("Changes") },
        { id: "combined", label: t("Stashes and Shelves") },
      ]
    : [
        { id: "changes", label: t("Changes") },
        { id: "stash", label: t("Stash") },
        { id: "shelf", label: t("Shelf") },
      ]
  return (
    <div className="dig-committab">
      <div className="dig-committab__bar" role="tablist">
        {tabs.map((x) => (
          <button
            key={x.id}
            type="button"
            role="tab"
            className="dig-committab__tab"
            data-active={(combine && sub !== "changes" ? "combined" : sub) === x.id ? "true" : undefined}
            onClick={() => pick(x.id)}
          >
            {x.label}
          </button>
        ))}
      </div>
      <div className="dig-committab__body">
        {sub === "changes" ? (
          <ChangesView />
        ) : combine ? (
          <div className="dig-committab__stack">
            <div className="dig-committab__half">
              <StashView />
            </div>
            <div className="dig-committab__half">
              <ShelfView />
            </div>
          </div>
        ) : sub === "stash" ? (
          <StashView />
        ) : (
          <ShelfView />
        )}
      </div>
    </div>
  )
}

/**
 * First-run setup. Nothing else in the panel is reachable until the project has
 * a repository, a first commit and a remote, so the normal UI is only shown once
 * this wizard has run its course.
 */
function SetupView() {
  const s = useGit()
  const t = useT()
  const step = store.setupStep() || "create"
  const [provider, setProvider] = React.useState<"github" | "gitlab">("github")
  // The provider screen is skipped once the user has answered it, even though
  // the underlying repository state has not changed yet.
  const [providerChosen, setProviderChosen] = React.useState(false)
  const [url, setUrl] = React.useState("")
  const [message, setMessage] = React.useState("Initial commit")
  const [showClone, setShowClone] = React.useState(false)
  const [cloneUrl, setCloneUrl] = React.useState("")
  const [parent, setParent] = React.useState("")
  const dir = s.target?.directory || s.info?.directory || ""

  const effective: "create" | "provider" | "remote" =
    step === "provider" && providerChosen ? "remote" : (step as "create" | "provider" | "remote")
  const steps: Array<{ id: "create" | "provider" | "remote"; label: string }> = [
    { id: "create", label: t("Create the repository") },
    { id: "provider", label: t("Choose GitHub or GitLab") },
    { id: "remote", label: t("Connect the remote") },
  ]
  const index = steps.findIndex((x) => x.id === effective)

  const openHost = () => {
    const target = provider === "github" ? "https://github.com/new" : "https://gitlab.com/projects/new"
    window.open(target, "_blank", "noopener,noreferrer")
  }

  return (
    <div className="dig-empty dig-setup">
      <div className="dig-setup__card">

        <div className="dig-setup__title">
          <Icon name={effective === "create" ? "folder" : "git"} size={18} />
          <span>{t("Set up Git for this project")}</span>
        </div>
        {dir ? <div className="dig-setup__path">{dir}</div> : null}

        <ol className="dig-setup__steps">
          {steps.map((item, i) => (
            <li
              key={item.id}
              className={
                "dig-setup__step" +
                (i === index ? " dig-setup__step--active" : "") +
                (i < index ? " dig-setup__step--done" : "")
              }
            >
              <span className="dig-setup__badge">{i < index ? <Icon name="check" size={11} /> : i + 1}</span>
              <span>{item.label}</span>
            </li>
          ))}
        </ol>

        {effective === "create" ? (
          <div className="dig-setup__body">
            <div className="dig-setup__hint">{t("This folder is not a Git repository yet.")}</div>
            <div className="dig-setup__actions">
              <button
                type="button"
                className="dig-btn dig-btn--primary"
                disabled={!dir || !!s.busy}
                onClick={() => void store.setupCreateRepo()}
              >
                {t("Create Git repository")}
              </button>
              <button type="button" className="dig-btn" onClick={() => setShowClone((v) => !v)}>
                {t("Clone Repository…")}
              </button>
              <button type="button" className="dig-btn" onClick={() => void store.refreshWithFeedback()}>
                {t("Retry")}
              </button>
            </div>
            {showClone ? (
              <div className="dig-norepo__clone">
                <input
                  className="dig-modal__input"
                  placeholder={t("Repository URL")}
                  value={cloneUrl}
                  onChange={(e) => setCloneUrl(e.target.value)}
                />
                <div className="dig-norepo__dest">
                  <input
                    className="dig-modal__input"
                    placeholder={t("Destination folder")}
                    value={parent}
                    onChange={(e) => setParent(e.target.value)}
                  />
                  <button
                    type="button"
                    className="dig-btn"
                    onClick={async () => {
                      const d = await pickDirectory()
                      if (d) setParent(d)
                    }}
                  >
                    {t("Browse…")}
                  </button>
                </div>
                <button
                  type="button"
                  className="dig-btn dig-btn--primary"
                  disabled={!cloneUrl.trim() || !parent.trim() || !!s.busy}
                  onClick={() => void store.cloneRepo(cloneUrl.trim(), parent.trim())}
                >
                  {t("Clone")}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        {effective === "provider" ? (
          <div className="dig-setup__body">
            <div className="dig-setup__hint">{t("Where do you want to host this project?")}</div>
            <div className="dig-setup__providers">
              <button
                type="button"
                className={"dig-setup__provider" + (provider === "github" ? " dig-setup__provider--active" : "")}
                onClick={() => setProvider("github")}
              >
                GitHub
              </button>
              <button
                type="button"
                className={"dig-setup__provider" + (provider === "gitlab" ? " dig-setup__provider--active" : "")}
                onClick={() => setProvider("gitlab")}
              >
                GitLab
              </button>
            </div>
            <div className="dig-setup__actions">
              <button type="button" className="dig-btn" onClick={openHost}>
                {provider === "github" ? t("Open GitHub…") : t("Open GitLab…")}
              </button>
              <button type="button" className="dig-btn dig-btn--primary" onClick={() => setProviderChosen(true)}>
                {t("Continue")}
              </button>
            </div>
          </div>
        ) : null}

        {effective === "remote" ? (
          <div className="dig-setup__body">
            <div className="dig-setup__hint">
              {provider === "github"
                ? t("Create the repository on GitHub first, then paste its URL here.")
                : t("Create the project on GitLab first, then paste its URL here.")}
            </div>
            <div className="dig-setup__field">
              <label>{provider === "github" ? t("GitHub repository") : t("GitLab project")}</label>
              <input
                className="dig-modal__input"
                placeholder={
                  provider === "github" ? t("owner/repo or a repository URL") : t("group/project or a repository URL")
                }
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>
            <div className="dig-setup__field">
              <label>{t("First commit message")}</label>
              <input className="dig-modal__input" value={message} onChange={(e) => setMessage(e.target.value)} />
            </div>
            <div className="dig-setup__actions">
              <button type="button" className="dig-btn" onClick={openHost}>
                {provider === "github" ? t("Open GitHub…") : t("Open GitLab…")}
              </button>
              <button
                type="button"
                className="dig-btn dig-btn--primary"
                disabled={!!s.busy}
                onClick={() => void store.setupPublish(provider, url.trim(), message.trim() || "Initial commit")}
              >
                {t("Finish setup and upload")}
              </button>
            </div>
            <div className="dig-setup__hint dig-setup__hint--muted">
              {t("Leave the URL empty to use the existing origin remote.")}
            </div>
          </div>
        ) : null}

        {s.error ? <div className="dig-setup__error">{s.error}</div> : null}
      </div>
    </div>
  )
}
function Body() {
  const s = useGit()
  const t = useT()
  if (s.loading && !s.ready) return <div className="dig-empty">{t("Loading")}</div>
  if (store.setupStep()) return <SetupView />
  switch (s.tab) {
    case "changes":
      return <CommitTabView />
    case "log":
      return <LogView />
    case "console":
      return <ConsoleView />
    case "stash":
      return <StashView />
    case "shelf":
      return <ShelfView />
    case "worktree":
      return <WorktreeView />
    case "submodule":
      return <SubmoduleView />
    default:
      return null
  }
}

export function Panel(props: { embedded?: boolean }) {
  const embedded = props?.embedded === true
  const wRaw = useWindow()
  /* Embedded mode (Idea panel "Git" page): the window is always open, never
   * docked to the viewport and never portalised — it renders in place. */
  const w = embedded ? { ...wRaw, open: true } : wRaw
  const s = useGit()
  const t = useT()
  /* While the setup wizard is showing there is no repository to operate on, so
   * the tab bar and the remote/branch controls stay hidden. */
  const setup = store.setupStep() !== null
  const [statusCopied, setStatusCopied] = React.useState(false)
  const statusTimer = React.useRef<any>(null)
  React.useEffect(() => {
    const h = embedded ? 0 : w.open && !w.maximized ? (w.minimized ? 40 : w.height) : 0
    const body = document.body
    try {
      if (h > 0) {
        document.documentElement.style.setProperty("--dig-panel-h", h + "px")
        body.classList.add("dig-docked")
      } else body.classList.remove("dig-docked")
    } catch {}
    return () => {
      try {
        body.classList.remove("dig-docked")
      } catch {}
    }
  }, [w.open, w.height, w.minimized, w.maximized, embedded])
  React.useEffect(() => {
    if (!w.open || w.minimized) return
    let stopped = false
    const tick = () => {
      if (!stopped && document.visibilityState === "visible") void store.autoRefresh()
    }
    tick()
    const timer = window.setInterval(tick, 2500)
    return () => {
      stopped = true
      window.clearInterval(timer)
    }
  }, [w.open, w.minimized])

  React.useEffect(() => {
    saveCurrentWorkspace()
  }, [w.open, w.height, w.maximized, w.minimized])
  React.useEffect(() => {
    if (w.open) syncAll()
  }, [w.open])
  React.useEffect(() => {
    if (!w.open) return
    const auto = localStorage.getItem("dig.autoFetch") === "1"
    const fetchTimer = auto
      ? setInterval(() => {
          void store.silentFetch()
        }, 120000)
      : null
    return () => {
      if (fetchTimer) clearInterval(fetchTimer)
    }
  }, [w.open])
  React.useEffect(() => {
    if (!w.open) return
    const timer = setInterval(() => {
      try {
        void store.refreshSummary()
      } catch {}
    }, 5000)
    return () => clearInterval(timer)
  }, [w.open])
  React.useEffect(() => {
    if (!w.open) return
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape") return
      // Modal dialogs own Escape; otherwise Escape closes the panel even from inputs.
      if (document.querySelector('.dig-modal-mask, [aria-modal="true"]')) return
      // Esc dismisses the top-most overlay first, otherwise closes the panel (same as the close button).
      if (s.diff || s.blame) {
        ev.preventDefault()
        store.closeDiff()
        return
      }
      if (s.conflict) {
        ev.preventDefault()
        store.closeConflict()
        return
      }
      if (s.compare) {
        ev.preventDefault()
        store.closeCompare()
        return
      }
      ev.preventDefault()
      closePanel()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [w.open, s.diff, s.blame, s.conflict, s.compare])
  if (!w.open) return null

  const height = embedded ? "100%" : w.maximized ? "100vh" : w.minimized ? 40 : w.height
  const bottom = w.minimized ? 40 : w.height
  const branch = s.info?.branch?.head
  const locals = s.branches.filter((b) => !b.remote)
  const remotes = s.branches.filter((b) => b.remote && !b.name.endsWith("/HEAD"))
  const content = (
    <>
      {!w.maximized && (s.diff || s.blame) ? <DiffView bottom={bottom} theme={w.theme} /> : null}
      {!w.maximized && s.conflict ? <ConflictView key={s.conflict.file} bottom={bottom} theme={w.theme} /> : null}
      {!w.maximized && s.compare ? <CompareView bottom={bottom} theme={w.theme} /> : null}
      <div
        className="dig-theme dig-panel"
        data-theme={w.theme}
        data-maximized={w.maximized ? "true" : undefined}
        style={{ height }}
      >
        {!w.maximized && !w.minimized ? <ResizeHandle /> : null}
        <div className="dig-panel__header" onDoubleClick={() => toggleMaximized()}>
          <span className="dig-panel__brand">
            <Icon name="git" size={15} /> Git
          </span>
          <div className="dig-panel__tabs" role="tablist" hidden={setup}>
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                className="dig-tab"
                data-active={s.tab === tab.id ? "true" : undefined}
                onClick={() => store.setTab(tab.id)}
              >
                {t(tab.label)}
              </button>
            ))}
          </div>
          <div className="dig-panel__spacer" />
          {s.info?.isRepo ? (
            <Dropdown
              align="right"
              trigger={() => (
                <span className="dig-panel__branch" title={s.info?.branch?.upstream || branch || ""}>
                  <Icon name="branch" size={13} />
                  {branch || "—"}
                  {s.info?.branch?.ahead ? <span> ↑{s.info.branch.ahead}</span> : null}
                  {s.info?.branch?.behind ? <span> ↓{s.info.branch.behind}</span> : null}
                  <Icon name="chevronDown" size={12} />
                </span>
              )}
            >
              {(close) => (
                <>
                  {locals.length === 0 && remotes.length === 0 ? (
                    <MenuItem disabled onClick={() => {}}>
                      {t("No branches")}
                    </MenuItem>
                  ) : null}
                  {locals.map((b) => (
                    <MenuItem
                      key={b.ref}
                      checked={b.current}
                      onClick={() => {
                        close()
                        if (!b.current) void store.checkout(b.name)
                      }}
                    >
                      {b.name}
                    </MenuItem>
                  ))}
                  {remotes.length > 0 ? (
                    <>
                      <div className="dig-menu__sep" />
                      <div className="dig-menu__heading">{t("Remote branches")}</div>
                      {remotes.map((b) => (
                        <MenuItem
                          key={b.ref}
                          onClick={() => {
                            close()
                            /* Checking out a remote ref creates a tracking local branch. */
                            const short = b.name.replace(/^[^/]+\//, "")
                            void store.checkout(short, true)
                          }}
                        >
                          {b.name}
                        </MenuItem>
                      ))}
                    </>
                  ) : null}
                  <div className="dig-menu__sep" />
                  <MenuItem
                    onClick={async () => {
                      close()
                      const name = await askText(t("New branch name"))
                      if (name) void store.checkout(name, true)
                    }}
                  >
                    {t("Create branch…")}
                  </MenuItem>
                </>
              )}
            </Dropdown>
          ) : null}
          {s.info?.isRepo ? (
            <>
              <IconButton icon="cloud" size={17} title={t("Fetch")} onClick={() => void store.remoteOp("fetch")} />
              <IconButton icon="download" size={17} title={t("Pull")} onClick={() => void store.remoteOp("pull")} />
              <IconButton icon="upload" size={17} title={t("Push")} onClick={() => void store.remoteOp("push")} />
            </>
          ) : null}
          <IconButton icon="refresh" size={17} title={t("Refresh")} onClick={() => void store.refreshWithFeedback()} />
          <IconButton
            icon={w.minimized ? "maximize" : "minimize"}
            size={17}
            title={w.minimized ? t("Expand") : t("Minimize")}
            onClick={toggleMinimized}
          />
          <IconButton
            icon={w.maximized ? "restore" : "maximize"}
            size={17}
            title={w.maximized ? t("Restore") : t("Maximize")}
            onClick={toggleMaximized}
          />
          <IconButton icon="close" size={17} title={t("Close")} onClick={closePanel} />
        </div>
        {s.error && s.info?.isRepo !== false ? (
          <div className="dig-banner dig-banner--error">
            <Icon name="warning" size={14} />
            <span>{errorText(t, s.errorCode, s.error)}</span>
            <button
              type="button"
              className="dig-iconbtn dig-banner__close"
              title={t("Close")}
              onClick={() => store.dismissError()}
            >
              ✕
            </button>
          </div>
        ) : null}
        {!w.minimized ? (
          <div className="dig-panel__body">
            <ViewBoundary>
              <Body />
            </ViewBoundary>
          </div>
        ) : null}
        <div className="dig-statusbar" data-kind={s.statusKind}>
          <span
            className="dig-statusbar__msg"
            title={t("Click to copy")}
            onClick={async () => {
              const text = s.busy ? s.busyLabel || t("Loading") : s.statusText || ""
              if (!text) return
              try {
                await navigator.clipboard.writeText(text)
                setStatusCopied(true)
                if (statusTimer.current) clearTimeout(statusTimer.current)
                statusTimer.current = setTimeout(() => setStatusCopied(false), 1500)
              } catch {}
            }}
          >
            {statusCopied ? t("Copied") : s.busy ? s.busyLabel || t("Loading") : s.statusText || ""}
          </span>
        </div>
      </div>
      <ContextMenuHost />
      <PromptHost />
      <ConfirmHost />
      <MergeConflictsDialog />
      <TagDialog />
      <PatchPreviewDialog />
      <IncomingOutgoingDialog />
      <CompareBranchesDialog />
      <RefChooserHost />
      <RebasePlanDialog />
    </>
  )
  if (embedded) return content
  return createPortal(content, document.body)
}
