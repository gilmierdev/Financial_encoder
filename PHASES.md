# Development Roadmap

Implementation follows strictly ordered phases. Each phase is verified
(run the app, fix errors, don't break existing features) before moving on.

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Project setup: Electron + React + TS + Vite + SCSS wired together | done |
| 2 | Electron + React connection hardening, logging, structured IPC results | done |
| 3 | SQLite connection (better-sqlite3) | done |
| 4 | Database migrations, schema for users/transactions/categories/settings/backups | done |
| 5 | Secure IPC surface (typed, validated, IpcResult wrapper) | done |
| 6 | Application layout: sidebar, top bar, shell | done |
| 7 | Transaction CRUD | done |
| 8 | Financial calculation engine (central service) + tests | done |
| 9 | Income page | done |
| 10 | Expenses page | done |
| 11 | Capital page | done |
| 12 | Cash Flow page | done |
| 13 | Dashboard | done |
| 14 | Charts (Recharts) | done |
| 15 | Reports | done |
| 16 | Excel/CSV import | done |
| 17 | PDF/Excel/CSV export, print | done |
| 18 | Backup / restore | done |
| 19 | OCR + document reading (Tesseract.js, PDF.js) | done |
| 20 | Security hardening review | done |
| 21 | Full test suite (calculation engine, CRUD, import/export/backup) | done |
| 22 | Windows installer (NSIS), final verification | done |

## Core conventions

- **Calculation engine** lives in one place; React never duplicates formulas.
- **Amounts** are stored and computed in integer minor units (or Decimal-safe
  arithmetic) to avoid floating-point drift; display is formatted currency.
- **IPC** input from the renderer is always validated in the main process.
- **SQL** is always parameterized; never string-concatenated.
- Imports and OCR output are **never auto-saved**: user reviews, then confirms.