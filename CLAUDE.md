# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Direction

The launcher is being evolved into **HLauncher** — a player-friendly, server-friendly Minecraft launcher (easy mod install, performance presets, server-published mod manifests). See `ROADMAP.md` for the full plan and current phase. Current branding in code is still "HardSetups Launcher".

## Commands

```bash
npm run dev          # Start Vite dev server + Electron (concurrently)
npm run build        # Build frontend with Vite
npm run dist         # Build frontend + package Windows .exe installer
npm run dist:dir     # Build + package into directory (no installer, faster)
npm run lint         # ESLint
```

## Critical Environment Note

`ELECTRON_RUN_AS_NODE=1` is set as a system environment variable on the dev machine. This disables Electron's built-in modules (app, BrowserWindow, etc.), making `require('electron')` return a path string instead of the API. The workaround is `launch-electron.js` — the dev script runs `node launch-electron.js` instead of `electron .` directly. Never remove this wrapper.

## Architecture

**Dual-module project:** The frontend (`src/`) is ESM/React, the Electron process (`electron/`) is CommonJS (`.cjs`). Root `package.json` has NO `"type": "module"` field — this is intentional, required for Electron main process compatibility.

**IPC Bridge:**
- `electron/preload.cjs` — exposes `window.electronAPI` to renderer via `contextBridge`
- `electron/main.cjs` — window creation + IPC handlers: `launch-game`, `stop-game`, `close-app`, `minimize-app`, `hide-launcher`/`show-launcher` (launcher hides while game runs), `select-java-path` (file dialog), `get-version-manifest`
- `electron/launcher.cjs` — all launch logic: wraps `minecraft-launcher-core` (MCLC), auto-installs OptiFine/Fabric, detects/downloads Java, manages game process lifecycle

**Launch flow (`launcher.cjs launchGame`):** loaderType is `release` | `optifine` | `fabric`. For optifine/fabric, an installed version is looked up under `<root>/versions/`; if missing it is installed automatically, and the resulting version id is passed to MCLC as `version.custom` (MCLC resolves `inheritsFrom` itself — there is no manual version-JSON merging in this codebase anymore):
- **OptiFine:** best stable build queried + jar downloaded from BMCL API (`bmclapi2.bangbang93.com/optifine/<mcVer>`), launchwrapper jar extracted from the OptiFine jar (new versions: `launchwrapper-of-X.Y`, old: `launchwrapper-1.12`), then a minimal `version.json` with `inheritsFrom` + `--tweakClass optifine.OptiFineTweaker` is written.
- **Fabric:** best stable loader + ready-made MCLC-compatible version profile fetched from Fabric Meta (`meta.fabricmc.net/v2`).
- If a server address was entered, MCLC `quickPlay` auto-joins that server on game start.

**Version manifest:** `getRecentReleaseVersions()` fetches Mojang's `version_manifest_v2.json`, filters to releases from the last 3 years, caches 12h at `<root>/version_manifest_cache.json`.

**Java detection (`getJavaPath`):** required version by MC version (`getRequiredJava`): year-based versions (25.x+) and 1.20.5+/1.21+ → Java 21, 1.17–1.20.4 → 17, older → 8. Search order: launcher-bundled runtime (`<root>/runtime/javaXX`) → Mojang launcher runtimes → scan of common vendor install dirs (Adoptium, Oracle, Zulu, Microsoft, BellSoft, Corretto) → system `java` if its version suffices. If nothing found, a Java 21 JRE is downloaded from Adoptium and unpacked to `<root>/runtime/java21` (KNOWN GAP: always 21, wrong for MC ≤1.16 needing Java 8). ZIP extraction currently shells out to PowerShell `Expand-Archive`.

**Auth:** offline only (`Authenticator.getAuth(username)`); no Microsoft login yet (`msmc` is in devDependencies, unused).

**Frontend (`src/`):** React 19 + framer-motion + lucide-react, inline styles throughout, all UI text Turkish.
- `App.jsx` — state owner (tabs, user, servers, statuses, loader/version selection, RAM/fullscreen/javaPath, theme accent+background); registers IPC listeners once; persists everything to `localStorage` (`thc_*` keys)
- `components/` — `TitleBar` (frameless-window controls), `Sidebar` (nav + Discord + copy address), `ServerListPanel` (compact & grid variants, add/remove/select servers), `VersionPicker` (loader segmented control + searchable version dropdown), `Modal` (error dialog)
- Live server status: polls `api.mcstatus.io/v2/status/java/<address>` every 30s per added server (staggered 300ms), shows online state/players/MOTD/icon.

**Build output:** `release/` (git-ignored) — electron-builder produces an NSIS Windows x64 installer. App data stored at `%APPDATA%\.hardsetups` (auto-migrated from legacy `.thehardcraft` on first run). `public/` is copied as `extraResources`; images referenced by bare paths (`logo.png`, `bg*.jpg`).

**Packaged-app gotchas (do not remove):** `runAsNode: false` fuse in package.json `electronFuses` + the ELECTRON_RUN_AS_NODE relaunch guard at the top of `main.cjs` (the dev machine leaks that env var); `no-sandbox` switch when `app.isPackaged` in `main.cjs` — on some machines ALL sandboxed Chromium child processes (GPU, network service, renderer) crash-loop with STATUS_BREAKPOINT when launched from the installed location, leaving either no window or an invisible one; the main window must stay opaque (`backgroundColor`, no `transparent: true`) or a non-painting renderer produces a fully invisible window; `vite.config.js` `server.watch.ignored` excludes `release/` so `npm run dist` doesn't crash a running dev server.

## Key Files

| File | Purpose |
|------|---------|
| `electron/main.cjs` | Electron main process entry point (window + IPC) |
| `electron/launcher.cjs` | Launch logic, OptiFine/Fabric/Java auto-install |
| `electron/preload.cjs` | Context bridge (IPC ↔ renderer) |
| `src/App.jsx` | Root React component, all app state |
| `src/components/` | TitleBar, Sidebar, ServerListPanel, VersionPicker, Modal |
| `launch-electron.js` | Wrapper that unsets `ELECTRON_RUN_AS_NODE` before spawning Electron |
| `ROADMAP.md` | HLauncher plan and phase status |
