import { useState } from 'react'

// Buttons that move someone between Onboarding, Active and Archived (admins only).
// Archiving asks for confirmation first, right on the page.
function StatusActions({ person, onChangeStatus }) {
  const [confirmingArchive, setConfirmingArchive] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function change(status) {
    setSaving(true)
    setError('')
    try {
      await onChangeStatus(status)
      setConfirmingArchive(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (confirmingArchive) {
    return (
      <div className="confirm" role="alertdialog" aria-label="Confirm archive">
        <p>
          Archive <strong>{person.full_name}</strong>? They won’t be able to sign in and won’t appear on the
          dashboard. Their records are kept, and you can restore them later.
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button className="button button-danger" onClick={() => change('archived')} disabled={saving}>
            {saving ? 'Archiving…' : 'Yes, archive'}
          </button>
          <button className="button button-secondary" onClick={() => setConfirmingArchive(false)}>
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="status-actions">
      {person.status === 'onboarding' && (
        <button className="button button-small" onClick={() => change('active')} disabled={saving}>
          Mark onboarding complete
        </button>
      )}
      {person.status === 'archived' ? (
        <button className="button button-small" onClick={() => change('active')} disabled={saving}>
          Restore
        </button>
      ) : (
        <button className="button button-secondary button-small" onClick={() => setConfirmingArchive(true)}>
          Archive
        </button>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

export default StatusActions
