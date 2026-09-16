# Financial Encoder — Release Notes

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
  show a banner when a newer version exists, with release notes, download progress and a
  one-click restart to install.
- Downloads are verified against the signed `latest.yml` **sha512** hash before use.
- A **backup of your database is created automatically** immediately before an update applies;
  the installer never touches your data folder
  (`C:\Users\<USER>\AppData\Roaming\FinancialEncoder\`).
- See `UPDATE_SYSTEM.md` for publishing, rollback and troubleshooting.