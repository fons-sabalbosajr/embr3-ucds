const express = require('express');
const router = express.Router();
const { authenticateSession, resolveYearContext } = require('../middleware/auth');

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
  permitExpiryBreakdown,
  listAllIndustries,
  eccCncSubtypesBreakdown,
  dashboardStats,
  listByEccCncSubtype,
  listByPermitStatus,
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
router.post('/check-data', authenticateSession, resolveYearContext, checkData);
router.post('/api/check-data', authenticateSession, resolveYearContext, checkData);
router.get('/ucds/duplicates', authenticateSession, resolveYearContext, getDuplicates);
router.get('/api/ucds/duplicates', authenticateSession, resolveYearContext, getDuplicates);
router.post('/ucds/update-duplicates', authenticateSession, resolveYearContext, updateDuplicates);
router.post('/api/ucds/update-duplicates', authenticateSession, resolveYearContext, updateDuplicates);
router.post('/archive-data', authenticateSession, resolveYearContext, archiveData);
router.post('/api/archive-data', authenticateSession, resolveYearContext, archiveData);
router.get('/ucds-data/:identifier', authenticateSession, resolveYearContext, getByIdentifier);
router.get('/api/ucds-data/:identifier', authenticateSession, resolveYearContext, getByIdentifier);
router.get('/ucds-data/distinct-values', authenticateSession, resolveYearContext, getDistinctValues);
router.get('/api/ucds-data/distinct-values', authenticateSession, resolveYearContext, getDistinctValues);
router.put('/ucds-data/bulk-update', authenticateSession, resolveYearContext, logActivity, bulkUpdateUcds);
router.put('/api/ucds-data/bulk-update', authenticateSession, resolveYearContext, logActivity, bulkUpdateUcds);
router.get('/ucds-data/distinct-dropdown-values', authenticateSession, resolveYearContext, getDistinctDropdownValues);
router.get('/api/ucds-data/distinct-dropdown-values', authenticateSession, resolveYearContext, getDistinctDropdownValues);

// Additional GET routes migrated from server.js
router.get('/api/permits-summary', authenticateSession, resolveYearContext, permitsSummary);
router.get('/ucds/permit-expiry-breakdown/:permitKey', authenticateSession, resolveYearContext, permitExpiryBreakdown);
router.get('/api/ucds/permit-expiry-breakdown/:permitKey', authenticateSession, resolveYearContext, permitExpiryBreakdown);
router.get('/ucds/list-all-industries', authenticateSession, resolveYearContext, listAllIndustries);
router.get('/api/ucds/list-all-industries', authenticateSession, resolveYearContext, listAllIndustries);
router.get('/ucds/ecc-cnc-subtypes-breakdown', authenticateSession, resolveYearContext, eccCncSubtypesBreakdown);
router.get('/api/ucds/ecc-cnc-subtypes-breakdown', authenticateSession, resolveYearContext, eccCncSubtypesBreakdown);
router.get('/api/ucds/dashboard-stats', authenticateSession, resolveYearContext, dashboardStats);
router.get('/api/ucds/list-by-ecc-cnc-subtype', authenticateSession, resolveYearContext, listByEccCncSubtype);
router.get('/api/ucds/list-by-permit-status', authenticateSession, resolveYearContext, listByPermitStatus);
router.get('/api/ucds-data/by-sort-key/:sort_key', authenticateSession, resolveYearContext, getBySortKey);
router.get('/api/ucds/next-id', authenticateSession, resolveYearContext, getNextId);
router.get('/api/ucds/search-name', authenticateSession, resolveYearContext, searchName);
router.get('/api/ucds/search-title', authenticateSession, resolveYearContext, searchTitle);
router.get('/api/ucds/search-industry-class', authenticateSession, resolveYearContext, searchIndustryClass);
router.get('/api/ucds/search-ecc-cnc', authenticateSession, resolveYearContext, searchEccCnc);
router.get('/api/ucds/check-duplicate', authenticateSession, resolveYearContext, checkDuplicate);
router.get('/api/ucds/search-pto-code', authenticateSession, resolveYearContext, searchPtoCode);
router.get('/api/ucds/search-wwdp-code', authenticateSession, resolveYearContext, searchWwdpCode);
router.get('/api/ucds/search-haz-id', authenticateSession, resolveYearContext, searchHazId);
router.get('/api/ucds/search-pco-no', authenticateSession, resolveYearContext, searchPcoNo);
router.get('/api/ucds/search-pco-name', authenticateSession, resolveYearContext, searchPcoName);

// Simple stats and lists
router.get('/api/firm-count', authenticateSession, resolveYearContext, firmCount);
router.get('/api/ucds', authenticateSession, resolveYearContext, getAllUcds);
router.get('/api/ucds-data', authenticateSession, resolveYearContext, getUcdsData);
router.get('/api/ucds-locations', authenticateSession, resolveYearContext, getUcdsLocations);
router.get('/api/ucds/count', authenticateSession, resolveYearContext, getUcdsCount);
router.get('/api/get-province-data', authenticateSession, resolveYearContext, getProvinceData);
router.get('/api/extract-province-data', authenticateSession, resolveYearContext, extractProvinceData);
router.get('/api/monitored_dates', authenticateSession, resolveYearContext, getMonitoredDates);
router.get('/api/daily_notices', authenticateSession, resolveYearContext, getDailyNotices);

// Write endpoints migrated from server.js
router.put('/api/update-data/:id', authenticateSession, resolveYearContext, logActivity, updateData);
router.put('/api/revert-by-ecc', authenticateSession, resolveYearContext, logActivity, revertByEcc);
router.put('/api/permits-summary/update-expiry', authenticateSession, resolveYearContext, logActivity, updatePermitExpiry);

// Create new establishment
router.post('/api/ucds/add-establishment', authenticateSession, resolveYearContext, logActivity, addEstablishment);

module.exports = router;
