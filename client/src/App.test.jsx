import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from './App.jsx'
import { mockFetch } from './test/mockFetch.js'

const org = { organization_id: 1, organization_name: 'Sunrise Care' }
const admin = { id: 1, email: 'admin@example.com', full_name: 'Alex Admin', role: 'admin', ...org }
const employee = { id: 2, email: 'sam@example.com', full_name: 'Sam Lee', role: 'employee', ...org }

describe('App', () => {
  it('shows the login page when nobody is logged in', async () => {
    mockFetch({ 'GET /api/auth/me': { status: 401, body: { error: 'Not logged in' } } })
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('shows staff dashboard to an already logged-in admin', async () => {
    mockFetch({
      'GET /api/auth/me': { body: { user: admin } },
      'GET /api/staff/summary': {
        body: {
          warningDays: 30,
          onboarding: { total: 0, behind: 0, missingDocs: 0 },
          active: { total: 0, expired: 0, expiring: 0, missingDocs: 0 },
        },
      },
      'GET /api/staff': { body: { staff: [], total: 0, page: 1, pageSize: 25 } },
    })
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Staff' })).toBeInTheDocument()
    expect(screen.getByText('Alex Admin · Admin')).toBeInTheDocument()
  })

  it('welcomes an employee', async () => {
    mockFetch({ 'GET /api/auth/me': { body: { user: employee } } })
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Welcome, Sam Lee' })).toBeInTheDocument()
    expect(screen.getByText('Sunrise Care · Employee')).toBeInTheDocument()
  })

  it('goes back to the login page after logging out', async () => {
    mockFetch({
      'GET /api/auth/me': { body: { user: employee } },
      'POST /api/auth/logout': { body: { ok: true } },
    })
    render(<App />)

    await userEvent.click(await screen.findByRole('button', { name: 'Log out' }))

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  })
})
