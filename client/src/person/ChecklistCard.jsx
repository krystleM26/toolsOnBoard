import { useState } from 'react'
import { formatDay } from '../format.js'

// The onboarding checklist. Admins can tick items on the person's behalf.
function ChecklistCard({ checklist, can, onToggle }) {
  const [busyTaskId, setBusyTaskId] = useState(null)
  const [error, setError] = useState('')
  const done = checklist.filter((task) => task.done).length

  async function toggle(task) {
    setBusyTaskId(task.id)
    setError('')
    try {
      await onToggle(task.id, !task.done)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyTaskId(null)
    }
  }

  return (
    <section className="panel card-section" aria-label="Checklist">
      <div className="card-header">
        <h2>Checklist</h2>
        <span className="muted">
          {done} of {checklist.length} done
        </span>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <ul className="checklist">
        {checklist.map((task) => {
          const doneNote = task.done && (
            <span className="muted task-meta">
              Done {formatDay(task.completed_at)}
              {task.completed_by_name && ` by ${task.completed_by_name}`}
            </span>
          )
          return (
            <li key={task.id} className={task.done ? 'task-done' : ''}>
              {can.tickTasks ? (
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={task.done}
                    disabled={busyTaskId === task.id}
                    onChange={() => toggle(task)}
                  />
                  <span>
                    {task.title}
                    {doneNote}
                  </span>
                </label>
              ) : (
                <div className="checkbox">
                  <span aria-hidden="true" className={task.done ? 'tone-ok' : 'muted'}>
                    {task.done ? '✓' : '○'}
                  </span>
                  <span>
                    {task.title}
                    <span className="visually-hidden">{task.done ? ' (done)' : ' (not done)'}</span>
                    {doneNote}
                  </span>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

export default ChecklistCard
