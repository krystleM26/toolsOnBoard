import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { api } from '../api.js'
import AddStaffForm from './AddStaffForm.jsx'
import AttentionSummary from './AttentionSummary.jsx'
import StaffTable from './StaffTable.jsx'

const TABS = [
  { id: 'onboarding', label: 'Onboarding' },
  { id: 'active', label: 'Active staff' },
]

// How long to wait after the last keystroke before searching.
const SEARCH_DELAY_MS = 300

function Dashboard({ user }) {
  // The tab, search and page live in the address (e.g. /?tab=active&q=cara&page=2),
  // so going back from someone's page returns to exactly the same view.
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'active' ? 'active' : 'onboarding'
  const search = params.get('q') ?? ''
  const page = Math.max(1, Number(params.get('page')) || 1)

  const [searchInput, setSearchInput] = useState(search)
  const [summary, setSummary] = useState(null)
  const [list, setList] = useState(null)
  const [error, setError] = useState('')
  const [adding, setAdding] = useState(false)
  const [notice, setNotice] = useState('')
  // Bumped after a change, to re-fetch everything.
  const [refreshKey, setRefreshKey] = useState(0)

  const canAdd = user.role === 'admin'

  // Updates the address. Empty values (and page 1) are left out to keep it tidy.
  // Works from the latest address, so a late search can't undo a tab switch.
  function updateParams(changes, { replace = false } = {}) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        for (const [key, value] of Object.entries(changes)) {
          if (value === '' || value === 1) next.delete(key)
          else next.set(key, value)
        }
        return next
      },
      { replace },
    )
  }

  // Wait until typing pauses before searching, instead of on every keystroke.
  useEffect(() => {
    const trimmed = searchInput.trim()
    if (trimmed === search) return
    const timer = setTimeout(() => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current)
          if (trimmed) next.set('q', trimmed)
          else next.delete('q')
          next.delete('page') // new search starts on page 1
          return next
        },
        // replace: typing shouldn't add a "back" step for every search.
        { replace: true },
      )
    }, SEARCH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [searchInput, search, setParams])

  useEffect(() => {
    api('/staff/summary')
      .then(setSummary)
      .catch((err) => setError(err.message))
  }, [refreshKey])

  useEffect(() => {
    // If the tab or search changes before this request finishes,
    // ignore its (now out-of-date) answer.
    let stale = false
    const query = new URLSearchParams({ status: tab, page })
    if (search) query.set('search', search)

    api(`/staff?${query}`)
      .then((data) => !stale && setList(data))
      .catch((err) => !stale && setError(err.message))
    return () => {
      stale = true
    }
  }, [tab, search, page, refreshKey])

  function switchTab(id) {
    if (id === tab) return
    setList(null)
    updateParams({ tab: id === 'onboarding' ? '' : id, page: 1 })
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
    <>
      <h1 className="page-title">{user.role === 'supervisor' ? 'Your team' : 'Staff'}</h1>

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

      {adding && <AddStaffForm onAdded={handleAdded} onCancel={() => setAdding(false)} />}

      {list === null ? (
        <p className="empty">Loading…</p>
      ) : (
        <>
          <StaffTable staff={list.staff} />
          {list.total > list.pageSize && (
            <nav className="pager" aria-label="Pages">
              <button
                className="button button-secondary button-small"
                onClick={() => updateParams({ page: page - 1 })}
                disabled={page === 1}
              >
                ← Previous
              </button>
              <span>
                Page {page} of {lastPage} · {list.total} people
              </span>
              <button
                className="button button-secondary button-small"
                onClick={() => updateParams({ page: page + 1 })}
                disabled={page === lastPage}
              >
                Next →
              </button>
            </nav>
          )}
        </>
      )}
    </>
  )
}

export default Dashboard
