import type { IconName } from './components/ui/Icon'

export interface NavItem {
  path: string
  label: string
  icon: IconName
}

export const NAV_ITEMS: NavItem[] = [
  { path: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { path: '/transactions', label: 'Transactions', icon: 'transactions' },
  { path: '/income', label: 'Income', icon: 'income' },
  { path: '/expenses', label: 'Expenses', icon: 'expenses' },
  { path: '/capital', label: 'Capital', icon: 'capital' },
  { path: '/cash-flow', label: 'Cash Flow', icon: 'cashflow' },
  { path: '/reports', label: 'Reports', icon: 'reports' },
  { path: '/import', label: 'Import', icon: 'import' },
  { path: '/documents', label: 'Documents', icon: 'documents' },
  { path: '/settings', label: 'Settings', icon: 'settings' },
]