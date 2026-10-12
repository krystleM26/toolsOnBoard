import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { ROLE_LABELS } from '../format.js'
import AddStaffForm from './AddStaffForm.jsx'
import AttentionSummary from './AttentionSummary.jsx'
import StaffTable from './StaffTable.jsx'
import './Dashboard.css'

const TABS = [
  { id: 'onboarding', label: 'Onboarding' },
  { id: 'active', label: 'Active staff' },
]

// How long to wait after the last keystroke before searching.
const SEARCH_DELAY_MS = 300

function Dashboard({ user, onLogout }) {
  const [tab, setTab] = useState('onboarding')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [summary, setSummary] = useState(null)
  const [list, setList] = useState(null)
  const [error, setError] = useState('')
  const [adding, setAdding] = useState(false)
  const [notice, setNotice] = useState('')
  // Bumped after a change, to re-fetch everything.
  const [refreshKey, setRefreshKey] = useState(0)

  const canAdd = user.role === 'admin' || user.role === 'manager'

  // Wait until typing pauses before searching, instead of on every keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim())
      setPage(1)
    }, SEARCH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [searchInput])

  useEffect(() => {
    api('/staff/summary')
      .then(setSummary)
      .catch((err) => setError(err.message))
  }, [refreshKey])

  useEffect(() => {
    // If the tab or search changes before this request finishes,
    // ignore its (now out-of-date) answer.
    let stale = false
    const params = new URLSearchParams({ status: tab, page })
    if (search) params.set('search', search)

    api(`/staff?${params}`)
      .then((data) => !stale && setList(data))
      .catch((err) => !stale && setError(err.message))
    return () => {
      stale = true
    }
  }, [tab, search, page, refreshKey])

  function switchTab(id) {
    setTab(id)
    setPage(1)
    setList(null)
  }

  function handleAdded(person) {
    setAdding(false)
    setNotice(`Added ${person.full_name}.`)
    switchTab(person.status)
    setRefreshKey((key) => key + 1)
  }

  const totals = summary && { onboarding: summary.onboarding.total, active: summary.active.total }
  const lastPage = list ? Math.max(1, Math.ceil(list.total / list.pageSize)) : 1

  return (
    <div className="dashboard">
      <header className="topbar">
        <div>
          <p className="eyebrow">{user.organization_name}</p>
          <h1 className="topbar-title">{user.role === 'supervisor' ? 'Your team' : 'Staff'}</h1>
        </div>
        <div className="topbar-user">
          <span>
            {user.full_name} · {ROLE_LABELS[user.role]}
          </span>
          <button className="button button-secondary button-small" onClick={onLogout}>
            Log out
          </button>
        </div>
      </header>

      <main className="dashboard-body">
        <div className="tabs" role="tablist" aria-label="Staff lists">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              className={`tab ${tab === id ? 'tab-selected' : ''}`}
              onClick={() => switchTab(id)}
            >
              {label}
              {totals && (
                <>
                  {' '}
                  <span className="tab-count">{totals[id]}</span>
                </>
              )}
            </button>
          ))}
        </div>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="notice" role="status">
            {notice}
          </p>
        )}

        {summary && <AttentionSummary tab={tab} summary={summary} />}

        <div className="toolbar">
          <input
            type="search"
            className="search"
            placeholder="Search by name or email"
            aria-label="Search by name or email"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          {canAdd && !adding && (
            <button
              className="button"
              onClick={() => {
                setAdding(true)
                setNotice('')
              }}
            >
              + Add person
            </button>
          )}
        </div>

        {adding && <AddStaffForm viewer={user} onAdded={handleAdded} onCancel={() => setAdding(false)} />}

        {list === null ? (
          <p className="empty">Loading…</p>
        ) : (
          <>
            <StaffTable staff={list.staff} />
            {list.total > list.pageSize && (
              <nav className="pager" aria-label="Pages">
                <button
                  className="button button-secondary button-small"
                  onClick={() => setPage(page - 1)}
                  disabled={page === 1}
                >
                  ← Previous
                </button>
                <span>
                  Page {page} of {lastPage} · {list.total} people
                </span>
                <button
                  className="button button-secondary button-small"
                  onClick={() => setPage(page + 1)}
                  disabled={page === lastPage}
                >
                  Next →
                </button>
              </nav>
            )}
          </>
        )}
      </main>
    </div>
  )
}

export default Dashboard
