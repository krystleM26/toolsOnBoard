import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { mockFetch } from '../test/mockFetch.js'
import Dashboard from './Dashboard.jsx'

const org = { organization_id: 1, organization_name: 'Sunrise Care' }
const admin = { id: 1, full_name: 'Ada Admin', role: 'admin', ...org }
const manager = { id: 2, full_name: 'Max Manager', role: 'manager', ...org }
const supervisor = { id: 3, full_name: 'Sue Supervisor', role: 'supervisor', ...org }

const summary = {
  warningDays: 30,
  onboarding: { total: 1, behind: 1, missingDocs: 1 },
  active: { total: 2, expired: 1, expiring: 0, missingDocs: 0 },
}

function person(overrides) {
  return {
    email: null,
    role: 'employee',
    start_date: null,
    tasks_done: 0,
    tasks_total: 5,
    docs_expired: 0,
    docs_expiring: 0,
    docs_missing: 0,
    docs_missing_names: [],
    next_expiry: null,
    ...overrides,
  }
}

const nia = person({
  id: 10,
  full_name: 'Nia Newhire',
  status: 'onboarding',
  start_date: '2026-10-20',
  tasks_done: 2,
  docs_missing: 4,
  docs_missing_names: ['A', 'B', 'C', 'D'],
})
const cara = person({
  id: 11,
  full_name: 'Cara Caregiver',
  email: 'cara@example.com',
  status: 'active',
  tasks_done: 5,
  docs_expired: 1,
  next_expiry: { type: 'CPR Certification', expires_on: '2026-10-02' },
})
const gus = person({
  id: 12,
  full_name: 'Gus Good',
  status: 'active',
  tasks_done: 5,
  next_expiry: { type: 'TB Test', expires_on: '2027-06-01' },
})

// A fake server that filters people the way the real one does.
// `routes` adds or overrides responses, e.g. for POST /api/staff.
function fakeServer(people = [nia, cara, gus], { total, routes = {} } = {}) {
  return mockFetch({
    'GET /api/staff/summary': { body: summary },
    'GET /api/staff': (url) => {
      const params = new URL(url, 'http://localhost').searchParams
      const search = (params.get('search') || '').toLowerCase()
      const staff = people.filter(
        (p) => p.status === params.get('status') && p.full_name.toLowerCase().includes(search),
      )
      return {
        body: { staff, total: total ?? staff.length, page: Number(params.get('page')), pageSize: 25 },
      }
    },
    ...routes,
  })
}

function renderDashboard(user, path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Dashboard user={user} />
    </MemoryRouter>,
  )
}

