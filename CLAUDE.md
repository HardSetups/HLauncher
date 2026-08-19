# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**HLauncher** (1.0.0-alpha.x) — player-friendly, server-friendly Minecraft launcher. Electron + React/Vite, launch core on `minecraft-launcher-core` (MCLC). UI language is Turkish-first with full TR/EN i18n. See `ROADMAP.md` for status and pre-release checklist, `CHANGELOG.md` for history.

## Commands

```bash
npm run dev          # Vite + Electron (wait-on gates Electron until Vite is up)
npm run build        # Build frontend with Vite
npm test             # Unit tests (tests/unit.test.cjs, plain node+assert)
npm run lint         # ESLint (browser rules for src/, node rules for electron/)
npm run dist         # Build + NSIS Windows x64 installer → release/
npm run dist:dir     # Build + unpacked dir (faster, for QA)
```

## Critical Environment Note

`ELECTRON_RUN_AS_NODE=1` is set as a system environment variable on the dev machine. This disables Electron's built-in modules, making `require('electron')` return a path string. The workaround is `launch-electron.js` — dev runs `node launch-electron.js` instead of `electron .`. Never remove this wrapper, nor the relaunch guard at the top of `main.cjs`.

## Architecture

**Dual-module:** `src/` is ESM/React, `electron/` is CommonJS (`.cjs`). Root `package.json` has NO `"type": "module"` — intentional.

**Main process (`electron/`):**
- `main.cjs` — relaunch guard, single-instance lock, `no-sandbox` when packaged, window (opaque `backgroundColor` — never `transparent: true`), all IPC handlers
- `launcher.cjs` — launch orchestration: resolve instance → install loader → ensure Java → account auth → MCLC. JVM presets (`balanced|lowram|zgc|custom`), QuickPlay for 1.20+, `--server/--port` for older
- `lib/paths.cjs` — data root `%APPDATA%\.hlauncher` (auto-migrates `.hardsetups`/`.thehardcraft`); instance dirs (`default` plays in root for backwards compat, others in `instances/<id>`)
- `lib/store.cjs` — atomic JSON settings store (`config.json`): settings/account/servers/activeInstanceId
- `lib/http.cjs`, `lib/download.cjs` — all network I/O: redirects, timeouts, SHA1/SHA256 verify, 3 retries
- `lib/zip.cjs` — adm-zip (no PowerShell)
- `lib/java.cjs` — required Java by MC version (≤1.16→8, 1.17-1.20.4→17, else 21); find (bundled→Mojang→vendors→system) or download from Adoptium with SHA-256
- `lib/instances.cjs` — profile registry (`instances.json`), CRUD, `managedFiles` tracking
- `lib/loaders/` — `optifine.cjs` (BMCL API + manual official-jar fallback), `fabriclike.cjs` (Fabric+Quilt via meta profile JSON), `forge.cjs` (Forge/NeoForge installer jar → MCLC `forge` option; NeoForge needs MC 1.20.2+)
- `lib/modrinth.cjs` — search/version-pick/install with required deps; performance preset (sodium, lithium, ferrite-core, immediatelyfast, entityculling)
- `lib/mrpack.cjs` — .mrpack import → new instance (path-traversal-safe)
- `lib/servermanifest.cjs` — fetch/validate/apply `hlauncher.json` (schema in docs/SERVER-MANIFEST.md); syncs managed mods on re-apply
- `lib/accounts.cjs` — Microsoft via msmc (`Auth('select_account').launch('electron')`, refresh token persisted) + offline; `getMclcAuth()` for launch
- `lib/errors.cjs` — error → friendly Turkish message; `lib/logger.cjs` — electron-log → `logs/hlauncher.log`
- `lib/updater.cjs` — electron-updater (needs real GitHub owner in `build.publish`); `lib/discord.cjs` — RPC, disabled until `DISCORD_CLIENT_ID` is set

**Renderer (`src/`):** `App.jsx` owns state, boots from `store:all` IPC (no localStorage persistence anymore — one-time migration from legacy `thc_*` keys exists). Debounced write-through to settings. Tabs: dashboard, servers, mods, profiles, settings, account + onboarding wizard. `i18n.jsx` = provider + full TR/EN dicts (`t('key', {params})`). Components: TitleBar, Sidebar, ServerListPanel (favorites, version badge, manifest apply), VersionPicker (6 loaders), ProfilesPanel, ModsPanel, SettingsPanel, AccountPanel, Onboarding, Modal.

**Dashboard model:** the version/loader pickers edit the ACTIVE instance (profile); launching sends `{instanceId, serverIp}` — everything else (account, RAM, Java, JVM args) is resolved in the main process from the store.

**Packaged-app gotchas (do not remove):** `runAsNode: false` fuse + ELECTRON_RUN_AS_NODE relaunch guard; `no-sandbox` when packaged (STATUS_BREAKPOINT crash-loops on some machines); opaque window; `vite.config.js` ignores `release/` in watch.

## Testing / QC

- `npm test` — pure-function tests with APPDATA redirected to a temp dir (never touches real user data)
- `npm run test:integration` — REAL network calls: installs Fabric/Quilt/OptiFine, downloads Forge installer, applies the repo's example server manifest end-to-end (mods included). Run before releases; not in CI (depends on external services)
- i18n key consistency: every `t('...')` key must exist in both dicts in `src/i18n.jsx`
- After renderer changes run `npm run lint && npm run build`; after electron changes also `npm test`
