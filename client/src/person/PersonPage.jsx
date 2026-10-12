import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { api } from '../api.js'
import { formatDate, ROLE_LABELS, STATUS_LABELS } from '../format.js'
import ChecklistCard from './ChecklistCard.jsx'
import DetailsCard from './DetailsCard.jsx'
import DocumentsCard from './DocumentsCard.jsx'
import HistoryCard from './HistoryCard.jsx'
import NotesCard from './NotesCard.jsx'
import StatusActions from './StatusActions.jsx'
import SupervisorsCard from './SupervisorsCard.jsx'
import './PersonPage.css'

// Today as 'YYYY-MM-DD' in the viewer's time zone, to compare with dates.
function today() {
  const now = new Date()
  return [now.getFullYear(), now.getMonth() + 1, now.getDate()].map((n) => String(n).padStart(2, '0')).join('-')
}

// One person's page: details, supervisors, checklist, documents, notes, history.
// After any change it reloads the whole page from the server, so everything
// (including the history) always shows what's really saved.
function PersonPage() {
  const { id } = useParams()
  const location = useLocation()
  const backTo = location.state?.backTo ?? '/'

  const [loaded, setPage] = useState(null)
  const [error, setError] = useState('')
  // When moving from one person to another, ignore the previous person's data
  // until the new page arrives.
  const page = loaded && String(loaded.person.id) === id ? loaded : null

  useEffect(() => {
    // If we move to another person before this answer arrives, ignore it.
    let stale = false
    api(`/staff/${id}`)
      .then((data) => {
        if (stale) return
        setPage(data)
        setError('')
      })
      .catch((err) => !stale && setError(err.status === 404 ? 'notFound' : err.message))
    return () => {
      stale = true
    }
  }, [id])

  // Each change: send it, then reload the page. Errors go back to the card that asked.
  async function change(path, method, body) {
    await api(`/staff/${id}${path}`, { method, body })
    setPage(await api(`/staff/${id}`))
  }

  const backLink = (
    <Link className="back-link" to={backTo}>
      ← Back to staff
    </Link>
  )

  if (error === 'notFound') {
    return (
      <>
        {backLink}
        <p className="empty">This person wasn’t found, or you don’t have access to their page.</p>
      </>
    )
  }
  if (error && !page) {
    return (
      <>
        {backLink}
        <p className="error" role="alert">
          {error}
        </p>
      </>
    )
  }
  if (!page) return <p className="empty">Loading…</p>

  const { person, can } = page

  return (
    <>
      {backLink}

      <header className="person-header">
        <div>
          <h1 className="page-title">{person.full_name}</h1>
          <p className="person-subtitle">
            {ROLE_LABELS[person.role]} · <span className={`status-badge status-${person.status}`}>{STATUS_LABELS[person.status]}</span>
            {person.start_date && (
              <>
                {' '}
                · {person.start_date <= today() ? 'Started' : 'Starts'} {formatDate(person.start_date)}
              </>
            )}
          </p>
        </div>
        {can.changeStatus && (
          <StatusActions person={person} onChangeStatus={(status) => change('', 'PATCH', { status })} />
        )}
      </header>

      {person.status === 'archived' && (
        <p className="archived-banner">
          Archived: this person can’t sign in and isn’t shown on the dashboard.
        </p>
      )}

      <div className="person-grid">
        <DetailsCard person={person} can={can} onSave={(changes) => change('', 'PATCH', changes)} />
        <SupervisorsCard
          supervisors={page.supervisors}
          options={page.supervisorOptions}
          can={can}
          onSave={(supervisorIds) => change('/supervisors', 'PUT', { supervisorIds })}
        />
        <ChecklistCard
          checklist={page.checklist}
          can={can}
          onToggle={(taskId, done) => change(`/tasks/${taskId}`, 'PUT', { done })}
        />
        <DocumentsCard documents={page.documents} warningDays={page.warningDays} />
        <NotesCard notes={page.notes} can={can} onAdd={(body) => change('/notes', 'POST', { body })} />
        <HistoryCard history={page.history} />
      </div>
    </>
  )
}

export default PersonPage
