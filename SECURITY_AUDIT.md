# Financial Encoder — Security Audit

Date: 2026-09-16
Scope: Electron main process, preload bridge, React renderer, SQLite storage, build/release pipeline.
Applies to: commit/version current at audit time.

Severity legend: **Info** (no action), **Low** (best practice), **Medium** (defense-in-depth),
**High** (must fix — none currently exploitable in this codebase), **Critical** (remote/privilege escape — none).

---

## 1. SQL Injection

| Severity | Status |
|---|---|
| Info — Verified secure | 🔒 Secure |

All database access uses parameterized prepared statements (`better-sqlite3`).
No user input is concatenated into SQL strings:
- `transactions` reads/writes: `electron/transactions/transaction.service.ts` (all `?` placeholders).
- `ORDER BY` uses a hardcoded allowlist map (`COLUMN_MAP`, `transaction.service.ts:89-101`).
- `categories`, `settings`, `backups`, `calculations`, `migrations`: parameterized or allowlisted.
- `IN (...)` clauses are built from allowlist-validated type/id arrays.

No action required.

## 2. Data Validation — General / Transaction Input

| Severity | Status |
|---|---|
| Low → Medium | ✅ Hardened this pass |

Baseline already validated in main process (`validateInput`, `transaction.service.ts:16-40`):
description required & ≤255 chars, category_id positive integer, type allowlist, amount finite & ≥0,
date must match `YYYY-MM-DD` regex.

Gaps found and fixed:
- **Calendar-valid dates** — regex only; `2026-02-31`, `2026-13-01` were accepted. Now validated against a real calendar (year 1900–2100). `electron/services/validation.ts`.
- **Amount upper bound** — any finite non-negative number (up to `1e308`) could be stored. Now capped at `MAX_AMOUNT = 999,999,999,999`. Same for imported and OCR-parsed amounts.
- **`notes` type** — non-string values (numbers/objects) were not rejected. `notes` must now be `string | null`.

## 3. Data Validation — List / Filter Parameters

| Severity | Status |
|---|---|
| Low | ✅ Hardened this pass |

`transactions:list` coerced filters silently. Now validates:
- `date_from` / `date_to` must be calendar-valid `YYYY-MM-DD` strings (rejected otherwise).
- `search_term` length capped at 200 chars.
- `page` / `page_size` already restricted (positive ints, page_size ≤ 200).
- `types` / `category_id` values already allowlisted/validated.

## 4. Input Validation — IPC Resource IDs

| Severity | Status |
|---|---|
| Medium | ✅ Hardened this pass |

`transactions:get/update/delete` accepted non-numeric / non-integer ids from IPC and forwarded them
to queries (better-sqlite3 would coerce or throw). Ids are now validated as positive safe integers
in the IPC layer before reaching the service. `electron/ipc/transaction.ipc.ts`.

## 5. Input Validation — Settings

| Severity | Status |
|---|---|
| Low | ✅ Hardened this pass |

`setSetting` already allowlists keys, caps length at 200, allowlists `theme`, and validates `currency`
as a 3-letter code. Gaps fixed:
- `dateFormat` was free-form; now restricted to display tokens `YYYY / MMMM / MMM / MM / DD / D` plus
  separators (`- / . space`), so control characters and arbitrary text cannot be persisted.
- `defaultExportFolder` must be empty or an absolute path (no NUL / control characters) — prevents
  nonsense or relative values being persisted.
- The `dateFormat` value is display-only (React-escaped token replacement in `src/utils/dates.ts`);
  it never constructs HTML or SQL, so this is defense-in-depth.

## 6. File Security — Import

| Severity | Status |
|---|---|
| Medium | ✅ Hardened this pass |

`import:confirm` re-supplied the file path from the renderer. A compromised/XSS'd renderer could
cause the main process to read *any* `.csv` / `.xlsx` file on disk. Fixed with a main-process
allowlist: the path must have been picked and successfully previewed via `import:pick` in the same
session (`electron/import/import.service.ts`). The confirm step removes the path after use
(one-shot). The app already writes no data through import paths — only reads.

