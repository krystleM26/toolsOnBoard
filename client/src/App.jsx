import { useEffect, useState } from 'react'
import { api } from './api.js'
import { Navigate, Route, Routes } from 'react-router'
import Login from './Login.jsx'
import Dashboard from './dashboard/Dashboard.jsx'
import StaffLayout from './dashboard/StaffLayout.jsx'
import { ROLE_LABELS } from './format.js'
import PersonPage from './person/PersonPage.jsx'
import './App.css'

function App() {
  // undefined = still checking, null = logged out, object = logged in
  const [user, setUser] = useState(undefined)

  // On page load, ask the server whether our login cookie is still valid.
  useEffect(() => {
    api('/auth/me')
      .then((data) => setUser(data.user))
      .catch(() => setUser(null))
  }, [])

  async function handleLogout() {
    await api('/auth/logout', { method: 'POST' })
    setUser(null)
  }

  if (user === undefined) {
    return <main className="app-shell">Loading…</main>
  }

  if (user === null) {
    return <Login onLogin={setUser} />
  }

  if (user.role !== 'employee') {
    return (
      <Routes>
        <Route element={<StaffLayout user={user} onLogout={handleLogout} />}>
          <Route index element={<Dashboard user={user} />} />
          <Route path="staff/:id" element={<PersonPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    )
  }

  return (
    <main className="app-shell">
      <div className="card">
        <p className="eyebrow">
          {user.organization_name} · {ROLE_LABELS[user.role]}
        </p>
        <h1>Welcome, {user.full_name}</h1>
        <p className="subtext">Your onboarding checklist is coming soon.</p>
        <button className="button button-secondary" onClick={handleLogout}>
          Log out
        </button>
      </div>
    </main>
  )
}

export default App
