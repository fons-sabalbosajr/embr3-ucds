const express = require('express');
const router = express.Router();
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

// Field Management
router.get('/api/dev/field-configs', listFieldConfigs);
router.post('/api/dev/field-configs', createFieldConfig);
router.put('/api/dev/field-configs/:id', updateFieldConfig);
router.delete('/api/dev/field-configs/:id', deleteFieldConfig);
// Introspection and import helpers
router.get('/api/dev/introspect/ucds-data/fields', introspectUcdsFields);
router.post('/api/dev/field-configs/import', importFieldConfigsFromCollection);

// PDF Forms (upload/list/preview/delete)
router.get('/api/dev/pdf-forms', listPdfForms);
router.post('/api/dev/pdf-forms', upload.single('file'), uploadPdfFormHandler);
router.get('/api/dev/pdf-forms/file/:id', streamPdfForm);
router.delete('/api/dev/pdf-forms/:id', deletePdfForm);

// Activity History Configuration
router.get('/api/dev/activity-logs', listActivityLogs);
router.put('/api/dev/activity-logs/:id', updateActivityLog);
router.delete('/api/dev/activity-logs/:id', deleteActivityLog);

module.exports = router;
