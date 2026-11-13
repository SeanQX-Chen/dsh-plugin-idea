// Static (never-executed) stack detection: manifests + characteristic files
// + evidence gathered by the scan. No project tooling is ever run.

const DEP_PACKAGES = [
  // category, label, matchers
  ['framework', 'Next.js', ['next']],
  ['framework', 'Nuxt', ['nuxt', 'nuxt3']],
  ['framework', 'Nuxt', ['@nuxt/content']],
  ['framework', 'React', ['react', 'react-dom']],
  ['framework', 'Vue', ['vue']],
  ['framework', 'Svelte', ['svelte']],
  ['framework', 'SvelteKit', ['@sveltejs/kit']],
  ['framework', 'Astro', ['astro']],
  ['framework', 'Angular', ['@angular/core']],
  ['framework', 'Solid', ['solid-js']],
  ['framework', 'Qwik', ['@builder.io/qwik']],
  ['framework', 'Remix', ['@remix-run/react']],
  ['framework', 'Express', ['express']],
  ['framework', 'Fastify', ['fastify']],
  ['framework', 'Koa', ['koa']],
  ['framework', 'Hono', ['hono']],
  ['framework', 'NestJS', ['@nestjs/core']],
  ['framework', 'Electron', ['electron']],
  ['framework', 'Tauri', ['@tauri-apps/api']],
  ['framework', 'React Native', ['react-native']],
  ['framework', 'Expo', ['expo']],
  ['framework', 'Three.js', ['three']],
  ['framework', 'D3', ['d3']],
  ['framework', 'Tailwind CSS', ['tailwindcss']],
  ['framework', 'Sass', ['sass', 'node-sass']],
  ['framework', 'MUI', ['@mui/material']],
  ['framework', 'Ant Design', ['antd']],
  ['framework', 'Chakra UI', ['@chakra-ui/react']],
  ['framework', 'styled-components', ['styled-components']],
  ['framework', 'Prisma', ['prisma', '@prisma/client']],
  ['framework', 'TypeORM', ['typeorm']],
  ['framework', 'Drizzle', ['drizzle-orm']],
  ['framework', 'Sequelize', ['sequelize']],
  ['framework', 'Mongoose', ['mongoose']],
  ['framework', 'GraphQL', ['graphql', 'graphql-yoga', 'apollo-server', '@apollo/server']],
  ['framework', 'Storybook', ['@storybook/react', 'storybook']],
  ['tooling', 'Vite', ['vite']],
  ['tooling', 'Webpack', ['webpack']],
  ['tooling', 'Rollup', ['rollup']],
  ['tooling', 'esbuild', ['esbuild']],
  ['tooling', 'SWC', ['@swc/core']],
  ['tooling', 'Babel', ['@babel/core']],
  ['tooling', 'tsup', ['tsup']],
  ['tooling', 'Turborepo', ['turbo']],
  ['testing', 'Vitest', ['vitest']],
  ['testing', 'Jest', ['jest']],
  ['testing', 'Mocha', ['mocha']],
  ['testing', 'Playwright', ['@playwright/test']],
  ['testing', 'Cypress', ['cypress']],
  ['testing', 'Testing Library', ['@testing-library/react', '@testing-library/dom']],
  ['quality', 'ESLint', ['eslint']],
  ['quality', 'Prettier', ['prettier']],
  ['quality', 'Biome', ['@biomejs/biome']],
  ['state', 'Redux', ['redux', '@reduxjs/toolkit']],
  ['state', 'Zustand', ['zustand']],
  ['state', 'MobX', ['mobx']],
  ['state', 'Pinia', ['pinia']],
  ['state', 'TanStack Query', ['@tanstack/react-query', '@tanstack/query-core']],
  ['state', 'RxJS', ['rxjs']],
  ['realtime', 'Socket.IO', ['socket.io', 'socket.io-client']],
  ['realtime', 'Supabase', ['@supabase/supabase-js']],
  ['realtime', 'Firebase', ['firebase']],
]

