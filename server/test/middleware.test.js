import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { requireRole } from '../middleware/auth.js';

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

describe('requireRole', () => {
  const adminsAndManagers = requireRole('admin', 'manager');

  for (const role of ['admin', 'manager']) {
    it(`lets ${role}s through`, (t) => {
      const next = t.mock.fn();
      adminsAndManagers({ user: { id: 1, role } }, fakeResponse(), next);
      assert.equal(next.mock.callCount(), 1);
    });
  }

  for (const role of ['supervisor', 'employee']) {
    it(`blocks ${role}s with 403`, (t) => {
      const next = t.mock.fn();
      const res = fakeResponse();
      adminsAndManagers({ user: { id: 2, role } }, res, next);

      assert.equal(next.mock.callCount(), 0);
      assert.equal(res.statusCode, 403);
    });
  }
});
