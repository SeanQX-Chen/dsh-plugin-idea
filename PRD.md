# PRD — 「Idea」侧边栏项目识别 + 代码编辑插件

> 状态：**草案 v0.1，等待用户逐条确认**（未获用户明确「可以」之前不写实现代码，不安装）
> 作者：AI（依据 m00001–m00150 的问答整理）
> 插件暂定名：`dsh-idea`（「idea」，与用户原话「在侧边栏加上一个 idea」一致）

---

## 1. 背景与目标

用户原话（m00001）：**"在侧边栏加上一个idea，功能是要能识别所有语言以及框架，支持修改其中的代码文件"**。

当前 DSH Web GUI 的左栏只有文件树/文件面板，看一个刚打开的目录时无法一眼知道「这是什么项目、用了什么技术栈」，改代码也要靠宿主已有的文件预览或外部编辑器。本插件目标：

- **A. 识别**：对当前会话目录（或用户钉住的目录）做项目级扫描，给出「语言分布 + 框架/技术栈清单」。
- **B. 定位**：侧边栏里提供文件树 + 技术栈徽章 + 文件名/路径搜索，快速跳到目标文件。
- **C. 修改**：在更大的右栏面板里用 CodeMirror 6 直接编辑，Ctrl+S 落盘，不弹确认、可被 git 回滚；外部改动有版本守卫冲突检测。

**验收标准（用户已选 A）**：钉目录 → 2 秒内看到语言分布 + 技术栈 → 搜到文件、打开、改一行、Ctrl+S、`git diff` 可见。

---

## 2. 现状勘察结论（已核对，影响方案）

### 2.1 宿主已有的可复用能力（不重造轮子）

| 能力 | 接口 | 用途 |
|---|---|---|
| 文件读写 + 版本守卫 | Host `ctx.fs`（Abstract filesystem provider） | 扫描列目录用 `listDir`，读用 `readText`，写用 `writeText(target, content, expected, signal, sandboxPolicy)` |
| 冲突检测原生机制 | `FsWriteIntent = {kind:'replaceIfVersion', version}` / 抛 `FS_STALE_VERSION` | 外部改动冲突提示，无需自造 mtime/hash |
| 会话目录 | Host `workingDirectory.get(session)` / `ensure(agent)` | 默认扫描根 = 当前会话 cwd |
| 目录选择 | Host `directoryPickerController.pick(signal)`（Client 侧 `uiWorkspace.pickDirectory()`） | 手动切换/钉住目录 |
| 沙箱策略 | Host `sandboxPolicy.resolve()` → `SandboxExecutionPolicy` | 写文件时复用现有策略，不另造白名单 |
| 右栏面板 | Client slot `sidebar.right.pane.tab` + `sidebar.right.pane.tab.title`（keyed, session，**key 域开放、编辑器面板应挂这里**） | 编辑器的容器 |
| 侧边栏导航入口 | Client slot `sidebar.panellist`（list, root，现有 occupants：plugins / dsh-market / schedules） | 左栏「Idea」按钮 |
| 主题 token | `--dsw-alias-bg-base/-layer-1/-layer-2/-border-l1/-border-l2/-label-primary/-label-secondary/-brand-primary/-state-*`、`--dsw-specific-sidebar-fill` | 全部样式只用这些 token |
| 多语言 | Client `ctx.locale.register(ns, locale, dict)` + `bind(ns)` | en / zh 文案 |

### 2.2 已安装的邻居插件（必须避让）

`dsh-better-sidebar@0.32.0` 已启用，且已经占了 `sidebar.right.pane.tab` 的 `dsh-better-sidebar:editor` / `:git` / `:files` / `:diff` / `:sidechat` 等 key，并提供**扩展点** `BetterSidebarService.registerTab / registerFileViewer / registerFileIcon / registerFileAction / registerTabAction`。

