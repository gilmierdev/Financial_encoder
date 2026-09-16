import ExcelJS from 'exceljs'
import { AppError } from '../services/ipc-handler'
import { getAllSettings } from '../database/settings'
import { listAllTransactions } from '../transactions/transaction.service'
import {
  calculateTotals,
  calculateMonthlySummaries,
  calculateCategoryBreakdown,
} from '../calculations/calculation.service'
import type { TransactionFilters, Transaction } from '../transactions/transaction.service'
import type { CalculationFilter, CalculationTotals, MonthlySummary, CategoryBreakdown } from '../calculations/types'

export interface ReportData {
  title: string
  periodLabel: string
  generatedAt: string
  currency: string
  totals: CalculationTotals
  monthly: MonthlySummary[]
  categories: CategoryBreakdown[]
  transactions: Transaction[]
}

function toTxFilters(filter: CalculationFilter): TransactionFilters {
  const filters: TransactionFilters = {
    sort_by: 'date',
    sort_dir: 'asc',
    page_size: 200,
  }
  if (filter.date_from) filters.date_from = filter.date_from
  if (filter.date_to) filters.date_to = filter.date_to
  if (filter.types?.length) filters.type = [...filter.types]
  if (filter.category_ids?.length) filters.category_id = [...filter.category_ids]
  return filters
}

function money(n: number, currency: string): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(n)
}

export function buildReportData(filter: CalculationFilter, title = 'Financial Report'): ReportData {
  const settings = getAllSettings()
  const totals = calculateTotals(filter)
  const monthly = calculateMonthlySummaries(filter)
  const categories = calculateCategoryBreakdown(filter)
  const transactions = listAllTransactions(toTxFilters(filter))

  let periodLabel = 'All time'
  if (filter.date_from && filter.date_to) {
    periodLabel = `${filter.date_from} to ${filter.date_to}`
  } else if (filter.date_from) {
    periodLabel = `From ${filter.date_from}`
  } else if (filter.date_to) {
    periodLabel = `Until ${filter.date_to}`
  }

  return {
    title,
    periodLabel,
    generatedAt: new Date().toISOString(),
    currency: settings.currency,
    totals,
    monthly,
    categories,
    transactions,
  }
}

