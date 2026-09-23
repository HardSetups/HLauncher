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
- `lib/instances.cjs` — profile registry (`instances.json`), CRUD, `managedFiles` + `announcements` tracking, `lastPlayed` (set by `launch-game`), `iconUrl` (modpacks), `getContentDir`. Renderer writes go through `sanitizeInstancePatch` (whitelist: name, mcVersion, loader, ram, serverAddress — tested)
- `lib/loaders/` — `optifine.cjs` (BMCL API + manual official-jar fallback), `fabriclike.cjs` (Fabric+Quilt via meta profile JSON), `forge.cjs` (Forge/NeoForge installer jar → MCLC `forge` option; NeoForge needs MC 1.20.2+, experimental)
- `lib/modrinth.cjs` — legacy mod install used by server manifests + performance preset (sodium, lithium, ferrite-core, immediatelyfast, entityculling); pure `computeUpdates` (tested)
- `lib/content.cjs` — per-profile content for `mod` / `resourcepack` / `shader` (dirs `mods`, `resourcepacks`, `shaderpacks`). Disable = rename to `<file>.disabled` (Modrinth App convention). `listContent` hashes files (SHA-1, cached by path+size+mtime) and enriches with Modrinth title/icon/version; `listEntries` is the network-free variant. Modrinth search for all 4 types (+ `modpack`), install with required deps (mods only), `installModpack` (download .mrpack → `mrpack.importMrpack` → new profile with `iconUrl`), update check/apply (apply only accepts `https://cdn.modrinth.com/` URLs). IPC: `content:*` + `modpack:install`, all return `{ok, ...}`. Long operations take a `taskId`; their progress events (`mod-progress`) carry it so the renderer's download panel updates the right row
- `lib/mrpack.cjs` — .mrpack import → new instance (path-traversal-safe)
- `lib/servermanifest.cjs` — fetch/validate/apply `hlauncher.json` (schema in docs/SERVER-MANIFEST.md); syncs managed mods, persists announcements on the instance
- `lib/accounts.cjs` — Microsoft via msmc (refresh token encrypted at rest with Electron safeStorage/DPAPI, `enc:` prefix, plaintext fallback+migration) + offline; `getMclcAuth()` for launch, `getMinecraftToken()` for the skin API (refreshed Minecraft session cached in memory 30 min). **msmc must stay in `dependencies`** — devDependencies are not packaged, Microsoft login would break in the installer
- `lib/skins.cjs` — local skin library (`%APPDATA%\.hlauncher\skins`: PNG + index.json, dedup by SHA-1, PNG must be 64×64 or 64×32 — tested) + Minecraft Services API for Microsoft accounts: profile (active skin/capes returned as data URLs because textures.minecraft.net has no CORS), upload skin (multipart, variant classic/slim), reset, set/hide cape; import a player's skin by name via Mojang public API. IPC `skins:*`, all `{ok, ...}`
- `lib/news.cjs` — launcher news from repo-root `news.json` via GitHub raw (30min cache, stale fallback, sanitized)
- `lib/updater.cjs` — electron-updater state machine (`checking|downloading|ready|uptodate|error|dev`) streamed to renderer on `updater-status` (with version, percent, plain-text release notes); checks 8 s after start then every 3 h, `setEnabled` follows the `checkUpdates` setting live; `checkNow`/`installNow` (silent quitAndInstall + relaunch). Prerelease versions (`-alpha.N`) automatically follow Pre-release GitHub releases. Renderer: download-panel row while downloading, `UpdateModal` once per version when ready (restart blocked while a game runs), TopBar "update ready" pill
- `lib/errors.cjs` — error → friendly Turkish message; `lib/logger.cjs` — electron-log → `logs/hlauncher.log`
- `lib/discord.cjs` — Rich Presence (client ID constant; silently disabled if invalid/absent; gated by `settings.rpcEnabled`)