- 它不是竞品，而是「另一个用户已经装好、且在用的编辑器」。若本插件也做一个编辑器 tab，用户会看到两个编辑器入口。
- 它也自带了 CodeMirror（`@codemirror/*` 全系已在其 dependencies 里），可参考其 `src/client/lang.ts` 的语言映射与 `src/exclude-patterns.ts`、`src/search-engines.ts` 的跳过目录表（`.git`/`node_modules`/`.next`/`dist`/`build`/`target`/`venv`/`__pycache__`/`.worktrees` …）。

### 2.3 性能实测（本机 D:\dshWork，817 文件 / 47 目录，含跳目录规则）

全量递归遍历：**144 ms**。→ 「2 秒内出结果」对中型项目绰绰有余；预算按「≤10 万条目 / ≤2 s，超出则截断并标注」设计。

---

## 3. 方案对比（选一个，或组合）

### 方案 1：独立成篇的「识别 + 编辑器」双半插件（推荐）

- 左栏 `sidebar.panellist` 加一个 **Idea** 图标 → 点开是中间主面板（main panel）的「项目识别」页：语言分布条 + 技术栈徽章 + 文件树 + 搜索框。
- 点文件 → 在**右栏** `sidebar.right.pane.tab` 打开一个 `idea:editor` 编辑 tab（CodeMirror 6，多标签页）。
- Host 半（`index.js`）负责：扫描、技术栈识别、读文件、写文件（带 version 守卫）；Client 半（`client.js`）只做 UI 与渲染，通过 `host.call` 调用 Host 半。
- 优点：完全自主、互不干扰，插件可单独卸载；符合用户「在侧边栏加一个 idea」的原始表述。
- 缺点：与 dsh-better-sidebar 的功能（文件树/编辑器）有重叠，用户可能觉得「两个都能编辑」。

### 方案 2：只做「识别」，编辑器借用 better-sidebar 的扩展点

- 本插件只实现「语言分布 + 技术栈徽章 + 项目概览」，并通过 `registerTab` 往 better-sidebar 里加一个 `project-insight` tab；打开文件时调用 better-sidebar 的编辑器。
- 优点：零重复、体验统一（一个编辑器）。
- 缺点：强依赖别人家的插件（没装 / 版本 API 变了就退化），且用户明确要求「插件本身能直接修改代码文件」。

### 方案 3：只做「识别」，编辑器沿用 DSH 原生的文件预览 + 让 agent 改

- 优点：最小实现。
- 缺点：与用户 m00020 之后确认的「直接修改」矛盾，**已排除**。

**推荐：方案 1**（自包含 + 可独立卸载，且不依赖第三方版本面）。若用户更在意「不要出现第二个编辑器」，可切方案 2。

---

## 4. 功能需求

### 4.1 项目识别（Host 半）

- **扫描根**：默认 = 当前会话 `workingDirectory.get(session)`；用户可在顶部「目录」下拉里**钉住**一个自定义目录（走 `directoryPickerController.pick`），钉住后本会话内保持；未钉住时跟随会话目录变化。
- **遍历规则**：递归 `fs.listDir`，跳过噪声目录（默认集合同 better-sidebar 的 `SKIP_DIR_NAMES`，可在配置里增删），不跟随符号链接目录（防环）；预算：≤ 10 万条目、≤ 2 000 ms，命中任一上限即停止并返回 `truncated: true`。
- **语言分布**：按扩展名统计文件数 + 字节数 → 取 Top N（默认 8）+「其他」；每个语言配 `--dsw-alias-brand-primary` 色系色条。
- **技术栈识别**：静态规则表，**不跑项目工具链**：
  - 清单文件：`package.json`（dependencies/devDependencies）、`pyproject.toml`/`requirements.txt`、`go.mod`、`Cargo.toml`、`pom.xml`/`build.gradle`、`composer.json`、`Gemfile`；
  - 特征文件/目录：`next.config.*`、`vite.config.*`、`nuxt.config.*`、`angular.json`、`svelte.config.js`、`manage.py`、`docker-compose.yml`、`Dockerfile`、`.github/workflows/`、`tsconfig.json`、`pnpm-workspace.yaml`、`Makefile`、`*.csproj`、`*.sln`、`.csproj` 等；
  - 结论分类：语言、框架（Next/Nuxt/Angular/Vue/Svelte/React/Django/Flask/FastAPI/Spring/Gin/Actix …）、工具链（pnpm/npm/yarn/bun/vite/webpack/rollup/cargo/go mod/poetry/uv）、测试（vitest/jest/pytest）、部署（Docker/GitHub Actions）。
