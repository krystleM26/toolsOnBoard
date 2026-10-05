import { useEffect, useState } from 'react'
import { api } from './api.js'
import Login from './Login.jsx'
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

  return (
    <main className="app-shell">
      <div className="card">
        <p className="eyebrow">{user.role === 'admin' ? 'Admin' : 'Employee'}</p>
        <h1>Welcome, {user.full_name}</h1>
        <p className="subtext">
          {user.role === 'admin'
            ? 'The admin dashboard is coming in the next step.'
            : 'Your onboarding checklist is coming soon.'}
        </p>
        <button className="button button-secondary" onClick={handleLogout}>
          Log out
        </button>
      </div>
    </main>
  )
}

export default App
