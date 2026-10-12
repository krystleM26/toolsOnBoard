import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it } from 'vitest'
import { mockFetch } from '../test/mockFetch.js'
import PersonPage from './PersonPage.jsx'

const ADMIN_CAN = {
  editDetails: true,
  changeRole: true,
  changeStatus: true,
  changeSupervisors: true,
  tickTasks: true,
  writeNotes: true,
}
const VIEW_ONLY = Object.fromEntries(Object.keys(ADMIN_CAN).map((key) => [key, false]))

function pageData(overrides = {}) {
  return {
    person: {
      id: 10,
      full_name: 'Nia Newhire',
      email: 'nia@example.com',
      phone: null,
      start_date: '2030-10-20',
      role: 'employee',
      status: 'onboarding',
    },
    supervisors: [{ id: 3, full_name: 'Sue Supervisor', role: 'supervisor' }],
    supervisorOptions: [
      { id: 2, full_name: 'Max Manager', role: 'manager' },
      { id: 3, full_name: 'Sue Supervisor', role: 'supervisor' },
    ],
    checklist: [
      { id: 1, title: 'Complete your profile', done: true, completed_at: '2026-10-12T18:00:00Z', completed_by_name: 'Ada Admin' },
      { id: 2, title: 'Sign employee handbook', done: false, completed_at: null, completed_by_name: null },
    ],
    documents: [
      { type_id: 1, type: 'CPR Certification', state: 'expired', expires_on: '2026-10-02', valid_for_months: null },
      { type_id: 2, type: 'TB Test', state: 'missing', expires_on: null, valid_for_months: 24 },
    ],
    notes: [{ id: 1, body: 'Called about TB test', created_at: '2026-10-12T18:00:00Z', author_name: 'Ada Admin' }],
    history: [
      { id: 2, action: 'task.completed', changes: { task: { from: null, to: 'Complete your profile' } }, created_at: '2026-10-12T18:00:00Z', actor_name: 'Ada Admin' },
      { id: 1, action: 'user.created', changes: {}, created_at: '2026-10-11T18:00:00Z', actor_name: 'Ada Admin' },
    ],
    warningDays: 30,
    can: ADMIN_CAN,
    ...overrides,
  }
}

