import { useEffect, useRef, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import UpdateBanner from '../update/UpdateBanner'
import TransactionForm from '../transactions/TransactionForm'
import KeyboardShortcutsModal from '../ui/KeyboardShortcutsModal'
import { useToast } from '../../contexts/ToastContext'
import type { Transaction } from '../../../electron/types/ipc'

function AppShell(): React.JSX.Element {
  const location = useLocation()
  const navigate = useNavigate()
  const { success } = useToast()
  const isSettings = location.pathname.startsWith('/settings')

  const [addTxOpen, setAddTxOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const chordPrefixRef = useRef<string | null>(null)
  const chordTimerRef = useRef<number | null>(null)

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      const activeEl = document.activeElement
      const isInput =
        activeEl instanceof HTMLInputElement ||
        activeEl instanceof HTMLTextAreaElement ||
        activeEl instanceof HTMLSelectElement ||
        activeEl?.getAttribute('contenteditable') === 'true'

      if (e.key === 'Escape') {
        if (shortcutsOpen) setShortcutsOpen(false)
        if (addTxOpen) setAddTxOpen(false)
        return
      }

      if (isInput) return

      // Handle two-key chord navigation (e.g., G then D)
      if (chordPrefixRef.current === 'g') {
        chordPrefixRef.current = null
        if (chordTimerRef.current) window.clearTimeout(chordTimerRef.current)

        const key = e.key.toLowerCase()
        const navMap: Record<string, string> = {
          d: '/dashboard',
          t: '/transactions',
          i: '/income',
          e: '/expenses',
          c: '/capital',
          f: '/cash-flow',
          r: '/reports',
          m: '/import',
          o: '/documents',
          s: '/settings',
        }

        if (navMap[key]) {
          e.preventDefault()
          navigate(navMap[key])
          return
        }
      }

      if (e.key.toLowerCase() === 'g' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        chordPrefixRef.current = 'g'
        if (chordTimerRef.current) window.clearTimeout(chordTimerRef.current)
        chordTimerRef.current = window.setTimeout(() => {
          chordPrefixRef.current = null
        }, 1200)
        return
      }

      if ((e.key === 'n' || e.key === 'N') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault()
        setAddTxOpen(true)
        return
      }

      if (e.key === '/' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        const searchInput = document.getElementById('global-search-input')
        if (searchInput) {
          searchInput.focus()
        }
        return
      }

      if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        setShortcutsOpen(true)
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      if (chordTimerRef.current) window.clearTimeout(chordTimerRef.current)
    }
  }, [addTxOpen, shortcutsOpen, navigate])

  const handleGlobalTxSaved = (saved: Transaction): void => {
    setAddTxOpen(false)
    success(`Transaction "${saved.description}" saved!`)
    window.dispatchEvent(new CustomEvent('transaction-saved', { detail: saved }))
  }

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="app-shell__main">
        <TopBar
          onOpenAddTransaction={() => setAddTxOpen(true)}
          onOpenShortcuts={() => setShortcutsOpen(true)}
        />
        {isSettings ? <UpdateBanner /> : null}
        <main className="app-shell__content">
          <Outlet />
        </main>
      </div>

      <TransactionForm
        open={addTxOpen}
        transaction={null}
        onClose={() => setAddTxOpen(false)}
        onSaved={handleGlobalTxSaved}
      />

      <KeyboardShortcutsModal
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
      />
    </div>
  )
}

export default AppShell