import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { createStaffMember, getSummary, listStaff, ValidationError } from '../services/staff.js';

const router = Router();

const TABS = ['onboarding', 'active'];

// Everything here is for people who look after staff, never plain employees.
router.use(requireAuth, requireRole('admin', 'manager', 'supervisor'));

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

// POST /api/staff -> add a person (admins and managers only)
router.post('/', requireRole('admin', 'manager'), async (req, res) => {
  try {
    const person = await createStaffMember(req.user, req.body);
    res.status(201).json({ person });
  } catch (err) {
    if (err instanceof ValidationError) {
      return res.status(err.status).json({ error: err.message });
    }
    throw err;
  }
});

export default router;
