const express = require('express');
const router = express.Router();
const { authenticateSession, resolveYearContext, requireDomain } = require('../middleware/auth');
const { DOMAINS } = require('../services/authorization');

// Every register route: authenticated, entitled to the UCDS domain, and inside
// a year container. Composed once rather than repeated across ~50 routes, so a
// new endpoint cannot be added with one of the three quietly missing.
const ucdsAccess = [authenticateSession, requireDomain(DOMAINS.UCDS), resolveYearContext];

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
router.post('/check-data', ucdsAccess, checkData);
router.post('/api/check-data', ucdsAccess, checkData);
router.get('/ucds/duplicates', ucdsAccess, getDuplicates);
router.get('/api/ucds/duplicates', ucdsAccess, getDuplicates);
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
router.get('/api/permits-summary', ucdsAccess, permitsSummary);
router.get('/api/ucds/dashboard-stats', ucdsAccess, dashboardStats);
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
router.get('/api/extract-province-data', ucdsAccess, extractProvinceData);
router.get('/api/monitored_dates', ucdsAccess, getMonitoredDates);
router.get('/api/daily_notices', ucdsAccess, getDailyNotices);

// Write endpoints migrated from server.js
router.put('/api/update-data/:id', ucdsAccess, logActivity, updateData);
router.put('/api/revert-by-ecc', ucdsAccess, logActivity, revertByEcc);
router.put('/api/permits-summary/update-expiry', ucdsAccess, logActivity, updatePermitExpiry);

// Create new establishment
router.post('/api/ucds/add-establishment', ucdsAccess, logActivity, addEstablishment);

module.exports = router;
