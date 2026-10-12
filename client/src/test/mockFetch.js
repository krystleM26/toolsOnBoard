import { vi } from 'vitest'

// Replaces the browser's fetch with a fake that answers from a lookup table,
// so component tests don't need the real server running.
//
//   mockFetch({
//     'GET /api/auth/me': { status: 401, body: { error: 'Not logged in' } },
//     'POST /api/auth/login': { status: 200, body: { user } },
//   })
//
// Returns the fake so tests can check what was requested.
export function mockFetch(routes) {
  const fetch = vi.fn(async (url, options = {}) => {
    const key = `${options.method || 'GET'} ${url}`
    const route = routes[key]
    if (!route) {
      throw new Error(`mockFetch: no response set up for "${key}"`)
    }
    return new Response(JSON.stringify(route.body ?? {}), {
      status: route.status ?? 200,
      headers: { 'Content-Type': 'application/json' },
    })
  })
  vi.stubGlobal('fetch', fetch)
  return fetch
}
