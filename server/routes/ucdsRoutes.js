const express = require('express');
const router = express.Router();
const { authenticateSession, resolveYearContext, requireDomain } = require('../middleware/auth');
const { DOMAINS } = require('../services/authorization');

// Every register route: authenticated, entitled to the UCDS domain, and inside
// a year container. Composed once rather than repeated across ~50 routes, so a
// new endpoint cannot be added with one of the three quietly missing.
const ucdsAccess = [authenticateSession, requireDomain(DOMAINS.UCDS), resolveYearContext];
// Routes that scan or aggregate the whole register. A few a minute per
// person is normal; hundreds would take the database away from everyone.
const { expensiveLimiter } = require('../config/security');
const heavy = [...ucdsAccess, expensiveLimiter];

// The firm register itself is shared across containers, but every request here
// still runs inside a year context: transaction logs written by these handlers
// belong to the active year, and the client must have chosen one to be in the
// application at all. Applied per route rather than with router.use(), because
// this router is mounted at '/' and router-level middleware would then run for
// every request in the app — including the year-selection endpoints.
const { logActivity } = require('../middleware/activityLog');
const {
  checkData,
  getDuplicates,
  updateDuplicates,
  archiveData,
  getByIdentifier,
  getDistinctValues,
  bulkUpdateUcds,
  getDistinctDropdownValues,
  permitsSummary,
  dashboardStats,
  getBySortKey,
  getNextId,
  searchName,
  searchTitle,
  searchIndustryClass,
  addEstablishment,
  firmCount,
  getAllUcds,
  searchEccCnc,
  checkDuplicate,
  searchPtoCode,
  searchWwdpCode,
  searchHazId,
  searchPcoNo,
  searchPcoName,
  getUcdsData,
  updateData,
  revertByEcc,
  updatePermitExpiry,
  getUcdsLocations,
  getUcdsCount,
  getProvinceData,
  extractProvinceData,
  getMonitoredDates,
  getDailyNotices,
} = require('../controllers/ucdsController');

// Keep legacy paths and methods
router.post('/check-data', heavy, checkData);
router.post('/api/check-data', heavy, checkData);
router.get('/ucds/duplicates', heavy, getDuplicates);
router.get('/api/ucds/duplicates', heavy, getDuplicates);
router.post('/ucds/update-duplicates', ucdsAccess, updateDuplicates);
router.post('/api/ucds/update-duplicates', ucdsAccess, updateDuplicates);
router.post('/archive-data', ucdsAccess, archiveData);
router.post('/api/archive-data', ucdsAccess, archiveData);
router.get('/ucds-data/:identifier', ucdsAccess, getByIdentifier);
router.get('/api/ucds-data/:identifier', ucdsAccess, getByIdentifier);
router.get('/ucds-data/distinct-values', ucdsAccess, getDistinctValues);
router.get('/api/ucds-data/distinct-values', ucdsAccess, getDistinctValues);
router.put('/ucds-data/bulk-update', ucdsAccess, logActivity, bulkUpdateUcds);
router.put('/api/ucds-data/bulk-update', ucdsAccess, logActivity, bulkUpdateUcds);
router.get('/ucds-data/distinct-dropdown-values', ucdsAccess, getDistinctDropdownValues);
router.get('/api/ucds-data/distinct-dropdown-values', ucdsAccess, getDistinctDropdownValues);

// Additional GET routes migrated from server.js
router.get('/api/permits-summary', heavy, permitsSummary);
router.get('/api/ucds/dashboard-stats', heavy, dashboardStats);

