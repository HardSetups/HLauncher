# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**HLauncher** (1.0.0-alpha.x, released on GitHub) — player-friendly, server-friendly Minecraft launcher. Electron + React/Vite, launch core on `minecraft-launcher-core` (MCLC). UI is Turkish-first with full TR/EN i18n. Repo: `HardSetups/HLauncher` (public). See `ROADMAP.md` for status, `CHANGELOG.md` for history, `docs/GELISTIRME.md` for the 2-developer workflow (branching, QC gate, release procedure — FOLLOW IT).

## Commands

```bash
npm run dev              # Vite + Electron (wait-on gates Electron until Vite is up)
npm run build            # Build frontend with Vite (injects CSP in prod via plugin)
npm test                 # 49+ unit tests (tests/unit.test.cjs, plain node+assert)
npm run test:integration # REAL network: loader installs, server manifest e2e — run before releases
npm run lint             # ESLint (browser rules src/, node rules electron/ + tests/)
npm run dist             # Build + NSIS Windows x64 installer → release/
npm run dist:dir         # Build + unpacked dir (faster, for QA)
```

## Machine Notes

- `ELECTRON_RUN_AS_NODE=1` may be set system-wide on some dev machines (it is on the original one). It makes `require('electron')` return a path string. Dev therefore runs `node launch-electron.js` (unsets it) instead of `electron .`, and `main.cjs` has a relaunch guard at the top. Harmless on machines without the variable — never remove either.
- Prefer cloning OUTSIDE OneDrive/Drive-synced folders (file locks break builds).

## Architecture

**Dual-module:** `src/` is ESM/React, `electron/` is CommonJS (`.cjs`). Root `package.json` has NO `"type": "module"` — intentional.

