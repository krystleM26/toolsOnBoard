import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from './App.jsx'
import { mockFetch } from './test/mockFetch.js'

const admin = { id: 1, email: 'admin@example.com', full_name: 'Alex Admin', role: 'admin' }
const employee = { id: 2, email: 'sam@example.com', full_name: 'Sam Lee', role: 'employee' }

describe('App', () => {
  it('shows the login page when nobody is logged in', async () => {
    mockFetch({ 'GET /api/auth/me': { status: 401, body: { error: 'Not logged in' } } })
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('welcomes an already logged-in admin', async () => {
    mockFetch({ 'GET /api/auth/me': { body: { user: admin } } })
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Welcome, Alex Admin' })).toBeInTheDocument()
    expect(screen.getByText('Admin')).toBeInTheDocument()
  })

  it('welcomes an employee', async () => {
    mockFetch({ 'GET /api/auth/me': { body: { user: employee } } })
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Welcome, Sam Lee' })).toBeInTheDocument()
    expect(screen.getByText('Employee')).toBeInTheDocument()
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
