# Financial Encoder — Release Notes

## v1.0.7 (September 17, 2026)

### Updates

- **Complete UI/UX refresh.** Every screen was redesigned with a modern indigo-to-violet
  accent system, softer cards and shadows, a glassy top bar, animated navigation states,
  refined tables, forms, buttons, badges and modals, plus a smoother page-to-page feel.
  Light and dark themes were re-tuned for better contrast and readability.
- **Faster, cleaner update checks.** Redundant background version checks are now deduped
  (one request instead of several at startup), and the download banner keeps the target
  version visible while progress streams.
- **Better update-message handling.** Update errors are translated to clear, friendly
  notices again (offline, connectivity, checksum, permissions, no-published-releases),
  with full coverage restored for the update helpers.

## v1.0.6 (September 16, 2026)

### Updates

- **In-app setup downloader.** When an update is available, the banner and
  Settings → Updates now offer **Download setup**: the newest
  `Financial-Encoder-Setup-<version>.exe` is streamed straight from GitHub into
  your **Downloads** folder, with a live progress bar. When it finishes, a
  **Show in Downloads** button reveals it in File Explorer so you can run the
  installer yourself. Alternatively, **Open GitHub page** keeps the browser
  route. The app still never installs or launches anything by itself.

## v1.0.5 (September 16, 2026)

### Updates

- **Update notifications only — no silent auto-update.** The app now checks
  GitHub for new versions and shows a banner ("Update available: …") with the
  release notes and a button that opens the GitHub releases page in your
  browser, where you download and run the installer yourself. The app never
  downloads or installs anything in the background, so it can no longer
  "disappear" while applying an update, and you stay in control of when
  updates are installed.
- **Optional Windows code signing in CI.** The release workflow now signs the
  installer automatically when a `CSC_LINK_B64` code-signing certificate is
  configured as a repository secret. Signed installers work with Windows Smart
  App Control (which silently blocked the previous unsigned auto-update
  installers). Without the secret the build stays unsigned, preserving the old
  fallback. See `SIGNING.md` for setup.
- **More reliable window startup.** A fallback now force-shows the main window
  a few seconds after launch if the renderer is slow, so the app never sits
  invisible behind the taskbar.

## v1.0.4 (September 16, 2026)

### Security

- **Patched two moderate `uuid` vulnerabilities** inherited through `exceljs`
  (missing buffer bounds check in uuid `v3`/`v5`/`v6`). `npm audit` now reports
  `0 vulnerabilities`, and Excel import/export still passes all tests.

## v1.0.3 (September 16, 2026)

### Fixes

- **No more "You're up to date" banner on every launch.** The app now stays
  quiet when it is already on the latest version; the up-to-date status is
  still shown in **Settings → Updates** when checking manually.

## v1.0.2 (September 16, 2026)

Automatically-published release built from the configured CI pipeline.

## v1.0.1 (September 16, 2026)

Automatic-update system made live.

### Fixes

- **Updates now actually publish.** Releases are created as **published** (final)
  releases again — the previous draft-only config meant GitHub never advertised a
  version, so installed copies reported *"No published versions on GitHub"*.
- **Friendly update messages.** A cryptic raw error no longer appears in the
  banner; updater failures are translated to clear, human-readable messages
  (and the full detail is kept in `logs/`).
- **Settings → Updates panel.** Check for updates, see your installed version,
  download and restart-to-install — all from the Settings screen.
- **Update-install safety.** A read-only snapshot of your database is taken
  automatically before any schema migration if an update ships one, in addition
  to the existing pre-install backup.

Commands for maintainers (`npm run release` / `npm run release:publish`) and the
CI Release workflow are documented in `UPDATE_SYSTEM.md`.

## v1.0.0 (September 16, 2026)

First stable, distributable release of Financial Encoder.

### Features

- **Offline financial database** — everything is stored on the local computer.
- **Income tracking** — record salary, sales, interest and other income.
- **Expense tracking** — record and categorise business and personal expenses.
- **Capital tracking** — owner investment and capital additions.
- **Cash flow** — money in vs money out over time.
- **Dashboard** — overview of balances, totals and recent activity.
- **Reports** — income statement, cash flow, capital, monthly summary and category breakdown.
- **Excel / CSV import** — column mapping, preview, validation and confirmation before saving.
- **Excel / CSV / PDF export** — professional downloadable reports.
- **Documents / OCR** — read PDF text and run OCR on images (works offline).
- **Backup and restore** — internal snapshots plus portable `.febak` files you can save to a USB drive or another folder and restore on any machine.
- **Local data storage** — no cloud, no accounts, no internet required.

### System

- **Platform:** Windows 10 / 11, 64-bit (x64)
- **Database:** local SQLite via better-sqlite3
- **Internet:** not required for core application functionality
- **Runtime:** bundles its own Electron runtime — no Node.js, npm, VS Code, Git or MongoDB needed

### Data location

Each installation keeps its own independent database at:

```
C:\Users\<USER>\AppData\Roaming\FinancialEncoder\
├── database.db       Local SQLite database
├── backups\          Internal backup snapshots
├── documents\        Read/OCR source files
├── exports\          Exported reports
└── logs\             Application logs
```

The first run creates a fresh, empty database automatically. No user financial
data is bundled with the installer.

### Backup files

Exported backups use the portable `.febak` format, for example:

```
FinancialEncoder-Backup-2026-09-16.febak
```

- **Export** saves a snapshot to a location you choose (USB, external drive, another folder).
- **Restore** validates the file (it must be a readable Financial Encoder backup) before anything is replaced, and keeps a safety copy of the current database first.

### Packaging

- **Installer:** `Financial-Encoder-Setup-1.0.0.exe` (NSIS, x64)
- **App ID:** `com.financialencoder.app`
- **App icon:** finance-themed (navy→blue gradient, white coin with a peso mark) applied to the installer, start-menu/desktop shortcuts, taskbar and in-app favicon.
- **Shortcuts:** Start Menu + optional desktop shortcut
- **Uninstall:** fully supported from Windows Settings / Control Panel
- **Code signing:** signing is configured but the release is unsigned until a legitimate code-signing certificate is installed (see `SIGNING.md`).

### Reliability fixes in this build

- Renderer now tolerates a not-yet-present preload bridge instead of crashing at startup.
- Content Security Policy explicitly allows same-origin blob workers used by the import parser.
- Auto-update wiring verified in the packaged build: the feed check initializes on startup (not only on macOS-style reactivation).

### Automatic updates

- Installed builds check for updates (GitHub Releases feed, HTTPS) shortly after launch and
  show a banner when a newer version exists, with release notes and a button that
  opens the GitHub releases page to download the installer.
- Downloads from the releases page are verified against the published **sha512** hash.
- The installer never touches your data folder
  (`C:\Users\<USER>\AppData\Roaming\FinancialEncoder\`).
- See `UPDATE_SYSTEM.md` for publishing, rollback and troubleshooting.