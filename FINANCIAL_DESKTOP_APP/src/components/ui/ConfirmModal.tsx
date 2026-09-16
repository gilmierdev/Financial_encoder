import type { ReactNode } from 'react'
import Modal from './Modal'

interface ConfirmModalProps {
  open: boolean
  title: string
  message: ReactNode
  confirmLabel?: string
  busy?: boolean
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  busy = false,
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps): React.JSX.Element {
  return (
    <Modal
      open={open}
      title={title}
      onClose={() => { if (!busy) { onCancel() } }}
      footer={
        <>
          <button type="button" className="btn btn--secondary" data-autofocus onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="button" className={`btn ${danger ? 'btn--danger' : 'btn--primary'}`} onClick={onConfirm} disabled={busy}>
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="modal-message">{message}</div>
    </Modal>
  )
}

export default ConfirmModal