import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../app.js';
import pool from '../db.js';
import { PAGE_SIZE } from '../services/staff.js';
import { resetDb, createOrg, createUser, closeDb } from './helpers.js';

async function loggedInAgent(user) {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email: user.email, password: user.password }).expect(200);
  return agent;
}

// Gives a person a document of the named type expiring `days` from today
// (negative = already expired).
async function giveDocument(user, typeName, days) {
  await pool.query(
    `INSERT INTO credentials (organization_id, user_id, type_id, expires_on)
     SELECT $1, $2, id, CURRENT_DATE + $4::int FROM credential_types
     WHERE organization_id = $1 AND name = $3`,
    [user.organization_id, user.id, typeName, days],
  );
}

async function giveAllDocuments(user, days = 365) {
  for (const type of ['CPR Certification', "Driver's License", 'TB Test', 'Car Insurance']) {
    await giveDocument(user, type, days);
  }
}

async function completeTasks(user, count) {
  await pool.query(
    `INSERT INTO task_completions (organization_id, user_id, task_id)
     SELECT $1, $2, id FROM checklist_tasks WHERE organization_id = $1 ORDER BY sort_order LIMIT $3`,
    [user.organization_id, user.id, count],
  );
}

async function setStartDate(user, daysFromToday) {
  await pool.query('UPDATE users SET start_date = CURRENT_DATE + $2::int WHERE id = $1', [
    user.id,
    daysFromToday,
  ]);
}

async function supervise(supervisor, employee) {
  await pool.query(
    'INSERT INTO user_supervisors (organization_id, employee_id, supervisor_id) VALUES ($1, $2, $3)',
    [employee.organization_id, employee.id, supervisor.id],
  );
}