const PY_PACKAGES = [
  ['framework', 'Django', ['django']],
  ['framework', 'Flask', ['flask']],
  ['framework', 'FastAPI', ['fastapi']],
  ['framework', 'Starlette', ['starlette']],
  ['framework', 'Tornado', ['tornado']],
  ['framework', 'aiohttp', ['aiohttp']],
  ['framework', 'Streamlit', ['streamlit']],
  ['framework', 'Pandas', ['pandas']],
  ['framework', 'NumPy', ['numpy']],
  ['framework', 'PyTorch', ['torch']],
  ['framework', 'TensorFlow', ['tensorflow']],
  ['framework', 'JAX', ['jax']],
  ['framework', 'Transformers', ['transformers']],
  ['tooling', 'Poetry', ['poetry']],
  ['tooling', 'uv', ['uv']],
  ['testing', 'pytest', ['pytest']],
  ['quality', 'ruff', ['ruff']],
  ['quality', 'mypy', ['mypy']],
  ['quality', 'black', ['black']],
  ['data', 'SQLAlchemy', ['sqlalchemy']],
  ['data', 'Pydantic', ['pydantic']],
]

const ROOT_FILE_RULES = [
  ['framework', 'Next.js', ['next.config.js', 'next.config.mjs', 'next.config.ts', 'next.config.cjs']],
  ['framework', 'Nuxt', ['nuxt.config.ts', 'nuxt.config.js']],
  ['framework', 'Angular', ['angular.json']],
  ['framework', 'SvelteKit', ['svelte.config.js', 'svelte.config.ts']],
  ['framework', 'Astro', ['astro.config.mjs', 'astro.config.ts']],
  ['framework', 'Vite', ['vite.config.js', 'vite.config.ts', 'vite.config.mjs', 'vite.config.mts']],
  ['tooling', 'Webpack', ['webpack.config.js', 'webpack.config.ts']],
  ['tooling', 'Rollup', ['rollup.config.js', 'rollup.config.mjs', 'rollup.config.ts']],
  ['tooling', 'esbuild', ['esbuild.config.mjs']],
  ['tooling', 'eslint', ['eslint.config.js', 'eslint.config.mjs', '.eslintrc', '.eslintrc.json', '.eslintrc.js', '.eslintrc.cjs']],
  ['tooling', 'TypeScript', ['tsconfig.json']],
  ['tooling', 'pnpm', ['pnpm-workspace.yaml', 'pnpm-lock.yaml']],
  ['tooling', 'npm', ['package-lock.json']],
  ['tooling', 'Yarn', ['yarn.lock', '.yarnrc.yml']],
  ['tooling', 'Bun', ['bun.lockb', 'bunfig.toml']],
  ['tooling', 'Turborepo', ['turbo.json']],
  ['tooling', 'Nx', ['nx.json']],
  ['tooling', 'Make', ['Makefile', 'makefile']],
  ['tooling', 'CMake', ['CMakeLists.txt']],
  ['tooling', 'Cargo', ['Cargo.toml']],
  ['tooling', 'Go modules', ['go.mod']],
  ['tooling', 'Poetry', ['poetry.lock']],
  ['tooling', 'uv', ['uv.lock']],
  ['tooling', 'pnpm', ['.npmrc']],
  ['framework', 'Django', ['manage.py']],
  ['framework', 'Flask', ['wsgi.py']],
  ['testing', 'pytest', ['pytest.ini', 'conftest.py', 'tox.ini']],
  ['quality', 'Prettier', ['.prettierrc', '.prettierrc.json', 'prettier.config.js']],
  ['quality', 'Biome', ['biome.json', 'biome.jsonc']],
  ['deploy', 'Docker', ['Dockerfile', 'docker-compose.yml', 'docker-compose.yaml', 'compose.yaml']],
  ['deploy', 'Vercel', ['vercel.json']],
  ['deploy', 'Netlify', ['netlify.toml']],
  ['deploy', 'Cloudflare', ['wrangler.toml', 'wrangler.jsonc']],
  ['deploy', 'Kubernetes', ['Chart.yaml']],
  ['deploy', 'Terraform', ['main.tf', 'terraform.tfvars']],
  ['docs', 'MkDocs', ['mkdocs.yml']],
  ['docs', 'Docusaurus', ['docusaurus.config.js', 'docusaurus.config.ts']],
]

function add(list, category, label, evidence) {
  const existing = list.find((item) => item.category === category && item.label === label)
  if (existing) {
    if (evidence && !existing.evidence.includes(evidence)) existing.evidence.push(evidence)
    return
  }
  list.push({ category, label, evidence: evidence ? [evidence] : [] })
}

function parseJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

function packagesOfDependencyMap(map) {
  return Object.keys(map ?? {})
}

async function tryRead(fs, target) {
  try {
    const bytes = await fs.readBytes(target, undefined, 4 * 1024 * 1024)
    return new TextDecoder('utf-8').decode(bytes)
  } catch {
    return undefined
  }
}

function matchPackages(list, table, names, evidence) {
  const lower = new Set(names.map((name) => String(name).toLowerCase()))
  for (const [category, label, matchers] of table) {
    if (matchers.some((matcher) => lower.has(matcher))) add(list, category, label, evidence)
  }
}

/**
 * @param fs host filesystem provider
 * @param rootTarget FsTarget of the project root
 * @param scanFiles evidence produced by scanProject
 */
export async function detectStack(fs, rootTarget, scanFiles, options = {}) {
  const policy = options.policy
  const stack = []

  const rootNames = new Set((scanFiles.root ?? []).map((name) => name.toLowerCase()))
  for (const [category, label, files] of ROOT_FILE_RULES) {
    for (const file of files) {
      if (rootNames.has(file.toLowerCase())) {
        add(stack, category, label, file)
        break
      }
    }
  }

  const rootEntries = await fs.listDir(rootTarget, policy).catch(() => [])
  const byName = new Map(rootEntries.map((entry) => [entry.name.toLowerCase(), entry]))

  const manifest = byName.get('package.json')
  if (manifest) {
    const text = await tryRead(fs, manifest.target)
    const json = text ? parseJson(text) : undefined
    if (json) {
      const names = [
        ...packagesOfDependencyMap(json.dependencies),
        ...packagesOfDependencyMap(json.devDependencies),
        ...packagesOfDependencyMap(json.peerDependencies),
      ]
      matchPackages(stack, DEP_PACKAGES, names, 'package.json')
      const manager = json.packageManager
      if (typeof manager === 'string') {
        const name = manager.split('@')[0]
        if (name) add(stack, 'tooling', name, 'package.json#packageManager')
      }
      const scripts = json.scripts ?? {}
      for (const key of ['dev', 'build', 'test', 'lint']) {
        const script = scripts[key]
        if (typeof script === 'string') {
          for (const tool of ['vite', 'next', 'nuxt', 'astro', 'svelte-kit', 'webpack', 'tsc', 'vitest', 'jest', 'playwright', 'cypress', 'eslint', 'prettier']) {
            if (script.includes(tool)) add(stack, 'scripts', tool, `scripts.${key}`)
          }
        }
      }
      if (json.type === 'module') add(stack, 'tooling', 'ESM', 'package.json#type')
    }
  }

  const readTextRoot = async (name) => {
    const entry = byName.get(name)
    if (!entry) return undefined
    return tryRead(fs, entry.target)
  }

  const pyproject = await readTextRoot('pyproject.toml')
  if (pyproject) {
    const lower = pyproject.toLowerCase()
    for (const [category, label, matchers] of PY_PACKAGES) {
      if (matchers.some((matcher) => new RegExp(`(^|[\\s"'\\[=,])${matcher}([\\s"'\\]=,<>=~!]|$)`, 'm').test(lower))) {
        add(stack, category, label, 'pyproject.toml')
      }
    }
    if (lower.includes('[tool.poetry]')) add(stack, 'tooling', 'Poetry', 'pyproject.toml')
    if (lower.includes('[tool.uv]')) add(stack, 'tooling', 'uv', 'pyproject.toml')
    if (lower.includes('[tool.ruff]')) add(stack, 'quality', 'ruff', 'pyproject.toml')
    if (lower.includes('[tool.pytest.ini_options]')) add(stack, 'testing', 'pytest', 'pyproject.toml')
  }

  const requirements = await readTextRoot('requirements.txt')
  if (requirements) {
    for (const [category, label, matchers] of PY_PACKAGES) {
      if (matchers.some((matcher) => new RegExp(`^\\s*${matcher}\\b`, 'im').test(requirements))) {
        add(stack, category, label, 'requirements.txt')
      }
    }
  }

  const goMod = await readTextRoot('go.mod')
  if (goMod) {
    if (/^module\s+\S+/m.test(goMod)) add(stack, 'language', 'Go modules', 'go.mod')
    for (const [label, matcher] of [
      ['Gin', 'github.com/gin-gonic/gin'],
      ['Echo', 'github.com/labstack/echo'],
      ['Fiber', 'github.com/gofiber/fiber'],
      ['Chi', 'github.com/go-chi/chi'],
      ['GORM', 'gorm.io/gorm'],
      ['gRPC', 'google.golang.org/grpc'],
      ['Cobra', 'github.com/spf13/cobra'],
      ['Viper', 'github.com/spf13/viper'],
    ]) {
      if (goMod.includes(matcher)) add(stack, 'framework', label, 'go.mod')
    }
  }

  const cargo = await readTextRoot('cargo.toml')
  if (cargo) {
    for (const [label, matcher] of [
      ['Tokio', 'tokio'],
      ['Actix Web', 'actix-web'],
      ['Axum', 'axum'],
      ['Rocket', 'rocket'],
      ['Warp', 'warp'],
      ['Serde', 'serde'],
      ['Tauri', 'tauri'],
      ['Bevy', 'bevy'],
      ['Diesel', 'diesel'],
      ['SQLx', 'sqlx'],
    ]) {
      if (new RegExp(`(^|\\n)\\s*${matcher}\\s*=`, 'm').test(cargo)) add(stack, 'framework', label, 'Cargo.toml')
    }
  }

  const pom = await readTextRoot('pom.xml')
  if (pom) {
    add(stack, 'tooling', 'Maven', 'pom.xml')
    if (pom.includes('spring-boot')) add(stack, 'framework', 'Spring Boot', 'pom.xml')
    if (pom.includes('quarkus')) add(stack, 'framework', 'Quarkus', 'pom.xml')
    if (pom.includes('micronaut')) add(stack, 'framework', 'Micronaut', 'pom.xml')
  }

  const gradle = await readTextRoot('build.gradle') ?? await readTextRoot('build.gradle.kts')
  if (gradle) {
    add(stack, 'tooling', 'Gradle', 'build.gradle')
    if (gradle.includes('org.springframework.boot')) add(stack, 'framework', 'Spring Boot', 'build.gradle')
    if (gradle.includes('kotlin')) add(stack, 'language', 'Kotlin', 'build.gradle')
  }

  const composer = await readTextRoot('composer.json')
  if (composer) {
    add(stack, 'tooling', 'Composer', 'composer.json')
    const json = parseJson(composer)
    if (json) {
      const names = [...packagesOfDependencyMap(json.require), ...packagesOfDependencyMap(json['require-dev'])]
      for (const [label, matcher] of [
        ['Laravel', 'laravel/framework'],
        ['Symfony', 'symfony/framework-bundle'],
        ['WordPress', 'johnpbloch/wordpress-core'],
        ['PHPUnit', 'phpunit/phpunit'],
      ]) {
        if (names.some((name) => name === matcher)) add(stack, label === 'PHPUnit' ? 'testing' : 'framework', label, 'composer.json')
      }
    }
  }

  const gemfile = await readTextRoot('gemfile')
  if (gemfile) {
    add(stack, 'tooling', 'Bundler', 'Gemfile')
    if (/rails/i.test(gemfile)) add(stack, 'framework', 'Ruby on Rails', 'Gemfile')
    if (/\bsinatra\b/i.test(gemfile)) add(stack, 'framework', 'Sinatra', 'Gemfile')
  }

  if (rootNames.has('.github') || (scanFiles.dirs ?? []).some((dir) => dir.toLowerCase() === '.github')) {
    add(stack, 'deploy', 'GitHub Actions', '.github/')
  }

  const dirs = new Set((scanFiles.dirs ?? []).map((dir) => dir.toLowerCase()))
  for (const [cat, label, dirName] of [
    ['testing', '__tests__', '__tests__'],
    ['python', 'Python venv', 'venv'],
    ['deploy', 'Kubernetes', 'k8s'],
    ['deploy', 'Kubernetes', 'helm'],
    ['docs', 'Docs folder', 'docs'],
  ]) {
    if (dirs.has(dirName) && cat !== 'python') add(stack, cat, label, `${dirName}/`)
  }

  return stack.sort((a, b) => a.category.localeCompare(b.category) || a.label.localeCompare(b.label))
}
