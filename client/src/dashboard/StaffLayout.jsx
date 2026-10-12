import { Link, Outlet } from 'react-router'
import { ROLE_LABELS } from '../format.js'
import './Dashboard.css'

// The top bar shared by every staff page; the page itself renders in <Outlet />.
function StaffLayout({ user, onLogout }) {
  return (
    <div className="dashboard">
      <header className="topbar">
        <Link to="/" className="topbar-home">
          <p className="eyebrow">Onboarding</p>
          <p className="topbar-org">{user.organization_name}</p>
        </Link>
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
        <Outlet />
      </main>
    </div>
  )
}

export default StaffLayout
