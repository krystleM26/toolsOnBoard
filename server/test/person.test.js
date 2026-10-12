import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../app.js';
import pool from '../db.js';
import { resetDb, createOrg, createUser, closeDb } from './helpers.js';

async function loggedInAgent(user) {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email: user.email, password: user.password }).expect(200);
  return agent;
}

async function history(personId) {
  const { rows } = await pool.query(
    "SELECT actor_id, action, changes FROM audit_log WHERE entity_type = 'user' AND entity_id = $1 ORDER BY id",
    [personId],
  );
  return rows;
}

describe('person page API', () => {
  let org, otherOrg;
  let admin, admin2, manager, supervisor, otherSupervisor, employee;
  let nia; // the person whose page we look at
  let stranger; // someone at another agency
  let firstTaskId;

  before(async () => {
    await resetDb();
    org = await createOrg('Sunrise Care');
    otherOrg = await createOrg('Other Agency');
    const o = { organizationId: org.id };

    admin = await createUser({ ...o, role: 'admin', fullName: 'Ada Admin' });
    admin2 = await createUser({ ...o, role: 'admin', fullName: 'Abe Admin' });
    manager = await createUser({ ...o, role: 'manager', fullName: 'Max Manager' });
    supervisor = await createUser({ ...o, role: 'supervisor', fullName: 'Sue Supervisor' });
    otherSupervisor = await createUser({ ...o, role: 'supervisor', fullName: 'Sid Supervisor' });
    employee = await createUser({ ...o, role: 'employee', fullName: 'Eve Employee' });
    nia = await createUser({ ...o, fullName: 'Nia Newhire', status: 'onboarding' });
    stranger = await createUser({ organizationId: otherOrg.id, fullName: 'Otto Other' });

    await pool.query(
      'INSERT INTO user_supervisors (organization_id, employee_id, supervisor_id) VALUES ($1, $2, $3)',
      [org.id, nia.id, supervisor.id],
    );
    await pool.query(
      `INSERT INTO credentials (organization_id, user_id, type_id, expires_on)
       SELECT $1, $2, id, CURRENT_DATE - 5 FROM credential_types WHERE organization_id = $1 AND name = 'CPR Certification'`,
      [org.id, nia.id],
    );
    const { rows } = await pool.query(
      'SELECT id FROM checklist_tasks WHERE organization_id = $1 ORDER BY sort_order LIMIT 1',
      [org.id],
    );
    firstTaskId = rows[0].id;
  });

  after(closeDb);

  describe('GET /api/staff/:id', () => {
    it('shows everything on the page to an admin', async () => {
      const agent = await loggedInAgent(admin);
      const res = await agent.get(`/api/staff/${nia.id}`).expect(200);
      const page = res.body;

      assert.equal(page.person.full_name, 'Nia Newhire');
      assert.equal(page.person.status, 'onboarding');
      assert.equal('password_hash' in page.person, false);
      assert.deepEqual(page.supervisors.map((s) => s.full_name), ['Sue Supervisor']);
      assert.equal(page.checklist.length, 5);
      assert.equal(page.checklist[0].done, false);

      const docs = Object.fromEntries(page.documents.map((d) => [d.type, d.state]));
      assert.deepEqual(docs, {
        'CPR Certification': 'expired',
        'Car Insurance': 'missing',
        "Driver's License": 'missing',
        'TB Test': 'missing',
      });

      assert.deepEqual(page.can, {
        editDetails: true,
        changeRole: true,
        changeStatus: true,
        changeSupervisors: true,
        tickTasks: true,
        writeNotes: true,
      });
      // Supervisor choices: admins, managers and supervisors, never the person themselves or employees.
      const options = page.supervisorOptions.map((u) => u.full_name);
      assert.ok(options.includes('Sue Supervisor'));
      assert.ok(options.includes('Max Manager'));
      assert.ok(!options.includes('Eve Employee'));
      assert.ok(!options.includes('Nia Newhire'));
    });

    it('lets managers view, but not change anything here', async () => {
      const agent = await loggedInAgent(manager);
      const res = await agent.get(`/api/staff/${nia.id}`).expect(200);
      assert.ok(Object.values(res.body.can).every((allowed) => allowed === false));
      assert.deepEqual(res.body.supervisorOptions, []);
    });

    it("lets supervisors view their team, but not people outside it", async () => {
      await (await loggedInAgent(supervisor)).get(`/api/staff/${nia.id}`).expect(200);
      await (await loggedInAgent(otherSupervisor)).get(`/api/staff/${nia.id}`).expect(404);
    });

    it("hides people at other agencies (as if they don't exist)", async () => {
      const agent = await loggedInAgent(admin);
      await agent.get(`/api/staff/${stranger.id}`).expect(404);
      await agent.get('/api/staff/999999').expect(404);
      await agent.get('/api/staff/not-a-number').expect(404);
    });

    it('blocks employees', async () => {
      const agent = await loggedInAgent(employee);
      await agent.get(`/api/staff/${nia.id}`).expect(403);
    });
  });

  describe('PATCH /api/staff/:id', () => {
    it('lets admins edit details and records what changed', async () => {
      const person = await createUser({ organizationId: org.id, fullName: 'Pat Before' });
      const agent = await loggedInAgent(admin);

      const res = await agent
        .patch(`/api/staff/${person.id}`)
        .send({ fullName: 'Pat After', phone: '555-0100', startDate: '2030-02-01' })
        .expect(200);

      assert.equal(res.body.person.full_name, 'Pat After');
      assert.equal(res.body.person.start_date, '2030-02-01');

      const [entry] = await history(person.id);
      assert.equal(entry.action, 'user.updated');
      assert.equal(entry.actor_id, admin.id);
      assert.deepEqual(entry.changes, {
        full_name: { from: 'Pat Before', to: 'Pat After' },
        phone: { from: null, to: '555-0100' },
        start_date: { from: null, to: '2030-02-01' },
      });
    });

    it("doesn't record anything when nothing actually changed", async () => {
      const person = await createUser({ organizationId: org.id, fullName: 'Same Name' });
      const agent = await loggedInAgent(admin);
      await agent.patch(`/api/staff/${person.id}`).send({ fullName: 'Same Name' }).expect(200);
      assert.deepEqual(await history(person.id), []);
    });

    it('moves someone from onboarding to active, and can archive and restore', async () => {
      const person = await createUser({ organizationId: org.id, status: 'onboarding' });
      const agent = await loggedInAgent(admin);

      await agent.patch(`/api/staff/${person.id}`).send({ status: 'active' }).expect(200);
      await agent.patch(`/api/staff/${person.id}`).send({ status: 'archived' }).expect(200);
      await agent.patch(`/api/staff/${person.id}`).send({ status: 'active' }).expect(200);

      const entries = await history(person.id);
      assert.deepEqual(
        entries.map((e) => [e.action, e.changes.status.to]),
        [
          ['user.status_changed', 'active'],
          ['user.status_changed', 'archived'],
          ['user.status_changed', 'active'],
        ],
      );
    });

    it('lets admins change roles', async () => {
      const person = await createUser({ organizationId: org.id });
      const agent = await loggedInAgent(admin);
      const res = await agent.patch(`/api/staff/${person.id}`).send({ role: 'supervisor' }).expect(200);
      assert.equal(res.body.person.role, 'supervisor');
    });

    it("doesn't let admins change their own role or status", async () => {
      const agent = await loggedInAgent(admin);
      const role = await agent.patch(`/api/staff/${admin.id}`).send({ role: 'employee' }).expect(403);
      assert.equal(role.body.error, "You can't change your own role");
      const status = await agent.patch(`/api/staff/${admin.id}`).send({ status: 'archived' }).expect(403);
      assert.equal(status.body.error, "You can't change your own status");
    });

    it('lets admins edit their own details', async () => {
      const agent = await loggedInAgent(admin2);
      await agent.patch(`/api/staff/${admin2.id}`).send({ phone: '555-0199' }).expect(200);
    });

    it('lets one admin archive another', async () => {
      const otherAdmin = await createUser({ organizationId: org.id, role: 'admin' });
      const agent = await loggedInAgent(admin);
      await agent.patch(`/api/staff/${otherAdmin.id}`).send({ status: 'archived' }).expect(200);
    });

    for (const role of ['manager', 'supervisor']) {
      it(`doesn't let ${role}s edit anything`, async () => {
        const agent = await loggedInAgent({ manager, supervisor }[role]);
        await agent.patch(`/api/staff/${nia.id}`).send({ phone: '555' }).expect(403);
        await agent.patch(`/api/staff/${nia.id}`).send({ status: 'active' }).expect(403);
        await agent.patch(`/api/staff/${nia.id}`).send({ role: 'admin' }).expect(403);
      });
    }

    it('checks input the same way as adding a person', async () => {
      const agent = await loggedInAgent(admin);
      const cases = [
        [{ fullName: '  ' }, 400, 'Full name is required'],
        [{ email: 'nope' }, 400, 'That email address doesn’t look right'],
        [{ status: 'gone' }, 400, 'Unknown status'],
        [{ role: 'owner' }, 400, 'Unknown role'],
        [{}, 400, 'Nothing to change'],
        [{ email: employee.email }, 409, 'Someone already uses that email address'],
      ];
      for (const [body, status, error] of cases) {
        const res = await agent.patch(`/api/staff/${nia.id}`).send(body).expect(status);
        assert.equal(res.body.error, error);
      }
    });

    it("can't edit people at another agency", async () => {
      const agent = await loggedInAgent(admin);
      await agent.patch(`/api/staff/${stranger.id}`).send({ fullName: 'Hacked' }).expect(404);
      const { rows } = await pool.query('SELECT full_name FROM users WHERE id = $1', [stranger.id]);
      assert.equal(rows[0].full_name, 'Otto Other');
    });
  });

  describe('PUT /api/staff/:id/supervisors', () => {
    it('replaces the supervisors and records the names', async () => {
      const person = await createUser({ organizationId: org.id });
      const agent = await loggedInAgent(admin);

      await agent.put(`/api/staff/${person.id}/supervisors`).send({ supervisorIds: [supervisor.id] }).expect(200);
      await agent
        .put(`/api/staff/${person.id}/supervisors`)
        .send({ supervisorIds: [otherSupervisor.id, manager.id] })
        .expect(200);

      const { rows } = await pool.query('SELECT supervisor_id FROM user_supervisors WHERE employee_id = $1', [
        person.id,
      ]);
      assert.deepEqual(rows.map((r) => r.supervisor_id).sort(), [manager.id, otherSupervisor.id].sort());

      const entries = await history(person.id);
      assert.deepEqual(entries[1].changes, {
        supervisors: { from: ['Sue Supervisor'], to: ['Max Manager', 'Sid Supervisor'] },
      });
    });

    it('only accepts current admins, managers or supervisors at the same agency', async () => {
      const otherOrgBoss = await createUser({ organizationId: otherOrg.id, role: 'supervisor' });
      const archivedBoss = await createUser({ organizationId: org.id, role: 'supervisor', status: 'archived' });
      const agent = await loggedInAgent(admin);

      for (const ids of [[employee.id], [otherOrgBoss.id], [archivedBoss.id], [nia.id], ['x']]) {
        await agent.put(`/api/staff/${nia.id}/supervisors`).send({ supervisorIds: ids }).expect(400);
      }
    });

    it("doesn't let managers change supervisors", async () => {
      const agent = await loggedInAgent(manager);
      await agent.put(`/api/staff/${nia.id}/supervisors`).send({ supervisorIds: [] }).expect(403);
    });
  });

  describe('PUT /api/staff/:id/tasks/:taskId', () => {
    it('ticks and unticks a task, recording who did it', async () => {
      const person = await createUser({ organizationId: org.id });
      const agent = await loggedInAgent(admin);

      await agent.put(`/api/staff/${person.id}/tasks/${firstTaskId}`).send({ done: true }).expect(200);
      // Ticking twice (e.g. a double-click) changes nothing.
      await agent.put(`/api/staff/${person.id}/tasks/${firstTaskId}`).send({ done: true }).expect(200);

      let page = (await agent.get(`/api/staff/${person.id}`)).body;
      assert.equal(page.checklist[0].done, true);
      assert.equal(page.checklist[0].completed_by_name, 'Ada Admin');

      await agent.put(`/api/staff/${person.id}/tasks/${firstTaskId}`).send({ done: false }).expect(200);
      page = (await agent.get(`/api/staff/${person.id}`)).body;
      assert.equal(page.checklist[0].done, false);

      assert.deepEqual(
        (await history(person.id)).map((e) => e.action),
        ['task.completed', 'task.reopened'],
      );
    });

    it("rejects another agency's task", async () => {
      const { rows } = await pool.query('SELECT id FROM checklist_tasks WHERE organization_id = $1 LIMIT 1', [
        otherOrg.id,
      ]);
      const agent = await loggedInAgent(admin);
      await agent.put(`/api/staff/${nia.id}/tasks/${rows[0].id}`).send({ done: true }).expect(404);
    });

    it("doesn't let managers tick tasks", async () => {
      const agent = await loggedInAgent(manager);
      await agent.put(`/api/staff/${nia.id}/tasks/${firstTaskId}`).send({ done: true }).expect(403);
    });
  });

  describe('POST /api/staff/:id/notes', () => {
    it('adds a note that shows on the page with its author', async () => {
      const agent = await loggedInAgent(admin);
      await agent.post(`/api/staff/${nia.id}/notes`).send({ body: '  Called about TB test  ' }).expect(201);

      const page = (await agent.get(`/api/staff/${nia.id}`)).body;
      assert.equal(page.notes[0].body, 'Called about TB test');
      assert.equal(page.notes[0].author_name, 'Ada Admin');
      assert.equal(page.history[0].action, 'note.added');
    });

    it('rejects empty notes', async () => {
      const agent = await loggedInAgent(admin);
      await agent.post(`/api/staff/${nia.id}/notes`).send({ body: '   ' }).expect(400);
    });

    it("doesn't let managers or supervisors write notes", async () => {
      await (await loggedInAgent(manager)).post(`/api/staff/${nia.id}/notes`).send({ body: 'Hi' }).expect(403);
      await (await loggedInAgent(supervisor)).post(`/api/staff/${nia.id}/notes`).send({ body: 'Hi' }).expect(403);
    });
  });
});
