# Security Test Report

Date: 2026-09-16
Audit reference: `SECURITY_AUDIT.md`

## Verification performed

- **Static review** of the Electron main process, preload bridge and renderer for common
  vulnerability classes (SQL injection, command execution, secrets, XSS, unsafe IPC, arbitrary
  file access, path traversal).
- **Automated scanning**: `npm audit` (2 moderate, non-reachable, documented) and source greps
  for `child_process`/`exec`/`spawn`, secrets patterns, and `innerHTML`/`eval`/`new Function`.
- **Automated tests**: 17 new security-focused unit tests added alongside the existing suite.
  All 87 tests pass.
- **Compilation and build**: `npm run typecheck` (both `tsconfig.json` and
  `tsconfig.electron.json`) passes; `npm run build` (Vite renderer + Electron main) succeeds.

## Finding &rarr; Fix &rarr; Verification matrix

| # | Finding (audit item) | Fix | Verification |
|---|---|---|---|
| 1 | SQL injection surface | Was already parameterized + allowlisted | Reviewed every write/read path; tests green |
| 2 | Regex-only date check accepted impossible dates | Calendar-valid date validation (year 1900–2100) in `electron/services/validation.ts`, used by transaction create/update + list filters | `tests/security/validation.test.ts` (leap years, 2026-13-01, 2026-02-31) |
| 3 | No amount upper bound | `MAX_AMOUNT = 999,999,999,999` enforced on create/update, import parse and OCR parse | Unit tests for `NaN`, `Infinity`, `MAX_AMOUNT+1` |
| 4 | Non-string `notes` accepted | `notes` must be `string \| null` (≤2000) | Unit tests (number/object rejected) |
| 5 | IPC ids not validated | Positive-safe-integer check in `electron/ipc/transaction.ipc.ts` | `isSafePositiveInt` unit tests |
| 6 | Import confirm trusted arbitrary renderer paths | Picked-file allowlist in `electron/import/import.service.ts` (one-shot consumption) | Tests: never-picked rejected, picked accepted, re-use rejected |
| 7 | No file-size limits | 50 MB caps for import and OCR (`MAX_IMPORT_FILE_BYTES`, `MAX_OCR_FILE_BYTES`) | Code review; size check placed before any read |
| 8 | Column-mapping indices unbounded | Bounded to ≤1000 | Review + validation test still passing |
| 9 | OCR parse leaks huge amounts / bad dates | Amount cap + YYYY-MM-DD calendar check in `ocr.service.ts` | `parseDocumentLines` unit test |
| 10 | `dateFormat`/`defaultExportFolder` unchecked | Token-only dateFormat; empty-or-absolute export folder | Settings unit tests |
| 11 | SQLite defaults not explicit | `synchronous=NORMAL`, `trusted_schema=OFF`, `secure_delete=ON`, startup `quick_check` | Review; DB still opens/migrates in tests |
| 12 | No automatic backups | `createDailyBackupIfDue()` (24 h window, 30-day auto retention) wired into startup | Unit test: one auto backup per window |
| 13 | No app-wide webview/window guards | Global `web-contents-created` deny webview + deny windows-in-app; CSP response header for `file://` | Typecheck + build; dev unaffected |
| 14 | Shell/command access | None present (confirmed by grep) | `SECURITY_AUDIT.md` item 10 |
| 15 | Secrets in repo | None (confirmed by grep); `.env*`, certs, pfx/p12 ignored | `.gitignore` updated |
| 16 | XSS in renderer | None (React escapes; no `innerHTML`/`eval`; report HTML escaped) | Grep verified |
| 17 | uuid advisory via exceljs | Not reachable; documented accepted risk | `npm audit` re-run; audit item 20 |

## Commands

```
npm run typecheck   # tsconfig.json + tsconfig.electron.json (noEmit)
npm test            # vitest run            — 5 files, 87 tests, 0 failed
npm run build       # vite build + tsc electron build — succeeds
npm audit           # 2 moderate (uuid via exceljs, non-reachable) — documented
```

## Residual risk (accepted + documented)

- Database and backups are stored unencrypted (OS-user ACL protection only) — see `SECURITY.md`.
- Roaming-profile/OneDrive sync may replicate the data folder — see `SECURITY.md`.
- `exceljs`/`uuid` moderate advisory is not reachable in this build — see audit item 20.
- Auto-update channel is HTTPS + sha512-verified and user-data is backed up before apply (see
  `UPDATE_SYSTEM.md`); releases must still be signed and distributed through trusted channels.