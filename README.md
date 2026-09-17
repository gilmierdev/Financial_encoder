# Financial Encoder

A **local / offline** financial encoding and analysis desktop application for Windows, developed by **Gilmier Ej Cabil**.

- **Stack:** Electron · React · TypeScript · Vite · SCSS · SQLite (better-sqlite3) · electron-builder
- **Security:** `contextIsolation: true`, `nodeIntegration: false`, sandboxed renderer, secure preload bridge, IPC-only access
- **Data:** Each installed computer keeps its **own SQLite database** in its user-data folder
  (`C:\Users\<USER>\AppData\Roaming\FinancialEncoder\`). No cloud, no accounts, fully offline.
- **Release:** the user-facing installer is `Financial-Encoder-Setup-<version>.exe` in `release/`.
- **Updates:** automatic updates via GitHub Releases (HTTPS, sha512-verified). See `UPDATE_SYSTEM.md`.

## Project structure

```
financial_encoder/
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
| `npm run release` | Build + package installer + `latest.yml` + blockmap (no upload) |
| `npm run release:signed` | Same as `release`, but **fails fast** if no code-signing certificate is provided (`CSC_LINK` / `CSC_KEY_PASSWORD`) |
| `npm run release:publish` | Same as release, then create a **published** GitHub Release (`GH_TOKEN` required) |
| `npm run verify:windows-signature` | Verify the Authenticode signature of the built installer (SmartScreen / trust check) |
| `npm run typecheck` | Type-check both TypeScript projects |
| `npm run lint` | Type-check (uses the same strict configs) |
| `npm test` | Run the unit test suite (Vitest) |

## Create a release

```powershell
npm run release              # package locally (no upload)
npm run release:publish      # build + create the GitHub Release (needs GH_TOKEN)
```

`release:publish` creates a **published** (final) GitHub Release — never a draft — using the
`GH_TOKEN` environment variable (a PAT with `repo` scope). Reuse it in your shell or CI, and
never commit it to the repository.

Or push a `v*` tag — the **Release** GitHub Action builds and publishes it
automatically (tag must match the `package.json` version).

Output (installer + update artifacts):

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

## Code signing & SmartScreen

Windows may show a warning when running an application downloaded from the
internet. That warning is decided by **SmartScreen**, which considers two
different things:

1. **Code signing** (Authenticode) — a digital certificate proving *who*
   published the file. This is **not** the same as reputation.
2. **Reputation** — how many people have run the file or installer and how
   Windows (and other antivirus engines) currently rate it.

Signing Financial Encoder with a legitimate certificate tells users *who*
published it and removes the "unknown publisher" warning, but it does **not**
by itself guarantee SmartScreen will not prompt ("Windows protected your PC").
A newly signed, rarely-downloaded file can still be flagged until it builds
reputation. The correct response is to distribute the signed installer through
a trusted channel and keep building download volume — never to disable
SmartScreen, App Control, Defender or UAC.

**Publisher identity:** `Financial Encoder © 2026 Gilmier Ej Cabil` is embedded
in the installer metadata and the About section of the app.

### Signing is configured but no certificate is committed

No certificate or password is stored in this repository. electron-builder reads
the standard environment variables:

```
SET CSC_LINK=C:\secure\financial-encoder.pfx
SET CSC_KEY_PASSWORD=your-secure-password
npm run release:signed
```

Or, for Azure Trusted Signing:

```
SET AZURE_TENANT_ID=...
SET AZURE_CLIENT_ID=...
SET AZURE_CLIENT_SECRET=...
SET AZURE_CERT_NAME=...
npm run release:signed
```

- `npm run release:signed` refuses to build a production installer when the
  signing credentials are missing (see `scripts/require-signing.js`).
- `npm run dist` / `npm run release` still work **unsigned** for local testing.
- `npm run verify:windows-signature` inspects the built installer with
  `Get-AuthenticodeSignature` and reports publisher, validity and PASS/FAIL.

See `SIGNING.md` for the complete guide (why, what you need, CI secrets, and
troubleshooting).

## Release notes & user guide

See `RELEASE_NOTES.md` (what changed), `USER_GUIDE.md` (beginner guide), and `UPDATE_SYSTEM.md`
(how automatic updates are published and tested).