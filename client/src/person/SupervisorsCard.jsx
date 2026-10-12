import { useState } from 'react'
import { ROLE_LABELS } from '../format.js'

// Who supervises this person, with checkboxes for admins to change it.
function SupervisorsCard({ supervisors, options, can, onSave }) {
  const [editing, setEditing] = useState(false)
  const [chosen, setChosen] = useState([])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  function startEditing() {
    setChosen(supervisors.map((s) => s.id))
    setError('')
    setEditing(true)
  }

  function toggle(id) {
    setChosen((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]))
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      await onSave(chosen)
      setEditing(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="panel card-section" aria-label="Supervisors">
      <div className="card-header">
        <h2>Supervisors</h2>
        {can.changeSupervisors && !editing && (
          <button className="link-button" onClick={startEditing}>
            Change
          </button>
        )}
      </div>

      {editing ? (
        <>
          <fieldset className="choice-list">
            <legend className="visually-hidden">Choose supervisors</legend>
            {options.map((option) => (
              <label key={option.id} className="checkbox">
                <input type="checkbox" checked={chosen.includes(option.id)} onChange={() => toggle(option.id)} />
                {option.full_name} <span className="muted">· {ROLE_LABELS[option.role]}</span>
              </label>
            ))}
          </fieldset>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="form-actions">
            <button className="button" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button className="button button-secondary" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </>
      ) : supervisors.length ? (
        <ul className="plain-list">
          {supervisors.map((s) => (
            <li key={s.id}>
              {s.full_name} <span className="muted">· {ROLE_LABELS[s.role]}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">No supervisor assigned.</p>
      )}
    </section>
  )
}

export default SupervisorsCard
