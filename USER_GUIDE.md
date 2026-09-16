# Financial Encoder — User Guide

Financial Encoder is a desktop app that keeps your finances on **your own
computer**. Nothing is sent to the internet, and you do not need to install
any developer tools.

## 1. Install the application

1. Double-click `Financial-Encoder-Setup-1.0.0.exe`.
2. Follow the installer (choose a folder or keep the default).
3. Open **Financial Encoder** from the Start Menu (or the desktop shortcut).

There is no need to install Node.js, npm, or any other software.

## 2. Open Financial Encoder

- Launch it from the Start Menu. The app opens to the **Dashboard**.
- Your data is kept safe in a separate data folder, not in the program folder,
  so reinstalling or updating the app never deletes your records.

## 3. Add transactions

- Use the **Income**, **Expenses**, **Capital** or **Cash Flow** page from the
  left menu.
- Click **Add transaction** (or the equivalent button on the page).
- Fill in the **date**, **description**, **category**, **type** and **amount**.
- Save. The figures update everywhere instantly.

## 4. Review the Dashboard

- The **Dashboard** shows your current balances, income and expenses over time,
  and recent activity.

## 5. Generate reports

1. Open **Reports**.
2. Choose a period (This Month, Last 3 Months, This Year, All Time, or Custom).
3. Review the income statement, cash flow, capital, category breakdown and
   monthly summary.
4. Click **Export CSV**, **Export XLSX** or **Export PDF** to save a copy to
   your computer.

## 6. Import from Excel or CSV (optional)

1. Open **Import**.
2. Click **Select file** and choose your `.csv` or `.xlsx` file.
3. Check the suggested column mapping and the preview rows.
4. Correct the mapping if needed, then confirm.
5. Invalid rows are skipped and listed as warnings — nothing is saved without
   your confirmation.

## 7. Backup your data

1. Open **Settings → Backup & Restore**.
2. Click **Create backup** to make a snapshot you can keep in the list, or
   **Export backup…** to save a portable file such as
   `FinancialEncoder-Backup-2026-09-16.febak` to a USB drive, an external
   drive, or another folder.

## 8. Restore data on another computer

1. Copy the `.febak` backup file to the other computer (for example via USB).
2. Install Financial Encoder there.
3. Open **Settings → Backup & Restore** and click **Restore from file…**.
4. Choose the backup file. Financial Encoder checks it first and keeps a safety
   copy of the current database before restoring.

> Each computer keeps its own database. Restoring a backup replaces that
> computer's current data with the backup you selected.

## Notes

- **Data stays local.** Your records live in
  `C:\Users\<USER>\AppData\Roaming\FinancialEncoder\`.
- **Back up regularly.** Backups are the only way to move your data to another
  computer.
- **Offline.** The core app does not need an internet connection.