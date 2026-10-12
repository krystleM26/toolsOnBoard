import { useState } from 'react'
import { formatDateTime } from '../format.js'

function NotesCard({ notes, can, onAdd }) {
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      await onAdd(text)
      setText('')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="panel card-section" aria-label="Notes">
      <h2>Notes</h2>
      {can.writeNotes && (
        <form onSubmit={handleSubmit} className="note-form">
          <label className="visually-hidden" htmlFor="new-note">
            New note
          </label>
          <textarea
            id="new-note"
            rows={3}
            placeholder="Add a note…"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="button button-small" type="submit" disabled={saving || !text.trim()}>
            {saving ? 'Saving…' : 'Add note'}
          </button>
        </form>
      )}
      {notes.length === 0 ? (
        <p className="muted">No notes yet.</p>
      ) : (
        <ul className="timeline">
          {notes.map((note) => (
            <li key={note.id}>
              <div className="muted task-meta">
                {formatDateTime(note.created_at)} · {note.author_name ?? 'Former staff member'}
              </div>
              <p className="note-body">{note.body}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default NotesCard