describe('staff dashboard API', () => {
  let org;
  let admin, manager, supervisor, employee;
  // People on the dashboard:
  let newHireBehind, newHireOnTrack, caregiverExpired, caregiverExpiring, caregiverAllGood, archived;

  before(async () => {
    await resetDb();
    org = await createOrg('Sunrise Care');
    const o = { organizationId: org.id };

    admin = await createUser({ ...o, role: 'admin', fullName: 'Ada Admin' });
    manager = await createUser({ ...o, role: 'manager', fullName: 'Max Manager' });
    supervisor = await createUser({ ...o, role: 'supervisor', fullName: 'Sue Supervisor' });
    employee = await createUser({ ...o, role: 'employee', fullName: 'Eve Employee' });
    await giveAllDocuments(admin);
    await giveAllDocuments(manager);
    await giveAllDocuments(supervisor);
    await giveAllDocuments(employee);

    // Started 3 days ago, 2 of 5 tasks done, no documents.
    newHireBehind = await createUser({ ...o, status: 'onboarding', fullName: 'Nia Behind' });
    await setStartDate(newHireBehind, -3);
    await completeTasks(newHireBehind, 2);

    // Starts next week, all documents in.
    newHireOnTrack = await createUser({ ...o, status: 'onboarding', fullName: 'Noah OnTrack' });
    await setStartDate(newHireOnTrack, 7);
    await giveAllDocuments(newHireOnTrack);

    caregiverExpired = await createUser({ ...o, fullName: 'Cara Expired' });
    await giveAllDocuments(caregiverExpired);
    await pool.query(
      `UPDATE credentials SET expires_on = CURRENT_DATE - 10
       WHERE user_id = $1 AND type_id = (SELECT id FROM credential_types WHERE organization_id = $2 AND name = 'CPR Certification')`,
      [caregiverExpired.id, org.id],
    );

    caregiverExpiring = await createUser({ ...o, fullName: 'Cole Expiring' });
    await giveDocument(caregiverExpiring, 'CPR Certification', 365);
    await giveDocument(caregiverExpiring, "Driver's License", 365);
    await giveDocument(caregiverExpiring, 'Car Insurance', 365);
    await giveDocument(caregiverExpiring, 'TB Test', 12); // within 30 days

    caregiverAllGood = await createUser({ ...o, fullName: 'Gus AllGood' });
    await giveAllDocuments(caregiverAllGood);

    archived = await createUser({ ...o, status: 'archived', fullName: 'Fay Former' });

    // Sue supervises two people.
    await supervise(supervisor, caregiverExpired);
    await supervise(supervisor, newHireBehind);

    // Someone at another agency, who must never appear.
    const otherOrg = await createOrg('Other Agency');
    await createUser({ organizationId: otherOrg.id, fullName: 'Otto Other' });
  });

  after(closeDb);

  describe('who can use it', () => {
    it('requires logging in', async () => {
      await request(app).get('/api/staff/summary').expect(401);
    });

    it('blocks employees', async () => {
      const agent = await loggedInAgent(employee);
      await agent.get('/api/staff/summary').expect(403);
      await agent.get('/api/staff?status=active').expect(403);
    });

    for (const role of ['admin', 'manager', 'supervisor']) {
      it(`lets ${role}s in`, async () => {
        const agent = await loggedInAgent({ admin, manager, supervisor }[role]);
        await agent.get('/api/staff/summary').expect(200);
      });
    }
  });

  describe('GET /api/staff', () => {
    let agent;
    before(async () => {
      agent = await loggedInAgent(admin);
    });

    async function names(query) {
      const res = await agent.get(`/api/staff?${query}`).expect(200);
      return res.body.staff.map((p) => p.full_name);
    }

    it('requires a valid tab', async () => {
      await agent.get('/api/staff').expect(400);
      await agent.get('/api/staff?status=archived').expect(400);
    });

    it('lists onboarding people, soonest start first', async () => {
      assert.deepEqual(await names('status=onboarding'), ['Nia Behind', 'Noah OnTrack']);
    });

    it('lists active staff with problems first, never archived or other agencies', async () => {
      const list = await names('status=active');
      assert.deepEqual(list.slice(0, 2), ['Cara Expired', 'Cole Expiring']);
      assert.ok(list.includes('Gus AllGood'));
      assert.ok(!list.includes('Fay Former'));
      assert.ok(!list.includes('Otto Other'));
    });

    it('shows checklist progress and missing documents', async () => {
      const res = await agent.get('/api/staff?status=onboarding').expect(200);
      const nia = res.body.staff.find((p) => p.id === newHireBehind.id);
      assert.equal(nia.tasks_done, 2);
      assert.equal(nia.tasks_total, 5);
      assert.equal(nia.docs_missing, 4);
      assert.deepEqual(nia.docs_missing_names, ['CPR Certification', 'Car Insurance', "Driver's License", 'TB Test']);
      assert.equal(nia.next_expiry, null);
    });

    it('shows expired and expiring documents', async () => {
      const res = await agent.get('/api/staff?status=active').expect(200);
      const cara = res.body.staff.find((p) => p.id === caregiverExpired.id);
      const cole = res.body.staff.find((p) => p.id === caregiverExpiring.id);

      assert.equal(cara.docs_expired, 1);
      assert.equal(cara.next_expiry.type, 'CPR Certification');
      assert.match(cara.next_expiry.expires_on, /^\d{4}-\d{2}-\d{2}$/);

      assert.equal(cole.docs_expired, 0);
      assert.equal(cole.docs_expiring, 1);
      assert.equal(cole.next_expiry.type, 'TB Test');
    });

    it('returns dates as plain YYYY-MM-DD text', async () => {
      const res = await agent.get('/api/staff?status=onboarding').expect(200);
      assert.match(res.body.staff[0].start_date, /^\d{4}-\d{2}-\d{2}$/);
    });

    it('searches by name or email, ignoring capitals', async () => {
      assert.deepEqual(await names('status=active&search=cole'), ['Cole Expiring']);
      assert.deepEqual(await names(`status=active&search=${encodeURIComponent(caregiverAllGood.email)}`), [
        'Gus AllGood',
      ]);
      assert.deepEqual(await names('status=active&search=nobody-matches'), []);
    });

    it('shows supervisors only their own team', async () => {
      const supervisorAgent = await loggedInAgent(supervisor);
      const active = await supervisorAgent.get('/api/staff?status=active').expect(200);
      const onboarding = await supervisorAgent.get('/api/staff?status=onboarding').expect(200);
      assert.deepEqual(active.body.staff.map((p) => p.full_name), ['Cara Expired']);
      assert.deepEqual(onboarding.body.staff.map((p) => p.full_name), ['Nia Behind']);
    });
  });

  describe('GET /api/staff/summary', () => {
    it('counts the people who need attention', async () => {
      const agent = await loggedInAgent(admin);
      const res = await agent.get('/api/staff/summary').expect(200);
      assert.deepEqual(res.body, {
        warningDays: 30,
        onboarding: { total: 2, behind: 1, missingDocs: 1 },
        // admin, manager, supervisor, employee, Cara, Cole, Gus
        active: { total: 7, expired: 1, expiring: 1, missingDocs: 0 },
      });
    });

    it("only counts a supervisor's team", async () => {
      const agent = await loggedInAgent(supervisor);
      const res = await agent.get('/api/staff/summary').expect(200);
      assert.deepEqual(res.body.onboarding, { total: 1, behind: 1, missingDocs: 1 });
      assert.deepEqual(res.body.active, { total: 1, expired: 1, expiring: 0, missingDocs: 0 });
    });
  });

  describe('pages', () => {
    it(`returns ${PAGE_SIZE} people per page with the overall total`, async () => {
      const bigOrg = await createOrg('Big Agency');
      const bigAdmin = await createUser({ organizationId: bigOrg.id, role: 'admin' });
      await pool.query(
        `INSERT INTO users (organization_id, full_name, status)
         SELECT $1, 'Person ' || lpad(n::text, 3, '0'), 'active' FROM generate_series(1, 59) n`,
        [bigOrg.id],
      );
      const agent = await loggedInAgent(bigAdmin);

      const page1 = await agent.get('/api/staff?status=active&page=1').expect(200);
      const page3 = await agent.get('/api/staff?status=active&page=3').expect(200);

      assert.equal(page1.body.total, 60); // 59 + the admin
      assert.equal(page1.body.staff.length, PAGE_SIZE);
      assert.equal(page3.body.staff.length, 10);
      assert.equal(page3.body.page, 3);
    });
  });

  describe('POST /api/staff', () => {
    it('adds someone to the onboarding tab and records it in the history', async () => {
      const agent = await loggedInAgent(admin);
      const res = await agent
        .post('/api/staff')
        .send({ fullName: '  Pat Newperson ', email: 'PAT@Example.com', startDate: '2030-01-15', role: 'employee' })
        .expect(201);

      assert.equal(res.body.person.full_name, 'Pat Newperson');
      assert.equal(res.body.person.email, 'pat@example.com');
      assert.equal(res.body.person.status, 'onboarding');
      assert.equal(res.body.person.start_date, '2030-01-15');

      const { rows } = await pool.query(
        "SELECT actor_id, action, changes FROM audit_log WHERE entity_type = 'user' AND entity_id = $1",
        [res.body.person.id],
      );
      assert.equal(rows.length, 1);
      assert.equal(rows[0].actor_id, admin.id);
      assert.equal(rows[0].action, 'user.created');
      assert.deepEqual(rows[0].changes.email, { from: null, to: 'pat@example.com' });
    });

    it('puts people who already work here straight on the active tab', async () => {
      const agent = await loggedInAgent(admin);
      const res = await agent.post('/api/staff').send({ fullName: 'Al Ready', alreadyWorking: true }).expect(201);
      assert.equal(res.body.person.status, 'active');
    });

    it('always adds people to your own agency', async () => {
      const otherOrg = await createOrg('Sneaky Agency');
      const agent = await loggedInAgent(admin);
      const res = await agent
        .post('/api/staff')
        .send({ fullName: 'Wrong Place', organizationId: otherOrg.id })
        .expect(201);
      const { rows } = await pool.query('SELECT organization_id FROM users WHERE id = $1', [res.body.person.id]);
      assert.equal(rows[0].organization_id, org.id);
    });

    it('allows people without an email', async () => {
      const agent = await loggedInAgent(admin);
      await agent.post('/api/staff').send({ fullName: 'No Email One' }).expect(201);
      await agent.post('/api/staff').send({ fullName: 'No Email Two', email: '' }).expect(201);
    });

    it('rejects bad input with a clear message', async () => {
      const agent = await loggedInAgent(admin);
      const cases = [
        [{}, 'Full name is required'],
        [{ fullName: 'X', email: 'not-an-email' }, 'That email address doesn’t look right'],
        [{ fullName: 'X', startDate: '2030-13-45' }, 'Start date must be a valid date'],
        [{ fullName: 'X', startDate: 'next tuesday' }, 'Start date must be a valid date'],
        [{ fullName: 'X', role: 'superadmin' }, 'Unknown role'],
      ];
      for (const [body, error] of cases) {
        const res = await agent.post('/api/staff').send(body).expect(400);
        assert.equal(res.body.error, error);
      }
    });

    it('rejects an email someone already uses', async () => {
      const agent = await loggedInAgent(admin);
      const res = await agent.post('/api/staff').send({ fullName: 'Dupe', email: employee.email }).expect(409);
      assert.equal(res.body.error, 'Someone already uses that email address');
    });

    it('lets managers add people, but not admins', async () => {
      const agent = await loggedInAgent(manager);
      await agent.post('/api/staff').send({ fullName: 'Hired By Manager' }).expect(201);
      const res = await agent.post('/api/staff').send({ fullName: 'Wannabe Admin', role: 'admin' }).expect(403);
      assert.equal(res.body.error, 'Only admins can add other admins');
    });

    it("doesn't let supervisors add people", async () => {
      const agent = await loggedInAgent(supervisor);
      await agent.post('/api/staff').send({ fullName: 'Nope' }).expect(403);
    });
  });
});
