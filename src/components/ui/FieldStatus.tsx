interface FieldStatusProps {
  active: boolean
  saved: boolean
}

function FieldStatus({ active, saved }: FieldStatusProps): React.JSX.Element {
  return (
    <span className="field__status" aria-live="polite">
      {active ? <span className="spinner spinner--xs" aria-label="Saving" /> : null}
      {saved ? <span className="field__status-saved">Saved</span> : null}
    </span>
  )
}

export default FieldStatus