describe('Dashboard', () => {
  it('opens on the onboarding tab with its needs-attention summary', async () => {
    fakeServer()
    renderDashboard(admin)

    expect(await screen.findByText('Nia Newhire')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Onboarding/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText(/started work, checklist unfinished/)).toBeInTheDocument()
    expect(screen.getByText('Oct 20, 2026')).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '2')
    expect(screen.getByText(/4 documents missing/)).toBeInTheDocument()
  })

  it('shows tab counts', async () => {
    fakeServer()
    renderDashboard(admin)

    expect(await screen.findByRole('tab', { name: 'Onboarding 1' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Active staff 2' })).toBeInTheDocument()
  })

  it('switches to active staff and shows document problems', async () => {
    fakeServer()
    renderDashboard(admin)
    await screen.findByText('Nia Newhire')

    await userEvent.click(screen.getByRole('tab', { name: /Active staff/ }))

    expect(await screen.findByText('Cara Caregiver')).toBeInTheDocument()
    expect(screen.queryByText('Nia Newhire')).not.toBeInTheDocument()
    expect(screen.getByText(/CPR Certification expired Oct 2, 2026/)).toBeInTheDocument()
    expect(screen.getByText(/All current/)).toBeInTheDocument()
    expect(screen.getByText(/with expired documents/)).toBeInTheDocument()
  })

  it('searches as you type', async () => {
    const fetch = fakeServer()
    renderDashboard(admin)
    await userEvent.click(await screen.findByRole('tab', { name: /Active staff/ }))
    await screen.findByText('Gus Good')

    await userEvent.type(screen.getByRole('searchbox'), 'cara')

    await waitFor(() => expect(screen.queryByText('Gus Good')).not.toBeInTheDocument())
    expect(screen.getByText('Cara Caregiver')).toBeInTheDocument()
    expect(fetch.mock.calls.some(([url]) => url.includes('search=cara'))).toBe(true)
  })

  it('says when no one matches', async () => {
    fakeServer([])
    renderDashboard(admin)
    expect(await screen.findByText('No one to show here.')).toBeInTheDocument()
  })

  it('pages through long lists', async () => {
    const fetch = fakeServer([nia], { total: 60 })
    renderDashboard(admin)

    expect(await screen.findByText('Page 1 of 3 · 60 people')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '← Previous' })).toBeDisabled()

    await userEvent.click(screen.getByRole('button', { name: 'Next →' }))

    expect(await screen.findByText('Page 2 of 3 · 60 people')).toBeInTheDocument()
    expect(fetch.mock.calls.some(([url]) => url.includes('page=2'))).toBe(true)
  })

  describe('adding a person', () => {
    it('adds someone and shows them on the right tab', async () => {
      const added = person({ id: 20, full_name: 'Pat New', status: 'active' })
      const people = [nia, cara, gus]
      const fetch = fakeServer(people, {
        routes: {
          'POST /api/staff': () => {
            people.push(added)
            return { status: 201, body: { person: added } }
          },
        },
      })

      renderDashboard(admin)
      await userEvent.click(await screen.findByRole('button', { name: '+ Add person' }))
      await userEvent.type(screen.getByLabelText('Full name'), 'Pat New')
      await userEvent.type(screen.getByLabelText(/Email/), 'pat@example.com')
      await userEvent.click(screen.getByLabelText(/Already working here/))
      await userEvent.click(screen.getByRole('button', { name: 'Add person' }))

      expect(await screen.findByRole('status')).toHaveTextContent('Added Pat New.')
      expect(screen.getByRole('tab', { name: /Active staff/ })).toHaveAttribute('aria-selected', 'true')
      expect(await screen.findByText('Pat New')).toBeInTheDocument()
      expect(screen.queryByRole('form', { name: 'Add a person' })).not.toBeInTheDocument()

      const [, post] = fetch.mock.calls.find(([, options]) => options?.method === 'POST')
      expect(JSON.parse(post.body)).toMatchObject({
        fullName: 'Pat New',
        email: 'pat@example.com',
        alreadyWorking: true,
        role: 'employee',
      })
    })

    it("shows the server's error and keeps the form open", async () => {
      fakeServer([], {
        routes: {
          'POST /api/staff': { status: 409, body: { error: 'Someone already uses that email address' } },
        },
      })
      renderDashboard(admin)

      await userEvent.click(await screen.findByRole('button', { name: '+ Add person' }))
      await userEvent.type(screen.getByLabelText('Full name'), 'Dupe')
      await userEvent.click(screen.getByRole('button', { name: 'Add person' }))

      expect(await screen.findByRole('alert')).toHaveTextContent('Someone already uses that email address')
      expect(screen.getByLabelText('Full name')).toHaveValue('Dupe')
    })

    it('is only offered to admins', async () => {
      fakeServer()
      const { unmount } = renderDashboard(manager)
      await screen.findByText('Nia Newhire')
      expect(screen.queryByRole('button', { name: '+ Add person' })).not.toBeInTheDocument()
      unmount()

      fakeServer()
      renderDashboard(admin)
      await userEvent.click(await screen.findByRole('button', { name: '+ Add person' }))
      expect(screen.getByRole('option', { name: 'Admin' })).toBeInTheDocument()
    })
  })

  it('links each name to that person’s page', async () => {
    fakeServer()
    renderDashboard(admin)
    expect(await screen.findByRole('link', { name: 'Nia Newhire' })).toHaveAttribute('href', '/staff/10')
  })

  it('opens on the tab, search and page in the address', async () => {
    const fetch = fakeServer()
    renderDashboard(admin, '/?tab=active&q=gus')

    expect(await screen.findByText('Gus Good')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Active staff/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('searchbox')).toHaveValue('gus')
    expect(fetch.mock.calls.some(([url]) => url.includes('status=active') && url.includes('search=gus'))).toBe(true)
  })

  it('shows supervisors their team, without the add button', async () => {
    fakeServer()
    renderDashboard(supervisor)

    expect(await screen.findByRole('heading', { name: 'Your team' })).toBeInTheDocument()
    await screen.findByText('Nia Newhire')
    expect(screen.queryByRole('button', { name: '+ Add person' })).not.toBeInTheDocument()
  })
})
