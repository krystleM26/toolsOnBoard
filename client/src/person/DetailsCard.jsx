import { useState } from 'react'
import { formatDate, ROLE_LABELS } from '../format.js'

// A person's contact details and role, with an edit form for admins.
function DetailsCard({ person, can, onSave }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  function startEditing() {
    setForm({
      fullName: person.full_name,
      email: person.email ?? '',
      phone: person.phone ?? '',
      startDate: person.start_date ?? '',
      role: person.role,
    })
    setError('')
    setEditing(true)
  }

  function update(field) {
    return (event) => setForm((current) => ({ ...current, [field]: event.target.value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    // Only send the role if this viewer may change it (the server would refuse).
    const changes = { ...form }
    if (!can.changeRole) delete changes.role
    try {
      await onSave(changes)
      setEditing(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <section className="panel card-section" aria-label="Details">
        <form onSubmit={handleSubmit} aria-label="Edit details">
          <h2>Details</h2>
          <div className="form-grid">
            <label className="field">
              Full name
              <input value={form.fullName} onChange={update('fullName')} required />
            </label>
            <label className="field">
              Email
              <input type="email" value={form.email} onChange={update('email')} />
            </label>
            <label className="field">
              Phone
              <input type="tel" value={form.phone} onChange={update('phone')} />
            </label>
            <label className="field">
              Start date
              <input type="date" value={form.startDate} onChange={update('startDate')} />
            </label>
            {can.changeRole && (
              <label className="field">
                Role
                <select value={form.role} onChange={update('role')}>
                  {Object.entries(ROLE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="form-actions">
            <button className="button" type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button className="button button-secondary" type="button" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </form>
      </section>
    )
  }

  return (
    <section className="panel card-section" aria-label="Details">
      <div className="card-header">
        <h2>Details</h2>
        {can.editDetails && (
          <button className="link-button" onClick={startEditing}>
            Edit
          </button>
        )}
      </div>
      <dl className="details">
        <dt>Email</dt>
        <dd>{person.email || '—'}</dd>
        <dt>Phone</dt>
        <dd>{person.phone || '—'}</dd>
        <dt>Start date</dt>
        <dd>{formatDate(person.start_date) || '—'}</dd>
        <dt>Role</dt>
        <dd>{ROLE_LABELS[person.role]}</dd>
      </dl>
    </section>
  )
}

export default DetailsCard
