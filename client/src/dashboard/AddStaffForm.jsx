import { useState } from 'react'
import { api } from '../api.js'
import { ROLE_LABELS } from '../format.js'

const EMPTY_FORM = {
  fullName: '',
  email: '',
  phone: '',
  startDate: '',
  role: 'employee',
  alreadyWorking: false,
}

// Only admins see this form (the server checks too), so every role is offered.
function AddStaffForm({ onAdded, onCancel }) {
  const [form, setForm] = useState(EMPTY_FORM)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  function update(field) {
    return (event) => {
      const { type, checked, value } = event.target
      setForm((current) => ({ ...current, [field]: type === 'checkbox' ? checked : value }))
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setSaving(true)
    try {
      const { person } = await api('/staff', { method: 'POST', body: form })
      onAdded(person)
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <form className="panel add-form" onSubmit={handleSubmit} aria-label="Add a person">
      <h2>Add a person</h2>
      <div className="form-grid">
        <label className="field">
          Full name
          <input value={form.fullName} onChange={update('fullName')} required autoFocus />
        </label>
        <label className="field">
          Email <span className="optional">(optional)</span>
          <input type="email" value={form.email} onChange={update('email')} />
        </label>
        <label className="field">
          Phone <span className="optional">(optional)</span>
          <input type="tel" value={form.phone} onChange={update('phone')} />
        </label>
        <label className="field">
          Start date <span className="optional">(optional)</span>
          <input type="date" value={form.startDate} onChange={update('startDate')} />
        </label>
        <label className="field">
          Role
          <select value={form.role} onChange={update('role')}>
            {Object.keys(ROLE_LABELS).map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="checkbox">
        <input type="checkbox" checked={form.alreadyWorking} onChange={update('alreadyWorking')} />
        Already working here (skip onboarding, add to Active staff)
      </label>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <div className="form-actions">
        <button className="button" type="submit" disabled={saving}>
          {saving ? 'Adding…' : 'Add person'}
        </button>
        <button className="button button-secondary" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}

export default AddStaffForm
