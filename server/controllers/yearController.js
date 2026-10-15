const yearService = require('../services/yearService');
const { roleOf, authorizedYears, canAccessYear, canAccessAllYears } = require('../services/authorization');
const { principalOf } = require('../middleware/auth');
const { PROVINCES } = require('../services/provinces');

/** GET /api/years — the containers this user may enter, plus their role. */
async function listAuthorizedYears(req, res) {
  try {
    const user = principalOf(req);
    const allowed = await authorizedYears(user);
    const all = await yearService.listYears();
    const lockFuture = (await require('../services/ucdsSettings').read()).years.lockFuture !== false;

    return res.json({
      role: roleOf(user),
      canAccessAllYears: canAccessAllYears(user),
      activeYear: (req.session && req.session.activeYear) || null,
      // Oldest first, so the list reads as a timeline. `open` is false for a
      // year that has not arrived yet: the picker shows it but does not let
      // anyone in, and selectYear below refuses it regardless.
      years: all
        .filter((y) => allowed.includes(y.year))
        .sort((a, b) => a.year - b.year)
        .map((y) => ({
          year: y.year,
          label: y.label,
          description: y.description,
          provinces: y.provinces || [],
          open: y.locked !== true && (y.openEarly === true || (lockFuture ? yearService.isOpenYear(y.year) : true)),
          locked: y.locked === true,
        })),
    });
  } catch (error) {
    console.error('Error listing year containers:', error);
    return res.status(500).json({ error: 'Failed to load year containers' });
  }
}

/** POST /api/years/select — the single place an active year is established. */
async function selectYear(req, res) {
  try {
    const user = principalOf(req);
    const { year } = req.body || {};
    const n = Number(year);

    if (!Number.isInteger(n)) {
      return res.status(400).json({ error: 'A year is required.' });
    }
    if (!(await yearService.isOpenYearNow(n))) {
      const doc = await yearService.getYear(n);
      return res.status(409).json({
        code: doc?.locked ? 'YEAR_LOCKED' : 'YEAR_NOT_OPEN',
        error: doc?.locked ? `The ${n} container is locked.` : `The ${n} container opens in January ${n}.`,
      });
    }
    if (!(await yearService.isSelectableYear(n))) {
      return res.status(404).json({ error: `Year container ${n} is not available.` });
    }
    if (!(await canAccessYear(user, n))) {
      return res.status(403).json({
        code: 'YEAR_FORBIDDEN',
        error: `You are not authorized to access the ${n} data container.`,
      });
    }

    if (!req.session) {
      return res.status(500).json({ error: 'Session unavailable.' });
    }
    req.session.activeYear = n;

    // Persist before replying so the next request sees the year.
    return req.session.save((err) => {
      if (err) {
        console.error('Error saving active year to session:', err);
        return res.status(500).json({ error: 'Failed to select year container.' });
      }
      return res.json({ status: 'success', activeYear: n });
    });
  } catch (error) {
    console.error('Error selecting year container:', error);
    return res.status(500).json({ error: 'Failed to select year container' });
  }
}

/** GET /api/years/active */
async function getActiveYear(req, res) {
  const activeYear = (req.session && req.session.activeYear) || null;
  if (!activeYear) return res.status(409).json({ code: 'NO_ACTIVE_YEAR', activeYear: null });

  // A container can be archived, or access revoked, after selection.
  if (!(await canAccessYear(principalOf(req), activeYear))) {
    delete req.session.activeYear;
    return res.status(403).json({ code: 'YEAR_FORBIDDEN', activeYear: null });
  }
  return res.json({ activeYear });
}

/** POST /api/years/clear — used when returning to the container picker. */
function clearActiveYear(req, res) {
  if (req.session) delete req.session.activeYear;
  return res.json({ status: 'success' });
}

// --- Developer-only year management ----------------------------------------

async function listAllYears(req, res) {
  try {
    return res.json({ years: await yearService.listYears({ includeArchived: true }) });
  } catch (error) {
    console.error('Error listing all year containers:', error);
    return res.status(500).json({ error: 'Failed to load year containers' });
  }
}

async function createYear(req, res) {
  try {
    const user = principalOf(req);
    const created = await yearService.createYear({
      year: req.body?.year,
      label: req.body?.label,
      description: req.body?.description,
      provinces: req.body?.provinces,
      createdBy: user?.username || null,
    });
    return res.status(201).json(created);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('Error creating year container:', error);
    return res.status(500).json({ error: 'Failed to create year container' });
  }
}

async function updateYearStatus(req, res) {
  try {
    const { status, hidden, locked } = req.body || {};
    // Flags alone: hide/show or lock/unlock without touching the status.
    if (status === undefined) {
      const flagged = await yearService.setYearFlags(req.params.year, { hidden, locked });
      if (!flagged) return res.status(404).json({ error: 'Year container not found' });
      return res.json(flagged);
    }
    const updated = await yearService.setYearStatus(req.params.year, req.body?.status);
    if (!updated) return res.status(404).json({ error: 'Year container not found' });
    return res.json(updated);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('Error updating year container:', error);
    return res.status(500).json({ error: 'Failed to update year container' });
  }
}

async function updateYearProvinces(req, res) {
  try {
    const updated = await yearService.setYearProvinces(req.params.year, req.body?.provinces);
    if (!updated) return res.status(404).json({ error: 'Year container not found' });
    return res.json(updated);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('Error updating year provinces:', error);
    return res.status(500).json({ error: 'Failed to update province scope' });
  }
}

/** The seven Region III provinces, for building selectors. */
function listProvinces(req, res) {
  return res.json({ provinces: PROVINCES });
}

/**
 * What the current user may actually work on in the active container: the
 * container scope intersected with their own province permissions.
 */
function activeYearProvinces(req, res) {
  const allowed = new Set(req.provinceKeys || []);
  return res.json({
    year: req.activeYear,
    containerProvinces: req.yearContainer?.provinces || [],
    provinces: PROVINCES.filter((p) => allowed.has(p.key)),
  });
}

module.exports = {
  updateYearProvinces,
  listProvinces,
  activeYearProvinces,
  listAuthorizedYears,
  selectYear,
  getActiveYear,
  clearActiveYear,
  listAllYears,
  createYear,
  updateYearStatus,
};
