import type { IconName } from './components/ui/Icon'

export interface NavItem {
  path: string
  label: string
  icon: IconName
  shortcut?: string
}

export interface NavSection {
  title: string
  items: NavItem[]
}

export const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Overview',
    items: [
      { path: '/dashboard', label: 'Dashboard', icon: 'dashboard', shortcut: 'G D' },
      { path: '/transactions', label: 'Transactions', icon: 'transactions', shortcut: 'G T' },
      { path: '/cash-flow', label: 'Cash Flow', icon: 'cashflow', shortcut: 'G F' },
    ],
  },
  {
    title: 'Ledgers',
    items: [
      { path: '/income', label: 'Income', icon: 'income', shortcut: 'G I' },
      { path: '/expenses', label: 'Expenses', icon: 'expenses', shortcut: 'G E' },
      { path: '/capital', label: 'Capital', icon: 'capital', shortcut: 'G C' },
    ],
  },
  {
    title: 'Data & Tools',
    items: [
      { path: '/documents', label: 'Documents (OCR)', icon: 'documents', shortcut: 'G O' },
      { path: '/import', label: 'Import Data', icon: 'import', shortcut: 'G M' },
      { path: '/reports', label: 'Reports & Export', icon: 'reports', shortcut: 'G R' },
    ],
  },
  {
    title: 'System',
    items: [
      { path: '/settings', label: 'Settings', icon: 'settings', shortcut: 'G S' },
    ],
  },
]

export const NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap((s) => s.items)