- **缓存**：以扫描根 + 「目录 mtime 摘要」为键缓存 30 s；`fs.watch` 目录变更时失效（可用则用，不可用则退回 30 s TTL）。
- **结果形态**（返回 Client）：`{ root, rootPinned, languages: [{id,label,files,bytes,share}], stack: [{category,label,evidence}], counts:{scanned,scannedDirs,truncated}, elapsedMs }`。

### 4.2 侧边栏导航（Client 半，主面板页）

- 顶部：钉住目录 + 「重新扫描」按钮 + 扫描耗时/截断提示。
- 中部：语言分布条（hover 显示文件数/占比）+ 技术栈徽章（可点击 → 过滤文件树到该技术的典型扩展名）。
- 下部：文件树（延迟展开、目录优先、隐藏文件淡显）+ 搜索框（**文件名/路径子串**匹配，结果上限 200，键盘上下选中、回车打开）。
- 点文件 → 在右栏打开编辑 tab；右键/悬浮提供「在文件夹中显示」「引用到对话」（可选，V1 不做）。

### 4.3 编辑器（右栏 tab）

- **CodeMirror 6**，语言支持首批（约 10 种，与已确认一致）：TS/JS(+JSX/TSX)、Python、Go、Rust、Java、C/C++、CSS、HTML、JSON、YAML、Markdown；其余纯文本可编辑。
- **多标签**：同一右侧面板支持 N 个打开文件（标签标题 = 文件名，未保存加 `•`）。
- **保存**：Ctrl+S 直接写盘，**不弹确认**；失败（权限/沙箱/冲突）在状态栏红字提示。
- **草稿**：未保存内容每 500 ms 暂存（Client `store` / localStorage），切换标签、切走再回来不丢；「放弃更改」按钮可回到磁盘版本。
- **冲突**：打开时记录 `FsVersion`；保存用 `{kind:'replaceIfVersion', version}`；收到 `FS_STALE_VERSION` 时弹出非阻塞提示条：「文件已在磁盘上被修改」+ 两个按钮【重载磁盘版本】【保留我的更改（覆盖）】。
- **编码/换行**：按 UTF-8 + 原文件换行风格（`fs.writeText` 会保留；读取时检测 CRLF/LF 并在状态栏显示）。
- **只读兜底**：文件 > 1 MB 或二进制 → 只读提示，不给编辑。

### 4.4 权限与安全

- 复用 DSH 现有 sandbox-policy / approval 体系：写文件时把 `sandboxPolicy.resolve({sessionId})` 结果传给 `fs.writeText`；不新增白名单、不绕开策略。
- 只允许在「已钉住的扫描根」内写；越界文件在编辑器里标只读。

### 4.5 多语言与配置

- 文案：`en` + `zh`（`locale/en.json`、`locale/zh.json`，含 `meta.title` / `meta.description`）。
- 配置项（Host `Config`）：`skipDirs`（默认同 4.1）、`maxFiles`（默认 100000）、`maxMs`（默认 2000）、`maxFileBytes`（默认 1 MiB）、`languagesTopN`（默认 8）。

### 4.6 明确「不做」（V1 出范围）