## 7. File Security — Size Limits

| Severity | Status |
|---|---|
| Medium | ✅ Hardened this pass |

No size limit existed on imported spreadsheets or OCR documents (a multi-GB file would exhaust
memory during parse/OCR). Now capped at 50 MB (`MAX_IMPORT_FILE_BYTES`,
`MAX_OCR_FILE_BYTES`), row count already capped at 50,000 rows.

## 8. File Security — Import Column Mapping

| Severity | Status |
|---|---|
| Low | ✅ Hardened this pass |

Column indexes in import mapping were validated as integers ≥ -1 but had no upper bound. Indexes
are now bounded to a sane maximum (1000) before use.

## 9. File Security — Exports / Backup Export

| Severity | Status |
|---|---|
| Low | ✅ Hardened this pass |

- Export destinations come from native save dialogs (user-confirmed) — good baseline.
- Added: correct extension is enforced on the final filename per format (`csv`/`xlsx`/`pdf`), so a
  hand-typed filename without an extension is completed rather than written misleadingly.
- `export:file` now maps an unsupported format to a typed `AppError` instead of a generic internal error.

## 10. Command Execution / OS Shell Access

| Severity | Status |
|---|---|
| Info — Verified secure | 🔒 Secure |

No `child_process`, `execFile`, `spawn`, `exec`, `shell:` or OS shell invocation anywhere in
`electron/` (the two `db.exec` occurrences in `migrations.ts` are better-sqlite3 SQL executors,
not OS commands). No webview tags are used; they are now explicitly denied at app level.

## 11. Electron Process / Renderer Isolation

| Severity | Status |
|---|---|
| Info — Verified + Hardened | 🔒 Secure |

Baseline (already strong):
- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`
  (`electron/main.ts:53-59`), also on the hidden PDF-export window.
- Minimal typed API exposed via `contextBridge` (`electron/preload.ts`); no raw `ipcRenderer`/`require`
  leakage.
- Popups denied (`setWindowOpenHandler` → external browser); `will-navigate` locked to the app
  origin (dev) or `file://` (prod).

Hardened this pass:
- Global `web-contents-created` guard: `will-attach-webview` denied for all web contents.
- A strict `Content-Security-Policy` response header is applied to all `file://` loads as a second
  layer beneath the existing `<meta>` CSP in `index.html`. Dev (Vite server) is intentionally
  unaffected.

## 12. Renderer XSS / HTML Injection

| Severity | Status |
|---|---|
| Info — Verified secure | 🔒 Secure |

- React escapes all rendered values; no `dangerouslySetInnerHTML`/`innerHTML`/`eval`/`new Function`
  anywhere in `src/` (verified by search).
- Report HTML export escapes all data via `escapeHtml` in `electron/export/report.service.ts` and is
  rendered inside a sandboxed, `nodeIntegration:false`, `contextIsolation:true` hidden
  `BrowserWindow` loaded from an encoded `data:` URL.

## 13. SQLite Storage Security

| Severity | Status |
|---|---|
| Medium | ✅ Hardened this pass |

DB at `%APPDATA%\Roaming\FinancialEncoder\database.db` (WAL). Added:
- `PRAGMA synchronous = NORMAL` (explicit; correct for WAL).
- `PRAGMA quick_check` run at startup after migrations; result logged (non-`ok` logged as error).
- `PRAGMA trusted_schema = OFF` — blocks dynamic loading of schema-embedded functions.
- `PRAGMA secure_delete = ON` — deleted rows are overwritten with zeros on newer SQLite.
- Lock / contention handled by `busy_timeout`. Single-user desktop app; integrity additionally
  protected by the existing backup/restore safety flows.

## 14. Data at Rest — Encryption & Access Control

| Severity | Status |
|---|---|
| Medium (documented limitation) | 📄 Documented |

