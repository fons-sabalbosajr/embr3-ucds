const express = require('express');
const router = express.Router();
const { authenticateSession } = require('../middleware/auth');
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
router.post('/check-data', authenticateSession, checkData);
router.post('/api/check-data', authenticateSession, checkData);
router.get('/ucds/duplicates', authenticateSession, getDuplicates);
router.get('/api/ucds/duplicates', authenticateSession, getDuplicates);
router.post('/ucds/update-duplicates', authenticateSession, updateDuplicates);
router.post('/api/ucds/update-duplicates', authenticateSession, updateDuplicates);
router.post('/archive-data', authenticateSession, archiveData);
router.post('/api/archive-data', authenticateSession, archiveData);
router.get('/ucds-data/:identifier', authenticateSession, getByIdentifier);
router.get('/api/ucds-data/:identifier', authenticateSession, getByIdentifier);
router.get('/ucds-data/distinct-values', authenticateSession, getDistinctValues);
router.get('/api/ucds-data/distinct-values', authenticateSession, getDistinctValues);
router.put('/ucds-data/bulk-update', authenticateSession, logActivity, bulkUpdateUcds);
router.put('/api/ucds-data/bulk-update', authenticateSession, logActivity, bulkUpdateUcds);
router.get('/ucds-data/distinct-dropdown-values', authenticateSession, getDistinctDropdownValues);
router.get('/api/ucds-data/distinct-dropdown-values', authenticateSession, getDistinctDropdownValues);

// Additional GET routes migrated from server.js
router.get('/api/permits-summary', authenticateSession, permitsSummary);
router.get('/ucds/permit-expiry-breakdown/:permitKey', authenticateSession, permitExpiryBreakdown);
router.get('/api/ucds/permit-expiry-breakdown/:permitKey', authenticateSession, permitExpiryBreakdown);
router.get('/ucds/list-all-industries', authenticateSession, listAllIndustries);
router.get('/api/ucds/list-all-industries', authenticateSession, listAllIndustries);
router.get('/ucds/ecc-cnc-subtypes-breakdown', authenticateSession, eccCncSubtypesBreakdown);
router.get('/api/ucds/ecc-cnc-subtypes-breakdown', authenticateSession, eccCncSubtypesBreakdown);
router.get('/api/ucds/dashboard-stats', authenticateSession, dashboardStats);
router.get('/api/ucds/list-by-ecc-cnc-subtype', authenticateSession, listByEccCncSubtype);
router.get('/api/ucds/list-by-permit-status', authenticateSession, listByPermitStatus);
router.get('/api/ucds-data/by-sort-key/:sort_key', authenticateSession, getBySortKey);
router.get('/api/ucds/next-id', authenticateSession, getNextId);
router.get('/api/ucds/search-name', authenticateSession, searchName);
router.get('/api/ucds/search-title', authenticateSession, searchTitle);
router.get('/api/ucds/search-industry-class', authenticateSession, searchIndustryClass);
router.get('/api/ucds/search-ecc-cnc', authenticateSession, searchEccCnc);
router.get('/api/ucds/check-duplicate', authenticateSession, checkDuplicate);
router.get('/api/ucds/search-pto-code', authenticateSession, searchPtoCode);
router.get('/api/ucds/search-wwdp-code', authenticateSession, searchWwdpCode);
router.get('/api/ucds/search-haz-id', authenticateSession, searchHazId);
router.get('/api/ucds/search-pco-no', authenticateSession, searchPcoNo);
router.get('/api/ucds/search-pco-name', authenticateSession, searchPcoName);

// Simple stats and lists
router.get('/api/firm-count', authenticateSession, firmCount);
router.get('/api/ucds', authenticateSession, getAllUcds);
router.get('/api/ucds-data', authenticateSession, getUcdsData);
router.get('/api/ucds-locations', authenticateSession, getUcdsLocations);
router.get('/api/ucds/count', authenticateSession, getUcdsCount);
router.get('/api/get-province-data', authenticateSession, getProvinceData);
router.get('/api/extract-province-data', authenticateSession, extractProvinceData);
router.get('/api/monitored_dates', authenticateSession, getMonitoredDates);
router.get('/api/daily_notices', authenticateSession, getDailyNotices);

// Write endpoints migrated from server.js
router.put('/api/update-data/:id', authenticateSession, logActivity, updateData);
router.put('/api/revert-by-ecc', authenticateSession, logActivity, revertByEcc);
router.put('/api/permits-summary/update-expiry', authenticateSession, logActivity, updatePermitExpiry);

// Create new establishment
router.post('/api/ucds/add-establishment', authenticateSession, logActivity, addEstablishment);

module.exports = router;