- 不做符号级/调用图分析，不跑 linter/LSP，不跑项目工具链。
- 不做 Git 面板、终端、提交。
- 不做代码搜索（内容搜索或正则），只做文件名/路径搜索。
- 不做保存前的确认弹窗。
- 不做独立 agent 中介（用户已排除）。

---

## 5. 技术形态（交付物）

- 一个 npm 包 `dsh-idea`：
  - `package.json`：`dsh.bundle.patch` → `cordis.patch.yml`；`dsh.client`（`platform: web`、`inject` 列出用到的 Client 包）；`exports` 含 `.`、`./client`、`./locale/*.json`、`./icon`；`files` 列全运行期文件。
  - `index.js`（Host）：`export function apply(ctx, config)` + `export const Config`；扫描/识别/读写逻辑；通过 `ctx.fs`、`workingDirectory`、`sandboxPolicy`、`directoryPickerController`。
  - `client.js`（Client）：注册 lazy factory（id = 包名），`ctx.slots.inject('sidebar.panellist', …)` 注册入口、`ctx.slots.inject('sidebar.right.pane.tab' | '.title', …)` 注册编辑器；通过 `host.call` 与 Host 半通信；`styles.insert` 注入样式。
  - `locale/{en,zh}.json`、`icon.svg`。
- 安装：用 `plugin_manager install_bundle`（不自写 profile 的 `package.json` / `cordis.patch.yml`、不跑 pnpm）。

---

## 6. 验收清单（DoD）

1. 插件安装后在左栏出现 Idea 图标；点开主面板显示当前会话目录的语言分布与技术栈，**≤ 2 s**。
2. 「钉住目录」可选择任意目录并立即重扫。
3. 搜索框输入文件名片段能命中并打开文件。
4. 编辑器中改一行 → Ctrl+S → 在终端 `git diff` 能看到该改动，且无确认弹窗。
5. 切走标签再回来，未保存内容仍在；点「放弃更改」恢复磁盘版本。
6. 用外部编辑器改同一文件后在本插件保存 → 出现冲突提示条，两个按钮都按预期工作。
7. 二元字符（中文路径、CRLF 文件）读写不乱码、不改变行尾。
8. 卸载插件后左栏图标与右栏 tab 均消失，无残留报错。
9. 语言/主题全部走 `--dsw-alias-*` token 与 locale 服务；浅色/深色主题下文字可读。

---

## 7. 风险与未决

| 风险 | 说明 | 对策 |
|---|---|---|
| 与 better-sidebar 功能重叠 | 用户可能不想有两个编辑器入口 | 见 §3 方案 2 备选；或 V1 先做识别、编辑器做「可用但可关」 |
| `host.call` 的 Host↔Client 通信细节 | 需按 `practices.md` 确认同包 Host 半的入口形式 | 实现第一步先做最小 ping/host.call 冒烟 |
| CodeMirror 打包体积 | 10 种语言语言包不小 | 按需动态 import；首次编辑才加载语言包 |
| 扫描大仓（monorepo） | 可能超预算 | 截断 + 提示；后续版本支持按子目录前缀扫描 |
| 外部改动检测窗口 | 两次保存之间极短 | 版本守卫本身保证安全，UI 只负责提示 |

---

## 8. 待用户回答的问题（我会逐个问）

1. 方案选 1（自带编辑器）还是方案 2（复用 better-sidebar 编辑）？
2. 插件显示名与图标风格（叫「Idea」还是别的）？
3. 是否要「多标签」同时打开多个文件，还是 V1 只开一个文件？
4. 左栏入口到底放 `sidebar.panellist`（最左下图标列）还是 `sidebar.files.*` 系列？
5. 冲突提示条交互是否同意（重载 / 保留我的更改 两个按钮）？
6. 中文界面是否必需（en + zh 双语）？还有别的语言要吗？
7. V1 是否接受「不做代码内容搜索 / 不做 Git / 不做终端」的裁剪？
8. 安装方式：直接装到当前 desktop profile（`plugin_manager install_bundle`）可以吗？
