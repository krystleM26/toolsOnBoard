import { vi } from 'vitest'

// Replaces the browser's fetch with a fake that answers from a lookup table,
// so component tests don't need the real server running.
//
//   mockFetch({
//     'GET /api/auth/me': { status: 401, body: { error: 'Not logged in' } },
//     'POST /api/auth/login': { status: 200, body: { user } },
//     // A key without a query string matches any query, e.g. /api/staff?page=2.
//     // A function gets the URL and options and returns { status, body }.
//     'GET /api/staff': (url) => ({ body: { staff: [] } }),
//   })
//
// Returns the fake so tests can check what was requested.
export function mockFetch(routes) {
  const fetch = vi.fn(async (url, options = {}) => {
    const method = options.method || 'GET'
    const path = url.split('?')[0]
    const route = routes[`${method} ${url}`] ?? routes[`${method} ${path}`]
    if (!route) {
      throw new Error(`mockFetch: no response set up for "${method} ${url}"`)
    }
    const { status = 200, body = {} } = typeof route === 'function' ? route(url, options) : route
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  })
  vi.stubGlobal('fetch', fetch)
  return fetch
}
