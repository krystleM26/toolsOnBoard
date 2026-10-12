import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { addNote, getPersonPage, NotFoundError, setSupervisors, setTaskDone, updatePerson } from '../services/person.js';
import { createStaffMember, getSummary, listStaff } from '../services/staff.js';
import { ValidationError } from '../services/validation.js';

const router = Router();

const TABS = ['onboarding', 'active'];

// Everything here is for people who look after staff, never plain employees.
router.use(requireAuth, requireRole('admin', 'manager', 'supervisor'));

// Turns the errors our services throw into the right HTTP responses.
function handle(work) {
  return async (req, res) => {
    try {
      await work(req, res);
    } catch (err) {
      if (err instanceof NotFoundError) return res.status(404).json({ error: 'Not found' });
      if (err instanceof ValidationError) return res.status(err.status).json({ error: err.message });
      throw err;
    }
  };
}

// Route ids must be whole numbers; anything else can't exist.
function idParam(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) throw new NotFoundError();
  return id;
}

// GET /api/staff/summary -> "needs attention" numbers for both tabs
router.get('/summary', async (req, res) => {
  res.json(await getSummary(req.user));
});

// GET /api/staff?status=onboarding|active&search=sam&page=2
router.get('/', async (req, res) => {
  const { status, search } = req.query;
  if (!TABS.includes(status)) {
    return res.status(400).json({ error: 'status must be "onboarding" or "active"' });
  }
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);

  res.json(await listStaff(req.user, { status, search: search?.trim() || undefined, page }));
});

// POST /api/staff -> add a person (admins only)
router.post(
  '/',
  requireRole('admin'),
  handle(async (req, res) => {
    const person = await createStaffMember(req.user, req.body);
    res.status(201).json({ person });
  }),
);

// GET /api/staff/12 -> everything on that person's page
router.get(
  '/:id',
  handle(async (req, res) => {
    res.json(await getPersonPage(req.user, idParam(req.params.id)));
  }),
);

// PATCH /api/staff/12 -> edit details, role or status
router.patch(
  '/:id',
  handle(async (req, res) => {
    const person = await updatePerson(req.user, idParam(req.params.id), req.body ?? {});
    res.json({ person });
  }),
);

// PUT /api/staff/12/supervisors { supervisorIds: [3, 4] }
router.put(
  '/:id/supervisors',
  handle(async (req, res) => {
    await setSupervisors(req.user, idParam(req.params.id), req.body?.supervisorIds);
    res.json({ ok: true });
  }),
);

// PUT /api/staff/12/tasks/5 { done: true }
router.put(
  '/:id/tasks/:taskId',
  handle(async (req, res) => {
    await setTaskDone(req.user, idParam(req.params.id), idParam(req.params.taskId), req.body?.done);
    res.json({ ok: true });
  }),
);

// POST /api/staff/12/notes { body: "Called about TB test" }
router.post(
  '/:id/notes',
  handle(async (req, res) => {
    const note = await addNote(req.user, idParam(req.params.id), req.body?.body);
    res.status(201).json({ note });
  }),
);

export default router;
