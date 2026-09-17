import type Database from 'better-sqlite3'
import { logger } from '../services/logger.service'

interface DefaultCategory {
  name: string
  type: 'income' | 'expense' | 'capital' | 'withdrawal' | 'asset' | 'liability'
}

const DEFAULT_CATEGORIES: DefaultCategory[] = [
  // Income
  { name: 'Salary', type: 'income' },
  { name: 'Business Income', type: 'income' },
  { name: 'Sales', type: 'income' },
  { name: 'Interest', type: 'income' },
  { name: 'Other Income', type: 'income' },
  // Expenses
  { name: 'Food', type: 'expense' },
  { name: 'Utilities', type: 'expense' },
  { name: 'Transportation', type: 'expense' },
  { name: 'Supplies', type: 'expense' },
  { name: 'Rent', type: 'expense' },
  { name: 'Internet', type: 'expense' },
  { name: 'Salary Expense', type: 'expense' },
  { name: 'Equipment', type: 'expense' },
  { name: 'Other Expense', type: 'expense' },
  // Capital
  { name: 'Owner Investment', type: 'capital' },
  { name: 'Other Investor', type: 'capital' },
  // Withdrawals
  { name: 'Owner Draw', type: 'withdrawal' },
  // Assets
  { name: 'Cash on Hand', type: 'asset' },
  { name: 'Bank Account', type: 'asset' },
  { name: 'Accounts Receivable', type: 'asset' },
  // Liabilities
  { name: 'Accounts Payable', type: 'liability' },
  { name: 'Loan Payable', type: 'liability' },
]

/** Inserts the default categories the first time the database is created. */
export function seedIfEmpty(db: Database.Database): void {
  const count = (db.prepare('SELECT COUNT(*) AS n FROM categories').get() as { n: number }).n
  if (count > 0) {
    return
  }

  const insert = db.prepare(
    'INSERT INTO categories (name, type, is_default) VALUES (?, ?, 1)',
  )
  const apply = db.transaction(() => {
    for (const category of DEFAULT_CATEGORIES) {
      insert.run(category.name, category.type)
    }
  })
  apply()
  logger.info(`seeded ${DEFAULT_CATEGORIES.length} default categories`)
}