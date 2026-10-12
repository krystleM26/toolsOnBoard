import { documentStatus, formatDate, ROLE_LABELS } from '../format.js'

const TONE_ICONS = { bad: '✕', warn: '⚠', ok: '✓' }

function ChecklistProgress({ done, total }) {
  return (
    <div className="progress">
      <div
        className="progress-track"
        role="progressbar"
        aria-label="Checklist progress"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
      >
        <div className="progress-fill" style={{ width: total ? `${(done / total) * 100}%` : 0 }} />
      </div>
      <span className="progress-text">
        {done}/{total}
      </span>
    </div>
  )
}

function DocumentCell({ person }) {
  const { tone, text, extra } = documentStatus(person)
  return (
    <div className={`doc-status tone-${tone}`}>
      <span aria-hidden="true">{TONE_ICONS[tone]}</span> {text}
      {extra && <div className="doc-extra">{extra}</div>}
    </div>
  )
}

function StaffTable({ staff }) {
  if (staff.length === 0) {
    return <p className="empty">No one to show here.</p>
  }

  return (
    <div className="table-scroll">
      <table className="staff-table">
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Role</th>
            <th scope="col">Start date</th>
            <th scope="col">Checklist</th>
            <th scope="col">Documents</th>
          </tr>
        </thead>
        <tbody>
          {staff.map((person) => (
            <tr key={person.id}>
              <td>
                <div className="person-name">{person.full_name}</div>
                {person.email && <div className="person-email">{person.email}</div>}
              </td>
              <td>{ROLE_LABELS[person.role]}</td>
              <td>{formatDate(person.start_date) || '—'}</td>
              <td>
                <ChecklistProgress done={person.tasks_done} total={person.tasks_total} />
              </td>
              <td>
                <DocumentCell person={person} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default StaffTable
