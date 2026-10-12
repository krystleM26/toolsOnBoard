import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../app.js';
import pool from '../db.js';
import { resetDb, createOrg, createUser, closeDb } from './helpers.js';

describe('auth routes', () => {
  let org;
  let employee;

  before(async () => {
    await resetDb();
    org = await createOrg('Sunrise Care');
    employee = await createUser({ organizationId: org.id, email: 'employee@example.com' });
  });

  async function loggedInAgent(user) {
    // An "agent" remembers cookies between requests, like a browser.
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: user.email, password: user.password }).expect(200);
    return agent;
  }

  after(closeDb);

  describe('POST /api/auth/login', () => {
    it('rejects a request with no email or password', async () => {
      const res = await request(app).post('/api/auth/login').send({});
      assert.equal(res.status, 400);
      assert.equal(res.body.error, 'Email and password are required');
    });

    it('rejects a wrong password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: employee.email, password: 'wrong-password' });
      assert.equal(res.status, 401);
      assert.equal(res.body.error, 'Incorrect email or password');
    });

    it('gives the same error for an unknown email', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nobody@example.com', password: 'password123' });
      assert.equal(res.status, 401);
      assert.equal(res.body.error, 'Incorrect email or password');
    });

    it('logs in, ignoring email capitals and spaces', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: '  EMPLOYEE@example.com ', password: employee.password });

      assert.equal(res.status, 200);
      assert.equal(res.body.user.email, employee.email);
      assert.equal(res.body.user.role, 'employee');
    });

    it("includes the user's organization", async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: employee.email, password: employee.password });
      assert.equal(res.body.user.organization_id, org.id);
      assert.equal(res.body.user.organization_name, 'Sunrise Care');
    });

    it('rejects users who have no password (e.g. from Clock Earnings)', async () => {
      const noPassword = await createUser({ organizationId: org.id, password: null });
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: noPassword.email, password: 'anything123' });
      assert.equal(res.status, 401);
      assert.equal(res.body.error, 'Incorrect email or password');
    });

    it('rejects archived users', async () => {
      const archived = await createUser({ organizationId: org.id, status: 'archived' });
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: archived.email, password: archived.password });
      assert.equal(res.status, 401);
      assert.equal(res.body.error, 'This account is no longer active');
    });

    it('never sends the password hash to the browser', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: employee.email, password: employee.password });
      assert.equal('password_hash' in res.body.user, false);
    });

    it('sets an httpOnly login cookie', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: employee.email, password: employee.password });

      const cookie = res.headers['set-cookie'][0];
      assert.match(cookie, /^token=/);
      assert.match(cookie, /HttpOnly/);
    });
  });

  describe('GET /api/auth/me', () => {
    it('returns 401 when not logged in', async () => {
      const res = await request(app).get('/api/auth/me');
      assert.equal(res.status, 401);
    });

    it('returns 401 for a fake token', async () => {
      const res = await request(app).get('/api/auth/me').set('Cookie', 'token=not-a-real-token');
      assert.equal(res.status, 401);
    });

    it('returns the logged-in user', async () => {
      const agent = await loggedInAgent(employee);

      const res = await agent.get('/api/auth/me');
      assert.equal(res.status, 200);
      assert.equal(res.body.user.id, employee.id);
      assert.equal('password_hash' in res.body.user, false);
    });

    it('locks out someone archived while they are logged in', async () => {
      const user = await createUser({ organizationId: org.id });
      const agent = await loggedInAgent(user);

      await pool.query("UPDATE users SET status = 'archived' WHERE id = $1", [user.id]);

      const res = await agent.get('/api/auth/me');
      assert.equal(res.status, 401);
    });

    it('reflects a role change without logging in again', async () => {
      const user = await createUser({ organizationId: org.id });
      const agent = await loggedInAgent(user);

      await pool.query("UPDATE users SET role = 'supervisor' WHERE id = $1", [user.id]);

      const res = await agent.get('/api/auth/me');
      assert.equal(res.body.user.role, 'supervisor');
    });
  });

  describe('POST /api/auth/logout', () => {
    it('ends the session', async () => {
      const agent = await loggedInAgent(employee);

      await agent.post('/api/auth/logout').expect(200);

      const res = await agent.get('/api/auth/me');
      assert.equal(res.status, 401);
    });
  });
});
