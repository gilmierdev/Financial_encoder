# Financial Encoder

A **local / offline** financial encoding and analysis desktop application for Windows.

- **Stack:** Electron · React · TypeScript · Vite · SCSS · SQLite (better-sqlite3) · electron-builder
- **Security:** `contextIsolation: true`, `nodeIntegration: false`, sandboxed renderer, secure preload bridge, IPC-only access
- **Data:** Each installed computer keeps its **own SQLite database** in its user-data folder
  (`C:\Users\<USER>\AppData\Roaming\FinancialEncoder\`). No cloud, no accounts, fully offline.
- **Release:** the user-facing installer is `Financial-Encoder-Setup-<version>.exe` in `release/`.
- **Updates:** automatic updates via GitHub Releases (HTTPS, sha512-verified). See `UPDATE_SYSTEM.md`.

## Project structure

```
financial-encoder/
├── electron/            # Main process + preload (CommonJS, compiled by tsc)
│   ├── main.ts          # BrowserWindow, secure settings, IPC handler registration
│   ├── preload.ts       # contextBridge API exposed to React
│   ├── database/        # SQLite connection, migrations, seed, backup, reset
│   ├── ipc/             # Validated IPC handler registrations
│   └── types/ipc.ts     # Shared IPC contract types
├── src/                 # React renderer (bundled by Vite)
│   ├── App.tsx          # Hash-routed pages
│   ├── services/api.ts  # Typed wrapper over the preload bridge
│   └── styles/main.scss
├── index.html
├── package.json
├── tsconfig.json            # Renderer
├── tsconfig.electron.json   # Main process / preload
├── vite.config.mts
├── vitest.config.mjs
├── electron-builder.config.js
├── release/            # NSIS installer output (git-ignored)
└── docs               RELEASE_NOTES.md · USER_GUIDE.md · SIGNING.md
```

## Commands

| Command | Description |
| --- | --- |
| `npm run dev` | Run Electron with the Vite dev server (HMR) |
| `npm run build` | Build renderer + main/preload (no dev server) |
| `npm run dist` | Clean build + package the Windows installer (`release/`) |
| `npm run dist:dir` | Build + create `release/win-unpacked` only (no installer) |
| `npm run typecheck` | Type-check both TypeScript projects |
| `npm run lint` | Type-check (uses the same strict configs) |
| `npm test` | Run the unit test suite (Vitest) |

## Create a release

```powershell
npm run build
npm run dist
```

Output (installer + intermediate artifacts):

```
release/
├── Financial-Encoder-Setup-1.0.0.exe     <- the file to give to users
├── Financial-Encoder-Setup-1.0.0.exe.blockmap
├── latest.yml                             <- update manifest (sha512, used by electron-updater)
└── win-unpacked/                         <- portable, unpacked build
```

Override the output folder with `FE_RELEASE_DIR=<path> npm run dist`.

The release build makes an NSIS installer for **Windows x64**. It bundles the
Electron runtime, the React app, all import/export/OCR libraries and native
modules (better-sqlite3); users do **not** need Node.js, npm, VS Code, Git or
MongoDB.

## Automatic updates

Installed builds check GitHub Releases shortly after launch and show an update banner
(version, release notes, download progress, restart prompt). Downloads are verified against
`latest.yml` sha512 hashes, a database safety backup is created before applying, and the
updater never runs in development. Publishing and testing are documented in
`UPDATE_SYSTEM.md`.

## Development

The dev workflow runs three processes together:

1. **Vite** serves the React app on `http://localhost:5173` (HMR).
2. **tsc (watch)** compiles `electron/` into `dist-electron/`.
3. **Electron** loads the Vite dev server URL.

In production (installed app), Electron loads `dist-renderer/index.html` from
disk — no development environment is required on the user's machine.

## Code signing

Signing is configured but no certificate is committed to the repository. See
`SIGNING.md` for how to attach a legitimate certificate via `CSC_LINK` /
`CSC_KEY_PASSWORD` (or Azure Trusted Signing) in CI. Do not bypass Smart
App Control, SmartScreen, Defender or UAC — sign legitimately instead.

## Release notes & user guide

See `RELEASE_NOTES.md` (what changed), `USER_GUIDE.md` (beginner guide), and `UPDATE_SYSTEM.md`
(how automatic updates are published and tested).