// The Monitoring Plan anchored to ERMS (validation only — the scans stay
// behind the Document Portal's request), its Excel export, and the monitoring
// accomplishment per province. See modules/ucds/services/ucdsReports.
{
  const reports = require('../modules/ucds/services/ucdsReports');
  const { provinceScoped } = require('../services/provinces');
  const { registerOf } = require('../services/yearScope');
  const scoped = (req) => provinceScoped(registerOf(req), req);
  router.post('/api/ucds/erms-anchor', ucdsAccess, async (req, res, next) => {
    try {
      const keys = (Array.isArray(req.body?.sortKeys) ? req.body.sortKeys : []).map(String).slice(0, 8000);
      res.json({ anchors: await reports.anchor(scoped(req), keys) });
    } catch (e) {
      next(e);
    }
  });
  router.get('/api/ucds/monitoring-plan/export.xlsx', heavy, async (req, res, next) => {
    try {
      const province = req.query.province ? String(req.query.province).slice(0, 40) : null;
      const { buffer, count } = await reports.monitoringPlanWorkbook(scoped(req), { province, ownRegister: require('../modules/ucds/services/healthcare').hasOwnRegister(req) });
      const name = `Monitoring-Plan-${province ? province.replace(/[^A-Za-z]/g, '') + '-' : ''}${new Date().toISOString().slice(0, 10)}.xlsx`;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
      res.setHeader('X-Export-Rows', String(count));
      res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, X-Export-Rows');
      res.end(buffer);
    } catch (e) {
      next(e);
    }
  });
  // The spreadsheet view's "Excel (this view)": the rows and columns on the
  // screen, as the person filtered and sorted them (ucdsReports.viewWorkbook).
  router.post('/api/ucds/spreadsheet/export.xlsx', heavy, async (req, res, next) => {
    try {
      const b = req.body || {};
      const { buffer, count } = await reports.viewWorkbook(scoped(req), {
        serials: Array.isArray(b.serials) ? b.serials : [],
        columns: Array.isArray(b.columns) ? b.columns : [],
        sheet: b.sheet ? String(b.sheet).slice(0, 31) : 'Monitoring Plan',
      });
      const name = `${String(b.sheet || 'Monitoring Plan').replace(/[^A-Za-z0-9 _-]/g, '').trim().replace(/\s+/g, '-') || 'Monitoring-Plan'}-${new Date().toISOString().slice(0, 10)}.xlsx`;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
      res.setHeader('X-Export-Rows', String(count));
      res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, X-Export-Rows');
      res.end(buffer);
    } catch (e) {
      next(e);
    }
  });
  router.get('/api/ucds/reports/not-in-erms', heavy, async (req, res, next) => {
    try {
      res.json({ rows: await reports.notInErms(scoped(req), { province: req.query.province ? String(req.query.province).slice(0, 40) : null }) });
    } catch (e) {
      next(e);
    }
  });
  router.get('/api/ucds/reports/accomplishment', heavy, async (req, res, next) => {
    try {
      res.json({ provinces: await reports.accomplishment(scoped(req)) });
    } catch (e) {
      next(e);
    }
  });
}
router.get('/api/ucds-data/by-sort-key/:sort_key', ucdsAccess, getBySortKey);
router.get('/api/ucds/next-id', ucdsAccess, getNextId);
router.get('/api/ucds/search-name', ucdsAccess, searchName);
router.get('/api/ucds/search-title', ucdsAccess, searchTitle);
router.get('/api/ucds/search-industry-class', ucdsAccess, searchIndustryClass);
router.get('/api/ucds/search-ecc-cnc', ucdsAccess, searchEccCnc);
router.get('/api/ucds/check-duplicate', ucdsAccess, checkDuplicate);
router.get('/api/ucds/search-pto-code', ucdsAccess, searchPtoCode);
router.get('/api/ucds/search-wwdp-code', ucdsAccess, searchWwdpCode);
router.get('/api/ucds/search-haz-id', ucdsAccess, searchHazId);
router.get('/api/ucds/search-pco-no', ucdsAccess, searchPcoNo);
router.get('/api/ucds/search-pco-name', ucdsAccess, searchPcoName);

// Simple stats and lists
router.get('/api/firm-count', ucdsAccess, firmCount);
router.get('/api/ucds', ucdsAccess, getAllUcds);
router.get('/api/ucds-data', ucdsAccess, getUcdsData);
router.get('/api/ucds-locations', ucdsAccess, getUcdsLocations);
router.get('/api/ucds/count', ucdsAccess, getUcdsCount);
router.get('/api/get-province-data', ucdsAccess, getProvinceData);
router.get('/api/extract-province-data', heavy, extractProvinceData);
router.get('/api/monitored_dates', ucdsAccess, getMonitoredDates);
router.get('/api/daily_notices', ucdsAccess, getDailyNotices);

// Write endpoints migrated from server.js
router.put('/api/update-data/:id', ucdsAccess, logActivity, updateData);
router.put('/api/revert-by-ecc', ucdsAccess, logActivity, revertByEcc);
router.put('/api/permits-summary/update-expiry', ucdsAccess, logActivity, updatePermitExpiry);

// Create new establishment
router.post('/api/ucds/add-establishment', ucdsAccess, logActivity, addEstablishment);

// The record view's "Locate from address": coordinates for an address, from
// MapTiler with the server's key (modules/ucds/services/geocode). The
// address only — no name, serial or permit leaves the server.
router.get('/api/ucds/geocode', ucdsAccess, async (req, res, next) => {
  try {
    const { geocode } = require('../modules/ucds/services/geocode');
    const s = (v) => String(v || '').slice(0, 120);
    const q = req.query || {};
    res.json({ result: await geocode({ street: s(q.street), barangay: s(q.barangay), city: s(q.city), province: s(q.province) }) });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    return next(err);
  }
});

// The Monitoring Status column's 2026 IIS reference numbers, which the
// register does not hold yet: read from the RAW files the Progress Tracker
// follows, by serial, for one province (services/progressTracker rawIis).
router.get('/api/ucds/raw-iis', ucdsAccess, async (req, res, next) => {
  try {
    const { rawIis } = require('../services/progressTracker');
    res.set('Cache-Control', 'private, max-age=60');
    res.json({ iis: await rawIis(String(req.query.province || '').slice(0, 40)) });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
