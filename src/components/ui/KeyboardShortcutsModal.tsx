import Modal from './Modal'

interface KeyboardShortcutsModalProps {
  open: boolean
  onClose: () => void
}

interface ShortcutItem {
  keys: string[]
  description: string
  category: 'General' | 'Navigation'
}

const SHORTCUTS: ShortcutItem[] = [
  { keys: ['N'], description: 'Add new transaction', category: 'General' },
  { keys: ['/'], description: 'Quick search transactions', category: 'General' },
  { keys: ['?'], description: 'View keyboard shortcuts', category: 'General' },
  { keys: ['Esc'], description: 'Close dialog / modal', category: 'General' },

  { keys: ['G', 'D'], description: 'Go to Dashboard', category: 'Navigation' },
  { keys: ['G', 'T'], description: 'Go to Transactions', category: 'Navigation' },
  { keys: ['G', 'I'], description: 'Go to Income', category: 'Navigation' },
  { keys: ['G', 'E'], description: 'Go to Expenses', category: 'Navigation' },
  { keys: ['G', 'C'], description: 'Go to Capital', category: 'Navigation' },
  { keys: ['G', 'F'], description: 'Go to Cash Flow', category: 'Navigation' },
  { keys: ['G', 'R'], description: 'Go to Reports', category: 'Navigation' },
  { keys: ['G', 'M'], description: 'Go to Import', category: 'Navigation' },
  { keys: ['G', 'O'], description: 'Go to Documents (OCR)', category: 'Navigation' },
  { keys: ['G', 'S'], description: 'Go to Settings', category: 'Navigation' },
]

export default function KeyboardShortcutsModal({ open, onClose }: KeyboardShortcutsModalProps): React.JSX.Element | null {
  if (!open) return null

  const generalShortcuts = SHORTCUTS.filter((s) => s.category === 'General')
  const navShortcuts = SHORTCUTS.filter((s) => s.category === 'Navigation')

  return (
    <Modal
      open={open}
      title="Keyboard Shortcuts"
      onClose={onClose}
      footer={
        <button type="button" className="btn btn--primary" onClick={onClose}>
          Got it
        </button>
      }
    >
      <div className="shortcuts-modal">
        <div className="shortcuts-group">
          <h4 className="shortcuts-group__title">General Actions</h4>
          <div className="shortcuts-list">
            {generalShortcuts.map((item, idx) => (
              <div key={idx} className="shortcut-row">
                <span className="shortcut-row__desc">{item.description}</span>
                <div className="shortcut-row__keys">
                  {item.keys.map((k, ki) => (
                    <kbd key={ki} className="shortcut-kbd">{k}</kbd>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="shortcuts-group">
          <h4 className="shortcuts-group__title">Navigation (Press sequentially)</h4>
          <div className="shortcuts-list">
            {navShortcuts.map((item, idx) => (
              <div key={idx} className="shortcut-row">
                <span className="shortcut-row__desc">{item.description}</span>
                <div className="shortcut-row__keys">
                  {item.keys.map((k, ki) => (
                    <span key={ki} className="shortcut-chord">
                      <kbd className="shortcut-kbd">{k}</kbd>
                      {ki < item.keys.length - 1 && <span className="shortcut-then">then</span>}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  )
}
