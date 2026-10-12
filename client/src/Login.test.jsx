import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import Login from './Login.jsx'
import { mockFetch } from './test/mockFetch.js'

const user = { id: 1, email: 'sam@example.com', full_name: 'Sam Lee', role: 'employee' }

async function fillInAndSubmit(email, password) {
  await userEvent.type(screen.getByLabelText('Email'), email)
  await userEvent.type(screen.getByLabelText('Password'), password)
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
}

describe('Login', () => {
  it('sends the email and password to the server', async () => {
    const fetch = mockFetch({ 'POST /api/auth/login': { body: { user } } })
    render(<Login onLogin={() => {}} />)

    await fillInAndSubmit('sam@example.com', 'password123')

    const [, options] = fetch.mock.calls[0]
    expect(JSON.parse(options.body)).toEqual({ email: 'sam@example.com', password: 'password123' })
  })

  it('hands the logged-in user to the parent', async () => {
    mockFetch({ 'POST /api/auth/login': { body: { user } } })
    const onLogin = vi.fn()
    render(<Login onLogin={onLogin} />)

    await fillInAndSubmit('sam@example.com', 'password123')

    expect(onLogin).toHaveBeenCalledWith(user)
  })

  it("shows the server's error message when login fails", async () => {
    mockFetch({
      'POST /api/auth/login': { status: 401, body: { error: 'Incorrect email or password' } },
    })
    const onLogin = vi.fn()
    render(<Login onLogin={onLogin} />)

    await fillInAndSubmit('sam@example.com', 'wrong')

    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password')
    expect(onLogin).not.toHaveBeenCalled()
  })
})