function csvCell(value: string | number): string {
  const text = String(value)
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

export function buildCsvReport(data: ReportData): string {
  const lines: string[] = []
  const push = (...cells: (string | number)[]): void => {
    lines.push(cells.map(csvCell).join(','))
  }

  push(data.title)
  push(`Period,${data.periodLabel}`)
  push(`Generated,${data.generatedAt}`)
  push('')

  push('SUMMARY')
  push(`Income,${data.totals.income}`)
  push(`Expense,${data.totals.expense}`)
  push(`Capital,${data.totals.capital}`)
  push(`Withdrawal,${data.totals.withdrawal}`)
  push(`Net,${data.totals.net}`)
  push(`Transaction count,${data.totals.count}`)
  push('')

  push('MONTHLY SUMMARY')
  push('Month,Income,Expense,Capital,Withdrawal,Net,Count')
  for (const row of data.monthly) {
    push(row.month, row.income, row.expense, row.capital, row.withdrawal, row.net, row.count)
  }
  push('')

  push('CATEGORY BREAKDOWN')
  push('Category,Type,Count,Total')
  for (const cat of data.categories) {
    push(cat.category_name, cat.type, cat.count, cat.total)
  }
  push('')

  push('TRANSACTIONS')
  push('Date,Description,Category,Type,Amount,Notes')
  for (const tx of data.transactions) {
    push(tx.date, tx.description, tx.category_name, tx.type, tx.amount, tx.notes ?? '')
  }

  return lines.join('\r\n')
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function buildHtmlReport(data: ReportData): string {
  const rows = data.transactions.map((tx) => `
      <tr>
        <td>${escapeHtml(tx.date)}</td>
        <td>${escapeHtml(tx.description)}</td>
        <td>${escapeHtml(tx.category_name)}</td>
        <td>${escapeHtml(tx.type)}</td>
        <td class="num">${escapeHtml(money(tx.amount, data.currency))}</td>
        <td>${escapeHtml(tx.notes ?? '')}</td>
      </tr>`).join('\n')

  const monthlyRows = data.monthly.map((row) => `
      <tr>
        <td>${escapeHtml(row.month)}</td>
        <td class="num">${escapeHtml(money(row.income, data.currency))}</td>
        <td class="num">${escapeHtml(money(row.expense, data.currency))}</td>
        <td class="num">${escapeHtml(money(row.capital, data.currency))}</td>
        <td class="num">${escapeHtml(money(row.withdrawal, data.currency))}</td>
        <td class="num">${escapeHtml(money(row.net, data.currency))}</td>
      </tr>`).join('\n')

  const categoryRows = data.categories.map((cat) => `
      <tr>
        <td>${escapeHtml(cat.category_name)}</td>
        <td>${escapeHtml(cat.type)}</td>
        <td class="num">${cat.count}</td>
        <td class="num">${escapeHtml(money(cat.total, data.currency))}</td>
      </tr>`).join('\n')

  const t = data.totals
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(data.title)}</title>
<style>
  body { font-family: -apple-system, "Segoe UI", Arial, sans-serif; color: #0f172a; padding: 24px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .meta { color: #64748b; font-size: 12px; margin-bottom: 16px; }
  .grid { display: flex; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; }
  .stat { border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px 14px; min-width: 130px; }
  .stat .label { font-size: 11px; color: #64748b; text-transform: uppercase; }
  .stat .value { font-size: 16px; font-weight: 700; margin-top: 2px; }
  h2 { font-size: 15px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; margin: 22px 0 10px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { border: 1px solid #e2e8f0; padding: 5px 8px; text-align: left; }
  th { background: #f1f5f9; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  .positive { color: #047857; }
  .negative { color: #b91c1c; }
  @media print { .no-print { display: none; } }
</style>
</head>
<body>
  <h1>${escapeHtml(data.title)}</h1>
  <div class="meta">Period: ${escapeHtml(data.periodLabel)} &middot; Generated: ${escapeHtml(data.generatedAt)}</div>

  <div class="grid">
    <div class="stat"><div class="label">Income</div><div class="value">${escapeHtml(money(t.income, data.currency))}</div></div>
    <div class="stat"><div class="label">Expenses</div><div class="value">${escapeHtml(money(t.expense, data.currency))}</div></div>
    <div class="stat"><div class="label">Capital</div><div class="value">${escapeHtml(money(t.capital, data.currency))}</div></div>
    <div class="stat"><div class="label">Withdrawals</div><div class="value">${escapeHtml(money(t.withdrawal, data.currency))}</div></div>
    <div class="stat"><div class="label">Net</div><div class="value ${t.net >= 0 ? 'positive' : 'negative'}">${escapeHtml(money(t.net, data.currency))}</div></div>
  </div>

  <h2>Monthly Summary</h2>
  <table>
    <thead><tr><th>Month</th><th class="num">Income</th><th class="num">Expenses</th><th class="num">Capital</th><th class="num">Withdrawals</th><th class="num">Net</th></tr></thead>
    <tbody>${monthlyRows}</tbody>
  </table>

  <h2>Category Breakdown</h2>
  <table>
    <thead><tr><th>Category</th><th>Type</th><th class="num">Count</th><th class="num">Total</th></tr></thead>
    <tbody>${categoryRows}</tbody>
  </table>

  <h2>Transactions (${data.transactions.length})</h2>
  <table>
    <thead><tr><th>Date</th><th>Description</th><th>Category</th><th>Type</th><th class="num">Amount</th><th>Notes</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`
}

export async function buildXlsxReport(data: ReportData): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Financial Encoder'

  const summary = workbook.addWorksheet('Summary')
  summary.columns = [
    { header: 'Metric', key: 'metric', width: 22 },
    { header: 'Value', key: 'value', width: 20 },
  ]
  const t = data.totals
  const summaryRows: [string, string | number][] = [
    ['Report', data.title],
    ['Period', data.periodLabel],
    ['Generated', data.generatedAt],
    ['Income', t.income],
    ['Expense', t.expense],
    ['Capital', t.capital],
    ['Withdrawal', t.withdrawal],
    ['Net', t.net],
    ['Transaction count', t.count],
  ]
  summaryRows.forEach((row) => summary.addRow(row))

  const categories = workbook.addWorksheet('Category Breakdown')
  categories.columns = [
    { header: 'Category', key: 'category', width: 28 },
    { header: 'Type', key: 'type', width: 14 },
    { header: 'Count', key: 'count', width: 10 },
    { header: 'Total', key: 'total', width: 16 },
  ]
  for (const cat of data.categories) {
    categories.addRow({ category: cat.category_name, type: cat.type, count: cat.count, total: cat.total })
  }

  const sheet = workbook.addWorksheet('Transactions')
  sheet.columns = [
    { header: 'Date', key: 'date', width: 12 },
    { header: 'Description', key: 'description', width: 34 },
    { header: 'Category', key: 'category', width: 24 },
    { header: 'Type', key: 'type', width: 14 },
    { header: 'Amount', key: 'amount', width: 16 },
    { header: 'Notes', key: 'notes', width: 30 },
  ]
  for (const tx of data.transactions) {
    sheet.addRow({
      date: tx.date,
      description: tx.description,
      category: tx.category_name,
      type: tx.type,
      amount: tx.amount,
      notes: tx.notes ?? '',
    })
  }

  return (await workbook.xlsx.writeBuffer()) as unknown as Buffer
}

export function summarizeReport(data: ReportData): { rows: number; bytes: number } {
  return { rows: data.transactions.length, bytes: 0 }
}

export function validateExportFilter(raw: unknown): CalculationFilter {
  if (raw === undefined || raw === null) {
    return {}
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new AppError('VALIDATION_ERROR', 'Invalid export filter.')
  }
  const input = raw as Record<string, unknown>
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
  const filter: CalculationFilter = {}

  if (input.date_from !== undefined) {
    if (typeof input.date_from !== 'string' || !DATE_RE.test(input.date_from)) {
      throw new AppError('VALIDATION_ERROR', 'A valid date_from (YYYY-MM-DD) is required.')
    }
    filter.date_from = input.date_from
  }
  if (input.date_to !== undefined) {
    if (typeof input.date_to !== 'string' || !DATE_RE.test(input.date_to)) {
      throw new AppError('VALIDATION_ERROR', 'A valid date_to (YYYY-MM-DD) is required.')
    }
    filter.date_to = input.date_to
  }
  if (filter.date_from && filter.date_to && filter.date_from > filter.date_to) {
    throw new AppError('VALIDATION_ERROR', 'date_from must not be after date_to.')
  }
  return filter
}