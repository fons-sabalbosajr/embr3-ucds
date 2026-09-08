const express = require('express');
const router = express.Router();
const { authenticateSession, requireDeveloper } = require('../middleware/auth');
const {
  upload,
  // field configs
  listFieldConfigs,
  createFieldConfig,
  updateFieldConfig,
  deleteFieldConfig,
  introspectUcdsFields,
  importFieldConfigsFromCollection,
  // pdf forms
  listPdfForms,
  uploadPdfFormHandler,
  streamPdfForm,
  deletePdfForm,
  // activity logs
  listActivityLogs,
  updateActivityLog,
  deleteActivityLog,
} = require('../controllers/developerController');

// ---------------------------------------------------------------------------
// Developer Settings.
//
// Every route here carried no authentication at all. /api/dev/activity-logs
// returned the audit trail — usernames, paths, request bodies — to anonymous
// callers, /api/dev/introspect returned sampled register values including firm
// names and addresses, and the DELETE routes let anyone remove audit entries or
// uploaded PDF forms.
//
// These are the screens the application itself labels "Developer Settings", so
// requireDeveloper is the matching guard and was already available.
// ---------------------------------------------------------------------------
const developerOnly = [authenticateSession, requireDeveloper];

// Field Management
router.get('/api/dev/field-configs', developerOnly, listFieldConfigs);
router.post('/api/dev/field-configs', developerOnly, createFieldConfig);
router.put('/api/dev/field-configs/:id', developerOnly, updateFieldConfig);
router.delete('/api/dev/field-configs/:id', developerOnly, deleteFieldConfig);
// Introspection and import helpers
router.get('/api/dev/introspect/ucds-data/fields', developerOnly, introspectUcdsFields);
router.post('/api/dev/field-configs/import', developerOnly, importFieldConfigsFromCollection);

// PDF Forms (upload/list/preview/delete)
router.get('/api/dev/pdf-forms', developerOnly, listPdfForms);
router.post('/api/dev/pdf-forms', developerOnly, upload.single('file'), uploadPdfFormHandler);
router.get('/api/dev/pdf-forms/file/:id', developerOnly, streamPdfForm);
router.delete('/api/dev/pdf-forms/:id', developerOnly, deletePdfForm);

// Activity History Configuration
router.get('/api/dev/activity-logs', developerOnly, listActivityLogs);
router.put('/api/dev/activity-logs/:id', developerOnly, updateActivityLog);
router.delete('/api/dev/activity-logs/:id', developerOnly, deleteActivityLog);

module.exports = router;
