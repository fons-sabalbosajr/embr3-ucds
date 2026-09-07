const orgUnits = require('../shared/services/orgUnits');
const { principalOf } = require('../middleware/auth');

// Reads are open to any signed-in user: both domains need to render an office
// list. Writes are gated on the admin domain by the router.

async function listOrgUnits(req, res, next) {
  try {
    const includeInactive = req.query.includeInactive === 'true';
    res.json({ orgUnits: await orgUnits.list({ includeInactive }) });
  } catch (error) {
    next(error);
  }
}

async function createOrgUnit(req, res, next) {
  try {
    const user = principalOf(req);
    const doc = await orgUnits.create({ ...req.body, createdBy: user?.username || null });
    res.status(201).json({ orgUnit: doc });
  } catch (error) {
    next(error);
  }
}

async function updateOrgUnit(req, res, next) {
  try {
    res.json({ orgUnit: await orgUnits.update(req.params.id, req.body) });
  } catch (error) {
    next(error);
  }
}

async function addOrgUnitAlias(req, res, next) {
  try {
    await orgUnits.addAlias(req.params.code, req.body.alias);
    res.json({ orgUnit: await orgUnits.getByCode(req.params.code) });
  } catch (error) {
    next(error);
  }
}

module.exports = { listOrgUnits, createOrgUnit, updateOrgUnit, addOrgUnitAlias };