- The database and backups are **not encrypted** (no SQLCipher). Any process running as the same
  Windows user can read the DB files while the app is closed.
- Access is limited by standard Windows user-profile ACLs (files live under
  `%APPDATA%\Roaming\FinancialEncoder`, owned by the user profile).
- **Note:** Roaming profiles are synced to domain/OneDrive profiles; this folder contains financial
  data, so consider full-disk encryption and/or excluding it from cloud sync for sensitive devices.
- Mitigation options (documented, not auto-enabled): SQLCipher encryption, or per-user NTFS ACL
  tightening via `icacls` at install time.

## 15. Authentication / Authorization

| Severity | Status |
|---|---|
| Info | 📄 Documented |

No user accounts exist (single-user local desktop app; the schema's legacy `users` table is unused).
Every IPC handler authorizes the renderer by construction: the renderer is our own code running in a
sandboxed, context-isolated window that only reaches the main process through the validated API
surface listed in this audit. A login system is intentionally out of scope; the most important
controls are role isolation (none — single user) and strict IPC validation (implemented).

## 16. Secrets Management

| Severity | Status |
|---|---|
| Info — Verified secure | 🔒 Secure |

- No API keys, passwords, tokens, or private keys in source, config, or bundled resources
  (search verified). No `.env` files are committed; `.env*` is git-ignored.
- Code-signing credentials are passed at build time via environment variables only
  (`CSC_LINK`, `CSC_KEY_PASSWORD`, Azure variables) and never written into the repo.
- `electron-builder.config.js` contains no secrets.

## 17. Network / Remote Content

| Severity | Status |
|---|---|
| Low | 📄 Documented |

The app performs no intentional network communication except:
- OCR language data: prefers the bundled offline copy under `resources/ocr`; if absent,
  tesseract.js downloads `eng.traineddata.gz` over **HTTPS** from the Project Naptha CDN on first
  use (`electron/ocr/ocr.service.ts`).
- Opening user-clicked external links in the default browser (no data sent).
- Dev-mode HMR connections to the Vite server.

Renderer `connect-src` in the CSP is `'self'` in production (no API endpoints), plus the Vite dev
server origins in the meta CSP for development.

## 18. Backup / Recovery Security

| Severity | Status |
|---|---|
| High (protective layer) | ✅ Hardened this pass |

Baseline (already strong):
- Restores validate the file as a genuine SQLite DB with expected schema tables before touching
  anything (`validateBackupFile`, `backup.service.ts:51-86`).
- Every restore takes a **safety snapshot** of the current DB first; reset does the same.
- Restore copies to a temp file and atomically renames, then re-opens; on failure the previous DB is
  restored so the app keeps working.
- Only `.febak/.db/.sqlite*` extensions are accepted; file existence is checked.

Added this pass:
- **Daily automatic backup**: on startup, if no `auto-*` backup exists in the last 24 hours, one is
  created silently; `auto-*` backups older than 30 days are pruned automatically
  (`createDailyBackupIfDue`). Backups are stored under the user's data folder (not the install folder).

## 19. Logging & Information Leakage

| Severity | Status |
|---|---|
| Low | 📄 Documented, reviewed |

- Logs in `%APPDATA%\Roaming\FinancialEncoder\logs\`, rotated at 5 MB × 5 files.
- Log entries contain paths and filenames but **no** transaction-level financial values (only sizes,
  counts, and filenames where needed).
- Renderer `logger:log` writes are length-capped (4000 chars) and level-allowlisted; log line format
  escapes newlines, so a log injection is not possible through message text.
- Error details (incl. stack traces) are written to the log file and never sent to the renderer
  (`toAppError` maps unexpected errors to a generic message).

## 20. Dependencies — `npm audit`

| Severity | Status |
|---|---|
| Moderate ×2 (advisory) | 📄 Documented accepted risk |

`npm audit` reports 2 moderate findings, both chained to `exceljs` → `uuid@8.3.2`
(GHSA-w5hq-g745-h8pq, CWE-787: missing buffer-length check in `uuid.v3/v5/v6` when a `buf` argument
is supplied):
- The vulnerable code paths require the caller to pass a `buf` buffer to v3/v5/v6 UUID generation.
  exceljs does not do this — it generates UUIDs with `uuid.v1`/`v4` without a `buf`. Not reachable in
  this application.
- The only offered "fix" is downgrading `exceljs` 4.4.0 → 3.4.0 (a major downgrade that changes
  workbook features). We treat this as **accepted risk** and track it. Revisit when a fixed exceljs
  release (using uuid ≥ 11.1.1) is available.

## 21. Update Mechanism

| Severity | Status |
|---|---|
| Low | 📄 Documented + remediated (v1.1) |

**Remediated (automatic update system, see `UPDATE_SYSTEM.md`):** the app now ships with an
`electron-updater`-based update channel that makes automated delivery possible while keeping the
attack surface narrow:

- Updates are fetched **over HTTPS only** from GitHub Releases (owner `gilmierdev`, repo
  `financial-encoder`); an env-only feed override for local testing is restricted to HTTPS or
  `http://localhost`/`127.0.0.1` — arbitrary/insecure URLs are rejected (`validateFeed` in
  `electron/updater/update-meta.ts`).
