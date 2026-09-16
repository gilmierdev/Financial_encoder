# Security &mdash; Financial Encoder

Financial Encoder is a **local, offline-first** Electron desktop application for Windows that
stores financial records (income, expenses, capital, cash flow) in a local SQLite database.
This document describes the security model, what is protected, and how to report issues.

## Security model

- **Everything runs locally.** The database, backups, documents and logs live under
  `%APPDATA%\Roaming\FinancialEncoder` (the Electron `userData` folder). There is no server,
  no telemetry, and no user account, so there are no credentials to steal and no cloud
  dependency.
- **The renderer is sandboxed.** The React UI runs in an Electron `BrowserWindow` with
  `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` and `webSecurity: true`.
  A strict Content-Security-Policy is enforced for production loads (header + `<meta>`).
- **A thin, validated IPC surface.** The UI can only reach the main process through the typed
  API exposed by the preload script (`window.financialEncoder`). Every handler validates its
  input in the main process before touching the database or filesystem. Unknown channels,
  raw `ipcRenderer` access, `<webview>`, and child windows are unavailable or denied.
- **The database is protected at the application layer.**
  - All SQL uses parameterized prepared statements (no SQL injection).
  - Values are validated before insert: calendar-valid dates, capped amounts, bounded text,
    typed notes, positive integer ids.
  - Files are only read through a dialog-negotiated flow (import/OCR/restore), are size-capped,
    and import requires the path to have been picked in the same session.
  - Backups are validated before any destructive restore, and every restore/reset takes a
    safety snapshot first. A daily automatic backup is created on startup when one is due.

## What is NOT protected (please read)

- **Data at rest is not encrypted.** The database and backup files (`.febak`/`.db`) are stored
  in plaintext on disk, readable by any process running as your Windows user. Use
  BitLocker/full-disk encryption and be careful about who uses your account.
- **The data folder is under the roaming profile.** If your machine joins a domain with
  roaming profiles, or OneDrive synchronizes your profile, this folder may be replicated to
  other machines/vaults. If that is undesirable, exclude it from sync or deploy with a
  different `userData` location.
- **The app itself performs no authentication.** It assumes the operating-system user account
  is trusted. Do not leave the app signed-in on a shared machine; lock your Windows session.
- **OCR voice/download:** when the bundled OCR language data is missing, tesseract.js downloads
  `eng.traineddata.gz` over HTTPS from the Project Naptha CDN on first use. With the standard
  installation the data ships offline and this never happens.

## Building and signing

- Releases are built with `npm run dist` (electron-builder, NSIS, per-user install, no
  elevation required). Application code is packed in an `asar` archive.
- **Sign every release.** Provide code-signing credentials via environment variables at build
  time (`CSC_LINK`, `CSC_KEY_PASSWORD`, or Azure Trusted Signing variables) so the installer
  carries a valid Authenticode signature. Unsigned builds trigger SmartScreen warnings.
- Distribute installers only through trusted channels (GitHub Releases, your own site).

## Backup hygiene

- Create backups regularly (a daily automatic backup is created on startup; you can also create
  one manually in **Settings &rarr; Backup &amp; Restore**).
- Export a copy to external media periodically; backups are the only recovery path if the
  machine is lost or encrypted by ransomware.

## Reporting a vulnerability

Please report security issues privately to the maintainer (GitHub
<https://github.com/gilmierdev/financial_encoder>) rather than opening a public issue. Include a
description of the issue, the version, and repro steps. We treat self-XSS, renderer-only issues
behind `contextIsolation`, and local-file attacks that require physical access to the machine as
lower severity.

## Dependency status

`npm audit` currently reports two **moderate** advisories chained through `exceljs` &rarr; `uuid`
(GHSA-w5hq-g745-h8pq). The vulnerable code paths (uuid `v3/v5/v6` with a caller-supplied `buf`)
are not reachable by exceljs in this project, and the only automated "fix" would downgrade
`exceljs` a major version. The issue is tracked as an accepted low-risk dependency finding. See
`SECURITY_AUDIT.md` item 20 for details.