function renderPage({ backTo } = {}) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/staff/10', state: backTo ? { backTo } : undefined }]}>
      <Routes>
        <Route path="/staff/:id" element={<PersonPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

function section(name) {
  return within(screen.getByRole('region', { name }))
}

describe('PersonPage', () => {
  it('shows the person, their checklist, documents, notes and history', async () => {
    mockFetch({ 'GET /api/staff/10': { body: pageData() } })
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Nia Newhire' })).toBeInTheDocument()
    expect(screen.getByText(/Starts Oct 20, 2030/)).toBeInTheDocument()

    expect(section('Details').getByText('nia@example.com')).toBeInTheDocument()
    expect(section('Supervisors').getByText(/Sue Supervisor/)).toBeInTheDocument()
    expect(section('Checklist').getByText('1 of 2 done')).toBeInTheDocument()
    expect(section('Checklist').getByText(/by Ada Admin/)).toBeInTheDocument()
    expect(section('Documents').getByText('Expired')).toBeInTheDocument()
    expect(section('Documents').getByText('Missing')).toBeInTheDocument()
    expect(section('Notes').getByText('Called about TB test')).toBeInTheDocument()
    expect(section('History').getByText(/ticked “Complete your profile”/)).toBeInTheDocument()
  })

  it('goes back to the exact dashboard view it came from', async () => {
    mockFetch({ 'GET /api/staff/10': { body: pageData() } })
    renderPage({ backTo: '/?tab=active&q=nia' })
    expect(await screen.findByRole('link', { name: '← Back to staff' })).toHaveAttribute('href', '/?tab=active&q=nia')
  })

  it('says so when the person is not found', async () => {
    mockFetch({ 'GET /api/staff/10': { status: 404, body: { error: 'Not found' } } })
    renderPage()
    expect(await screen.findByText(/wasn’t found/)).toBeInTheDocument()
  })

  it('shows managers and supervisors the page without any edit controls', async () => {
    mockFetch({ 'GET /api/staff/10': { body: pageData({ can: VIEW_ONLY, supervisorOptions: [] }) } })
    renderPage()
    await screen.findByRole('heading', { name: 'Nia Newhire' })

    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Change' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Archive' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mark onboarding complete' })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('New note')).not.toBeInTheDocument()
  })

  describe('admin actions', () => {
    // A fake server that records what was sent and returns updated data.
    function fakeServer(responses = {}) {
      let data = pageData()
      const fetch = mockFetch({
        'GET /api/staff/10': () => ({ body: data }),
        'PATCH /api/staff/10': (url, options) => {
          const body = JSON.parse(options.body)
          if (responses.patch) return responses.patch
          data = { ...data, person: { ...data.person, ...(body.status && { status: body.status }), ...(body.phone && { phone: body.phone }) } }
          return { body: { person: data.person } }
        },
        'PUT /api/staff/10/tasks/2': { body: { ok: true } },
        'PUT /api/staff/10/supervisors': { body: { ok: true } },
        'POST /api/staff/10/notes': { status: 201, body: { note: {} } },
      })
      const sent = (method, path) =>
        fetch.mock.calls
          .filter(([url, options]) => url === path && options?.method === method)
          .map(([, options]) => JSON.parse(options.body))
      return { fetch, sent }
    }

    it('edits details', async () => {
      const { sent } = fakeServer()
      renderPage()
      await userEvent.click(await screen.findByRole('button', { name: 'Edit' }))
      await userEvent.type(screen.getByLabelText('Phone'), '555-0100')
      await userEvent.click(screen.getByRole('button', { name: 'Save' }))

      expect(await section('Details').findByText('555-0100')).toBeInTheDocument()
      expect(sent('PATCH', '/api/staff/10')[0]).toMatchObject({ fullName: 'Nia Newhire', phone: '555-0100', role: 'employee' })
    })

    it('keeps the form open and shows the error when saving fails', async () => {
      fakeServer({ patch: { status: 409, body: { error: 'Someone already uses that email address' } } })
      renderPage()
      await userEvent.click(await screen.findByRole('button', { name: 'Edit' }))
      await userEvent.click(screen.getByRole('button', { name: 'Save' }))

      expect(await screen.findByRole('alert')).toHaveTextContent('Someone already uses that email address')
      expect(screen.getByLabelText('Full name')).toBeInTheDocument()
    })

    it('ticks a task', async () => {
      const { sent } = fakeServer()
      renderPage()
      await userEvent.click(await screen.findByRole('checkbox', { name: /Sign employee handbook/ }))
      expect(sent('PUT', '/api/staff/10/tasks/2')).toEqual([{ done: true }])
    })

    it('changes supervisors', async () => {
      const { sent } = fakeServer()
      renderPage()
      await userEvent.click(await screen.findByRole('button', { name: 'Change' }))
      await userEvent.click(screen.getByRole('checkbox', { name: /Max Manager/ }))
      await userEvent.click(section('Supervisors').getByRole('button', { name: 'Save' }))

      expect(sent('PUT', '/api/staff/10/supervisors')).toEqual([{ supervisorIds: [3, 2] }])
    })

    it('adds a note', async () => {
      const { sent } = fakeServer()
      renderPage()
      await userEvent.type(await screen.findByLabelText('New note'), 'Booked TB test for Friday')
      await userEvent.click(screen.getByRole('button', { name: 'Add note' }))
      expect(sent('POST', '/api/staff/10/notes')).toEqual([{ body: 'Booked TB test for Friday' }])
    })

    it('marks onboarding complete', async () => {
      const { sent } = fakeServer()
      renderPage()
      await userEvent.click(await screen.findByRole('button', { name: 'Mark onboarding complete' }))
      expect(sent('PATCH', '/api/staff/10')).toEqual([{ status: 'active' }])
      expect(await screen.findByText('Active')).toBeInTheDocument()
    })

    it('asks before archiving, and can be cancelled', async () => {
      const { sent } = fakeServer()
      renderPage()
      await userEvent.click(await screen.findByRole('button', { name: 'Archive' }))

      expect(screen.getByRole('alertdialog')).toHaveTextContent('Archive Nia Newhire?')
      await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(sent('PATCH', '/api/staff/10')).toEqual([])

      await userEvent.click(screen.getByRole('button', { name: 'Archive' }))
      await userEvent.click(screen.getByRole('button', { name: 'Yes, archive' }))
      expect(sent('PATCH', '/api/staff/10')).toEqual([{ status: 'archived' }])
      expect(await screen.findByText(/can’t sign in and isn’t shown on the dashboard/)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Restore' })).toBeInTheDocument()
    })
  })
})