**Renderer (`src/`):** instance-centric, Modrinth-App-like. `App.jsx` owns state + a tiny router (`view = {page: home|instance|browse|servers|settings|account, id?, tab?, instanceId?, type?}`) and the launch state (`launchingId` / `runningId`, one game at a time); boots from `store:all` IPC (one-time migration from legacy `thc_*` localStorage keys exists). `i18n.jsx` = provider + full TR/EN dicts (`t('key', {params})`); backend progress arrives as `{key: 'be.*', params}`. Components: `Rail` (home/browse/servers, instance icons sorted by lastPlayed, +new, settings, account; fixed-position JS tooltip because the instance list scrolls), `TopBar` (breadcrumb + running status/stop + window buttons), `HomePage` (jump back in rows with Play, library grid, aside: account/servers/news/Discord), `InstancePage` (header with Play, tabs Mods/Resource packs/Shaders/Settings), `ContentList` (two-phase load: local list first, then Modrinth metadata; toggle/remove/update; `mutation` ref guards stale responses), `BrowsePage` (Modrinth search per type, target-profile picker, "installed" marks, modpack → new profile), `ServersPage` (live status, "play with which profile" menu), `SettingsPage` (label/desc left, control right rows), `CreateInstanceModal`, `InstanceSettings` (card sections: loader cards, version, RAM global/custom with slider+ticks+recommended marker+system-RAM warning, auto-connect server picker), `AccountPage` (3D stage with animations, account card, skin library with 2D previews, apply/reset skin, capes; offline accounts can use the library but not apply), `SkinViewer3D` (single WebGL instance; skin/variant/cape/animation update in place), `SkinPreview2D`, `DownloadBar` (floating bottom-right, rows per task + game launch), `VersionMenu` (loader + searchable versions; `hideLoaders`, `allowLatest` → null = always latest; measures the nearest `.page-scroll`/`.modal` to open up/down), `AccountPanel`, `Onboarding`, `Modal` (left-aligned dialog, Escape/backdrop close), `tasks.jsx` (`TaskProvider`/`useTasks().runTask(meta, taskId => ipc)` — app-wide tasks that survive navigation; use it for any install/import, never local component state), `ui.jsx` (`InstanceIcon` = Modrinth icon or deterministic symmetric 5×5 pixel identicon from the profile id, `Switch`, `Menu`, `EmptyState`), `icons.jsx`. Preload `on*` subscriptions RETURN an unsubscribe function — always return it from the effect.

**Design identity (do not regress to "AI generic"):** restraint first — neutral graphite (`--bg` frame, `--surface` content area with rounded top-left, `--raised*` cards), ONE accent (user-chosen) used only for primary actions / selected state; no glows, no gradients, no uppercase letter-spaced labels, sentence-case copy. Signature: "bevel" corner — `corner-shape: var(--shape)` (round bevel round bevel) on buttons/inputs/cards/icons (Chromium 139+, Electron 39 OK; plain rounded fallback); pixel identicons for profiles; custom nav icon set in `icons.jsx` (square caps, one filled "pixel" per icon via `--px`, accent when active); lucide for utility icons (CSS forces square caps on `svg.lucide`). Chakra Petch only for h1 page titles / profile names; UI text is Segoe UI Variable. Play button: solid accent with a thin hard bottom inset shadow. Use CSS tokens in `index.css`, not hex. NO emoji as icons; `prefers-reduced-motion` respected.

**Launch model:** there is no global Play — you pick a profile (home rows/cards, profile page, or a server's "play with" menu). Launching sends `{instanceId, serverIp}` (serverIp = explicit server or the profile's `serverAddress`); main marks `lastPlayed` + `activeInstanceId` — everything else (account, RAM, Java, JVM args) is resolved in the main process from the store. Null `mcVersion` means "latest release" and is resolved main-side everywhere (a silent-failure bug in alpha.1 taught this).

**Packaged-app gotchas (do not remove):** `runAsNode: false` fuse + ELECTRON_RUN_AS_NODE relaunch guard; `no-sandbox` when packaged (STATUS_BREAKPOINT crash-loops on some machines); opaque window; `vite.config.js` ignores `release/` in watch; CSP injected only at build (dev needs HMR inline scripts).

## Testing / QC (gate before every push)

- `npm run lint && npm test` always; `npm run build` after renderer changes; `npm run test:integration` before releases
- i18n key consistency: every `t('...')` key and every backend `key: 'be.*'` must exist in BOTH dicts in `src/i18n.jsx` (unit test enforces the `be.*` side)
- IPC error contract: handlers return `{ok:false, error}` (never throw across IPC for user-triggerable paths); renderer handlers must catch — no silent failures

## Release (summary — full procedure in docs/GELISTIRME.md)

Bump version (`npm version x.y.z-alpha.N --no-git-tag-version`) + CHANGELOG entry → push main, CI green → push tag `vX.Y.Z-alpha.N` → CI builds draft release with installer + latest.yml → publish the draft on GitHub (Releases → Edit → Publish, mark **Pre-release**) → installed launchers auto-update. News to players: edit root `news.json` and push.