**Main process (`electron/`):**
- `main.cjs` — relaunch guard, single-instance lock, `no-sandbox` when packaged, window (opaque `backgroundColor`, min 980×640, bounds/maximized persisted in store as `windowBounds`), security handlers (`setWindowOpenHandler` deny + `will-navigate` guard → https opens in system browser), all IPC handlers. Renderer data goes through `sanitizeSettingsPatch`/`sanitizeServers` (store.cjs) before writing.
- `launcher.cjs` — launch orchestration: resolve instance → install loader → ensure Java → account auth → MCLC. JVM presets (`balanced|lowram|zgc|custom`), QuickPlay for 1.20+, `--server/--port` for older. Crash detection: non-zero exit + not user-stopped → `game-crashed` event.
- `lib/paths.cjs` — data root `%APPDATA%\.hlauncher` (auto-migrates `.hardsetups`/`.thehardcraft`); instance dirs (`default` plays in root for backwards compat, others in `instances/<id>`)
- `lib/store.cjs` — atomic JSON settings store (`config.json`): settings/account/servers/activeInstanceId/windowBounds; exports the IPC sanitizers (pure, tested)
- `lib/http.cjs`, `lib/download.cjs` — all network I/O: redirects (https→http downgrade BLOCKED), timeouts, SHA1/SHA256 verify, 3 retries, contact User-Agent (Modrinth requires it)
- `lib/zip.cjs` — adm-zip with OWN zip-slip guard (adm-zip's read side does NOT sanitize `../` — proven by test)
- `lib/java.cjs` — required Java by MC version (≤1.16→8, 1.17-1.20.4→17, else 21); find (bundled→Mojang→vendors→system) or download from Adoptium with SHA-256
- `lib/instances.cjs` — profile registry (`instances.json`), CRUD, `managedFiles` + `announcements` tracking
- `lib/loaders/` — `optifine.cjs` (BMCL API + manual official-jar fallback), `fabriclike.cjs` (Fabric+Quilt via meta profile JSON), `forge.cjs` (Forge/NeoForge installer jar → MCLC `forge` option; NeoForge needs MC 1.20.2+, experimental)
- `lib/modrinth.cjs` — search/version-pick/install with required deps; performance preset (sodium, lithium, ferrite-core, immediatelyfast, entityculling); hash-based update check (`checkUpdates`/`applyUpdate` via version_files APIs)
- `lib/mrpack.cjs` — .mrpack import → new instance (path-traversal-safe)
- `lib/servermanifest.cjs` — fetch/validate/apply `hlauncher.json` (schema in docs/SERVER-MANIFEST.md); syncs managed mods, persists announcements on the instance
- `lib/accounts.cjs` — Microsoft via msmc (refresh token encrypted at rest with Electron safeStorage/DPAPI, `enc:` prefix, plaintext fallback+migration) + offline; `getMclcAuth()` for launch
- `lib/news.cjs` — launcher news from repo-root `news.json` via GitHub raw (30min cache, stale fallback, sanitized)
- `lib/updater.cjs` — electron-updater state machine (`checking|downloading|ready|uptodate|error|dev`) streamed to renderer on `updater-status`; `checkNow`/`installNow`
- `lib/errors.cjs` — error → friendly Turkish message; `lib/logger.cjs` — electron-log → `logs/hlauncher.log`
- `lib/discord.cjs` — Rich Presence (client ID constant; silently disabled if invalid/absent; gated by `settings.rpcEnabled`)

**Renderer (`src/`):** `App.jsx` owns state, boots from `store:all` IPC (no localStorage persistence — one-time migration from legacy `thc_*` keys exists). Debounced write-through to settings. Tabs: dashboard, servers, mods, profiles, settings, account + onboarding wizard (language → accent → account → RAM). `i18n.jsx` = provider + full TR/EN dicts (`t('key', {params})`); backend progress arrives as `{key: 'be.*', params}` and is translated at render time. Components: TitleBar (min/max/close, maximize state via `window-maximized`), Sidebar, ServerListPanel (favorites, version badge, manifest apply), VersionPicker (6 loaders), ProfilesPanel (open-folder), ModsPanel (search/install/updates), SettingsPanel (updater card, screenshots, clear-cache), AccountPanel, Onboarding, NewsPanel, SkinViewer3D (skinview3d, WebGL+2D fallback), Modal.

**Design identity (do not regress to "AI generic"):** Chakra Petch display font (bundled via @fontsource) for headings/buttons/nav; sharp corner scale (panel 12px / control 8px) via CSS vars in `index.css`; solid dark bordered surfaces instead of blurry glass; play button with hard bottom inset shadow (block feel); NO emoji as icons — lucide only; accent edge line on selected cards; `prefers-reduced-motion` respected.

**Dashboard model:** the version/loader pickers edit the ACTIVE instance (profile); launching sends `{instanceId, serverIp}` — everything else (account, RAM, Java, JVM args) is resolved in the main process from the store. Null `mcVersion` means "latest release" and is resolved main-side everywhere (a silent-failure bug in alpha.1 taught this).

**Packaged-app gotchas (do not remove):** `runAsNode: false` fuse + ELECTRON_RUN_AS_NODE relaunch guard; `no-sandbox` when packaged (STATUS_BREAKPOINT crash-loops on some machines); opaque window; `vite.config.js` ignores `release/` in watch; CSP injected only at build (dev needs HMR inline scripts).

## Testing / QC (gate before every push)

- `npm run lint && npm test` always; `npm run build` after renderer changes; `npm run test:integration` before releases
- i18n key consistency: every `t('...')` key and every backend `key: 'be.*'` must exist in BOTH dicts in `src/i18n.jsx` (unit test enforces the `be.*` side)
- IPC error contract: handlers return `{ok:false, error}` (never throw across IPC for user-triggerable paths); renderer handlers must catch — no silent failures

## Release (summary — full procedure in docs/GELISTIRME.md)

Bump version (`npm version x.y.z-alpha.N --no-git-tag-version`) + CHANGELOG entry → push main, CI green → push tag `vX.Y.Z-alpha.N` → CI builds draft release with installer + latest.yml → publish the draft on GitHub (Releases → Edit → Publish, mark **Pre-release**) → installed launchers auto-update. News to players: edit root `news.json` and push.
