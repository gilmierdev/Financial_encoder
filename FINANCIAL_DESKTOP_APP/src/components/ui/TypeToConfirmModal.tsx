import { useEffect, useState, type ReactNode } from 'react'
import Modal from './Modal'

interface TypeToConfirmModalProps {
  open: boolean
  title: string
  message: ReactNode
  confirmLabel: string
  requiredText: string
  busy?: boolean
  busyLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

function TypeToConfirmModal({
  open,
  title,
  message,
  confirmLabel,
  requiredText,
  busy = false,
  busyLabel,
  onConfirm,
  onCancel,
}: TypeToConfirmModalProps): React.JSX.Element {
  const [typed, setTyped] = useState('')
  const matches = typed === requiredText

  useEffect(() => {
    if (open) {
      setTyped('')
    }
  }, [open])

  const close = (): void => {
    if (!busy) {
      onCancel()
    }
  }

  return (
    <Modal
      open={open}
      title={`⚠️ ${title}`}
      onClose={close}
      footer={
        <>
          <button type="button" className="btn btn--secondary" onClick={close} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn btn--danger" onClick={onConfirm} disabled={busy || !matches}>
            {busy && busyLabel ? busyLabel : confirmLabel}
          </button>
        </>
      }
    >
      <div className="confirm-dialog">
        <p className="confirm-dialog__lead">This action cannot be undone.</p>
        <div className="confirm-dialog__detail">{message}</div>
        <div className="confirm-dialog__type">
          <span className="confirm-dialog__label">To confirm, type:</span>
          <code className="confirm-dialog__phrase">{requiredText}</code>
          <input
            type="text"
            className={`text-input confirm-dialog__input${matches ? ' is-match' : ''}`}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            maxLength={requiredText.length}
            disabled={busy}
            data-autofocus
            aria-label={`Type ${requiredText} to confirm`}
          />
        </div>
      </div>
    </Modal>
  )
}

export default TypeToConfirmModal