- Binary integrity is verified with the **sha512** hashes published in `latest.yml`
  (electron-updater checks the hash of every downloaded artifact before it can run).
- The **update feed is fixed at build time** in `app-update.yml`; the renderer cannot change or
  point the updater anywhere, and updates are never applied in development builds
  (`app.isPackaged` gate).
- A **database safety backup** is created automatically immediately before an update is applied.
- Releases are still code-signed when `CSC_LINK` / signing env vars are present at build time;
  unsigned builds carry the standard Windows SmartScreen warning. Recommended (documented in
  `SECURITY.md`): sign every release and distribute only through trusted channels.

## 22. Build Configuration

| Severity | Status |
|---|---|
| Info — Verified | 🔒 Secure |

- `asar: true` — application code is packed; no `asarUnpack` of code.
- Per-user NSIS install (`oneClick`, `perMachine: false`) → no elevation/admin required.
- `deleteAppDataOnUninstall: false` → uninstalling does not delete user data (safer defaults).
- `node_modules`/`dist`/`release`/`*.log`/`.env*` git-ignored; backup data lives outside the repo.

## 23. Renderer Console Forwarding

| Severity | Status |
|---|---|
| Low | ✅ Reviewed |

Renderer console messages are forwarded to the log file (`console-message` listener), level-allowlisted
and length-capped. No sensitive data observed in renderer logging; messages are prefixed `[renderer]`.

## 24. Process/System Integrity

| Severity | Status |
|---|---|
| Info | ✅ Reviewed |

- Ungradable user input cannot reach `fs` write paths: all writes go to user-chosen dialog paths
  (exports, backup export) or the app's own data directories. Import/OCR/restore reads are now
  allowlisted (import) or dialog-negotiated (OCR, restore), plus size-capped.
- Uncaught exceptions are logged and (in production) quit the app cleanly to avoid a corrupt
  half-state.
- DB is closed on app quit (`window-all-closed`).

---

## Summary

| Level | Count | Notes |
|---|---|---|
| Critical | 0 | — |
| High | 0 | — |
| Medium | 0 remaining after this pass | All medium findings fixed |
| Low | a few documentation/defense items | Documented above |
| Info | baseline verifications | Secure |

The codebase demonstrated a strong security baseline (parameterized SQL, sandboxed renderer,
validated IPC, safe backup/restore). This pass added calendar-correct date validation, amount caps,
typed notes, IPC id validation, stricter settings validation, import-file allowlisting, file-size
caps, SQLite pragmas + startup integrity check, CSP header enforcement, webview denial, and a daily
automatic backup.