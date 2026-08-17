# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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

**Dual-module project:** The frontend (`src/`) is ESM/React, the Electron process (`electron/`) is CommonJS. Root `package.json` has NO `"type": "module"` field — this is intentional, required for Electron main process compatibility.

**IPC Bridge:**
- `electron/preload.cjs` — exposes `window.electronAPI` to renderer via `contextBridge`
- `electron/main.cjs` — IPC handlers: `launch-game`, `stop-game`, `close-app`, `minimize-app`; delegates game launch to `launcher.cjs`
- `electron/launcher.cjs` — wraps `minecraft-launcher-core`; handles OptiFine version merging (`inheritsFrom`), Java path detection, and game process lifecycle

**Frontend (`src/App.jsx`):**
- Single-file React app (~700 lines) with inline styles throughout
- State: `activeTab`, `user`, `launching`/`progress`, `selectedGame`, `ramMax`, `javaPath`
- Three game modes: Kingdoms (1.20.4), Skyblock (1.21.4), Towny (1.21.4) — all OptiFine
- Polls `api.mcstatus.io` every 30s for online player count
- `window.electronAPI.launchGame(options)` → IPC → `launcher.cjs`

**Java detection (`launcher.cjs` `getJavaPath`):** Tries paths in order — launcher runtime → Mojang launcher runtime → Adoptium → Oracle → Zulu → Microsoft → falls back to system `java`. Java version selected by MC version (`getRequiredJava`): year-based versions (25.x, 26.x) and 1.20.5+/1.21+ → Java 21, 1.17–1.20.4 → Java 17, older → Java 8.

**Build output:** `release/` — electron-builder produces an NSIS Windows x64 installer. App data stored at `%APPDATA%\.hardsetups` (auto-migrated from legacy `.thehardcraft` on first run). Background images (`/bg_kingdoms.jpg`, etc.) and `/logo.png` come from `public/`.

**Packaged-app gotchas (do not remove):** `runAsNode: false` fuse in package.json `electronFuses` + the ELECTRON_RUN_AS_NODE relaunch guard at the top of `main.cjs` (the dev machine leaks that env var); `no-sandbox` switch when `app.isPackaged` in `main.cjs` — on some machines ALL sandboxed Chromium child processes (GPU, network service, renderer) crash-loop with STATUS_BREAKPOINT when launched from the installed location, leaving either no window or an invisible one; the main window must stay opaque (`backgroundColor`, no `transparent: true`) or a non-painting renderer produces a fully invisible window; `vite.config.js` `server.watch.ignored` excludes `release/` so `npm run dist` doesn't crash a running dev server.

## Key Files

| File | Purpose |
|------|---------|
| `electron/main.cjs` | Electron main process entry point |
| `electron/launcher.cjs` | Minecraft launch logic |
| `electron/preload.cjs` | Context bridge (IPC ↔ renderer) |
| `src/App.jsx` | Entire React UI (single file) |
| `launch-electron.js` | Wrapper that unsets `ELECTRON_RUN_AS_NODE` before spawning Electron |

## OptiFine Version Handling

OptiFine versions use `inheritsFrom` in their `version.json`. `getVersionInfo()` in `launcher.cjs` recursively merges the OptiFine version with its parent Minecraft version — libraries concatenated (OptiFine first), arguments merged, `assetIndex`/`assets` taken from parent. The `version.custom` field is set only for OptiFine, `version.number` is always the base MC version (e.g. `1.20.4`).
