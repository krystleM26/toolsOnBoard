import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { requireAdmin } from '../middleware/auth.js';

// A stand-in for Express's res object that records what was sent.
function fakeResponse() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

describe('requireAdmin', () => {
  it('lets admins through', (t) => {
    const next = t.mock.fn();
    requireAdmin({ user: { id: 1, role: 'admin' } }, fakeResponse(), next);
    assert.equal(next.mock.callCount(), 1);
  });

  it('blocks employees with 403', (t) => {
    const next = t.mock.fn();
    const res = fakeResponse();
    requireAdmin({ user: { id: 2, role: 'employee' } }, res, next);

    assert.equal(next.mock.callCount(), 0);
    assert.equal(res.statusCode, 403);
  });
});
