# Project Contract

Browser extension (MV3) for selection / text translation. This is a fork of [translate-tools/linguist](https://github.com/translate-tools/linguist): LLM is the only built-in translator; full-page translation and other built-in commercial backends were removed. Package manager is **npm** (workspaces under `packages/*`). Node `>=20`.

## Build And Test

- Install: `npm install` (or `make prepare`)
- Dev (watch, Chromium): `npm run build:dev` or `make dev` / `make devChromium`
- Dev (Chrome store target): `make devChrome`
- Production Chromium: `make buildChromium`  
  (`NODE_ENV=production EXT_TARGET=chromium npx webpack-cli -c ./webpack.config.js`)
- Production Chrome: `make buildChrome`
- Full release path (Docker): `make build` → packages under `build/` (chromium zip)
- Load unpacked: Chromium/Chrome → `chrome://extensions` → Developer mode → load `build/chromium` (prod) or `build/dev/chromium` (dev watch)
- Test: `npm test` (vitest). Integration tests: `npm run test:all` (`TEST_TARGETS=all`)
- Lint: `npm run lint` (prettier check + eslint max-warnings 0 + stylelint)
- Fix style: `npm run prettify`
- Theme tokens: `npm run build:tokens` after editing theme tokens
- Typecheck: no dedicated script; use `npx tsc --noEmit` if needed (strict `tsconfig.json`)

Webpack targets (`EXT_TARGET`): `chromium` (default release), `chrome`, `firefox`, `firefox-standalone`. Output: `build/{target}` or `build/dev/{target}` in development.

## Architecture Boundaries

- **App core** lives in `src/app/`
  - `Background/` — service worker / background: `TranslatorManager`, TTS, translators cache, request handlers
  - `ContentScript/` — page inject: selection translator (`SelectTranslator`), page context
  - `ConfigStorage/` — `appConfig` persistence + versioned migrations (`ConfigStorage.migrations.ts`)
  - `ContextMenus/`, `migrations/`
- **UI pages** live in `src/pages/` (`popup`, `options`, `dictionary`, `history`)
- **Shared UI** lives in `src/components/` (primitives, layouts, controls)
- **Cross-context RPC** lives in `src/requests/`
  - `backend/` — background endpoints (`translate`, config, history, translators, TTS, …)
  - `contentscript/`, `offscreen/`, `global/`
  - Build typed handlers with `buildBackendRequest` / `buildTabRequest` under `src/requests/utils/requestBuilder/`
- **Config schema + defaults**
  - Schema: `src/types/runtime.ts` (`AppConfig` io-ts codec → `AppConfigType`)
  - Defaults: `src/config/index.ts` (`defaultConfig`)
  - Any config field change must update schema, defaults, options UI (`src/pages/options/.../generateTree.tsx`), and usually a **new config migration**
- **Translators / TTS**
  - Built-in LLM is the only translator: `src/lib/translators/llm/LLMTranslator.ts` (OpenAI-compatible chat completions)
  - Settings no longer expose translator module selection or custom translation modules; keep LLM-only UX
  - Custom TTS modules still load via offscreen docs; legacy custom-translator backend code may remain for upgrades but must not reappear in settings
  - Do not reintroduce removed built-in backends (Google/Bing/Yandex/Bergamot), custom translator settings, or full-page translation without an explicit product decision
- **i18n**: message catalogs in `src/_locales/*/messages.json`. Source of truth for tooling is English + `packages/locales/` (`npm run sync` / `proofread` from that package). Prefer `getMessage(...)` over hard-coded UI strings.
- **Themes**: `src/themes/` + Themekit (`themekit.config.json`). CSS often co-located with components; BEM via `@bem-react/classname`.
- **Entry points**: `src/background-script.ts`, `src/contentscript.tsx`, page entries under `src/pages/*/`, offscreen under `src/offscreen-documents/`.
- **Manifests**: base `manifests/manifest.json` merged with target-specific files (`chromium.json`, `chrome.json`, …) in webpack.

## Coding Conventions

- TypeScript + React 17; state often via **effector** stores; validation with **io-ts** (`src/lib/types`)
- Match existing naming, comment density, and file layout; co-locate CSS with components
- Prefer pure helpers for data transforms; put browser/storage/network I/O behind request handlers or dedicated managers
- Config and any user-persisted data need migrations when shape changes (`src/app/ConfigStorage/ConfigStorage.migrations.ts` and related storage migrations). Bump migration version and update `latestVersion` in config tests/snapshots
- Selection popup runs in a **shadow DOM** (`ShadowDOMContainerManager`); be careful with outside-click, focus, and LayerManager races when changing popup open/close behavior
- Commits: Conventional Commits (`@commitlint/config-conventional`); husky runs commitlint + lint-staged
- Do not invent new global mutable state; reuse config storage, effector stores, and existing request factories

## Safety Rails

## NEVER

- Modify `.env`, lockfiles (`package-lock.json`), or CI secrets without explicit approval
- Bump or rewrite config migrations in a way that breaks upgrade from older stored `appConfig` versions
- Remove settings, feature flags, or locale keys without searching all call sites and cleaning migrations/UI
- Re-add full-page translation or discarded built-in commercial translators without explicit request
- Commit without running relevant tests / lint for the touched area
- Run destructive git commands (`reset --hard`, force-push, etc.) unless explicitly asked

## ALWAYS

- Keep `AppConfig` schema, `defaultConfig`, options tree, and migrations in sync when changing settings
- Add or update tests when touching storage, migrations, translators, or pure data transforms (see `docs/dev/Development.md`)
- Update snapshots intentionally (`vitest -u`) when migration output or locale tooling output changes
- Show the diff (or summarize changed files) before committing when asked to commit
- Prefer Chromium as the default load-unpacked target for manual verification in this fork
- After every major change (features, selection popup, options/config, background/content-script behavior), rebuild Chromium with `make buildChromium` (output: `build/chromium`) so the unpacked extension can be reloaded without waiting to be asked
- After every major change (and before any commit/push that touches source), run `npm run lint` (prettier check + eslint max-warnings 0 + stylelint) and fix failures with `npm run prettify` if needed — do not wait to be asked; CI's Test workflow fails on lint

## Verification

- Config / storage / migration changes:  
  `npx vitest run src/app/ConfigStorage/__test__/ConfigStorage.test.ts`  
  (update snapshots if migration latest version output changes)
- Translator / pure logic: targeted vitest files under the same feature directory
- Broader suite: `npm test` or `npm run test:all`
- Lint (required after major changes / before push): `npm run lint`  
  Fix: `npm run prettify`
- UI / selection popup: production or dev Chromium build → load unpacked → exercise selection translate, options, popup
- Locale key add/remove: update `src/_locales/en/messages.json` (and typically all locales or run `packages/locales` sync); keep `packages/locales/sample.json` aligned when it is used as sample source
- Release: tag workflow builds via `make build` and publishes `build/chromium.zip`

## Compact Instructions

Preserve:

1. Architecture decisions (NEVER summarize)
2. Modified files and key changes
3. Current verification status (pass/fail commands)
4. Open risks, TODOs, rollback notes

## Quick Map

| Concern | Where |
| --- | --- |
| Default config | `src/config/index.ts` |
| Config type/codec | `src/types/runtime.ts` |
| Config migrations | `src/app/ConfigStorage/ConfigStorage.migrations.ts` |
| Settings UI tree | `src/pages/options/layout/OptionsPage.utils/generateTree.tsx` |
| Selection translate | `src/app/ContentScript/SelectTranslator/` |
| Background translate path | `src/app/Background/TranslatorManager/`, `src/requests/backend/translate.ts` |
| LLM translator | `src/lib/translators/llm/LLMTranslator.ts` |
| Locales | `src/_locales/`, tooling `packages/locales/` |
| Build targets | `webpack.config.js`, `makefile`, `manifests/` |
| Dev notes | `docs/dev/Development.md` |
