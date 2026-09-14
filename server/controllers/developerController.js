const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { connectToMongo, collections, ObjectId } = require('../config/db');

// Ensure upload directory exists (server/pdfuploads)
const uploadDir = path.join(__dirname, '..', 'pdfuploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer storage for PDF forms
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const safeName = file.originalname.replace(/[^a-zA-Z0-9_.-]/g, '_');
    cb(null, `${timestamp}-${safeName}`);
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    // accept PDF primarily; allow PSD enrollment but preview will be limited
    const allowed = ['application/pdf', 'image/vnd.adobe.photoshop'];
    if (allowed.includes(file.mimetype)) return cb(null, true);
    cb(new Error('Only PDF or PSD files are allowed'));
  },
});

// ---------- Field Management ----------
async function listFieldConfigs(req, res) {
  try {
    await connectToMongo();
    const { module, q } = req.query;
    const filter = {};
    if (module) filter.module = module;
    if (q) filter.$or = [
      { fieldKey: { $regex: q, $options: 'i' } },
      { label: { $regex: q, $options: 'i' } },
    ];
    const items = await collections.fieldConfigs
      .find(filter)
      .sort({ module: 1, order: 1, fieldKey: 1 })
      .toArray();
    res.json({ items });
  } catch (err) {
    console.error('listFieldConfigs error', err);
    res.status(500).json({ error: 'Failed to fetch field configs' });
  }
}

async function createFieldConfig(req, res) {
  try {
    await connectToMongo();
    const { module, fieldKey, label, type, required, visible, options, order } = req.body || {};
    if (!module || !fieldKey || !label) {
      return res.status(400).json({ error: 'module, fieldKey, and label are required' });
    }
    const exists = await collections.fieldConfigs.findOne({ module, fieldKey });
    if (exists) return res.status(409).json({ error: 'Field key already exists for this module' });

    const doc = {
      module,
      fieldKey,
      label,
      type: type || 'text',
      required: !!required,
      visible: visible !== false,
      options: Array.isArray(options) ? options : [],
      order: typeof order === 'number' ? order : 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const result = await collections.fieldConfigs.insertOne(doc);
    res.status(201).json({ _id: result.insertedId, ...doc });
  } catch (err) {
    console.error('createFieldConfig error', err);
    res.status(500).json({ error: 'Failed to create field config' });
  }
}

async function updateFieldConfig(req, res) {
  try {
    await connectToMongo();
    const { id } = req.params;
    const payload = req.body || {};
    delete payload._id;
    payload.updatedAt = new Date();
    const result = await collections.fieldConfigs.findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: payload },
      { returnDocument: 'after' }
    );
    if (!result.value) return res.status(404).json({ error: 'Not found' });
    res.json(result.value);
  } catch (err) {
    console.error('updateFieldConfig error', err);
    res.status(500).json({ error: 'Failed to update field config' });
  }
}

async function deleteFieldConfig(req, res) {
  try {
    await connectToMongo();
    const { id } = req.params;
    const del = await collections.fieldConfigs.deleteOne({ _id: new ObjectId(id) });
    if (!del.deletedCount) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('deleteFieldConfig error', err);
    res.status(500).json({ error: 'Failed to delete field config' });
  }
}

// ---------- PDF Forms ----------
async function listPdfForms(req, res) {
  try {
    await connectToMongo();
    const items = await collections.pdfForms.find({}).sort({ createdAt: -1 }).toArray();
    res.json({ items });
  } catch (err) {
    console.error('listPdfForms error', err);
    res.status(500).json({ error: 'Failed to list forms' });
  }
}

async function uploadPdfFormHandler(req, res) {
  // multer middleware populates req.file
  try {
    await connectToMongo();
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const { title, tags } = req.body || {};
    const doc = {
      title: title || req.file.originalname,
      tags: tags ? String(tags).split(',').map((t) => t.trim()).filter(Boolean) : [],
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
      path: path.join('pdfuploads', req.file.filename),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const result = await collections.pdfForms.insertOne(doc);
    res.status(201).json({ _id: result.insertedId, ...doc });
  } catch (err) {
    console.error('uploadPdfForm error', err);
    res.status(500).json({ error: 'Failed to upload form' });
  }
}

async function streamPdfForm(req, res) {
  try {
    await connectToMongo();
    const { id } = req.params;
    const meta = await collections.pdfForms.findOne({ _id: new ObjectId(id) });
    if (!meta) return res.status(404).json({ error: 'Not found' });
    const absPath = path.join(__dirname, '..', meta.path);
    if (!fs.existsSync(absPath)) return res.status(404).json({ error: 'File missing on server' });

    // Only stream preview for PDF
    if (meta.mimetype !== 'application/pdf') {
      return res.status(415).json({ error: 'Preview supported only for PDF' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    const stream = fs.createReadStream(absPath);
    stream.pipe(res);
  } catch (err) {
    console.error('streamPdfForm error', err);
    res.status(500).json({ error: 'Failed to stream form' });
  }
}

async function deletePdfForm(req, res) {
  try {
    await connectToMongo();
    const { id } = req.params;
    const meta = await collections.pdfForms.findOne({ _id: new ObjectId(id) });
    if (!meta) return res.status(404).json({ error: 'Not found' });
    const absPath = path.join(__dirname, '..', meta.path);
    await collections.pdfForms.deleteOne({ _id: meta._id });
    if (fs.existsSync(absPath)) {
      try { fs.unlinkSync(absPath); } catch (e) { /* ignore */ }
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('deletePdfForm error', err);
    res.status(500).json({ error: 'Failed to delete form' });
  }
}

// ---------- Activity History Configuration ----------
async function listActivityLogs(req, res) {
  try {
    await connectToMongo();
    const { username, actionType, method, path, q, start, end, limit = 200, skip = 0 } = req.query;
    const filter = {};
    if (username) filter.username = username;
    if (actionType) filter.actionType = actionType;
    if (method) filter.method = method;
    if (path) filter.path = { $regex: String(path), $options: 'i' };
    if (q) {
      filter.$or = [
        { actionLabel: { $regex: String(q), $options: 'i' } },
        { message: { $regex: String(q), $options: 'i' } },
      ];
    }
    // Date range across timestamp/createdAt
    if (start || end) {
      const range = {};
      if (start) range.$gte = new Date(start);
      if (end) range.$lte = new Date(end);
      const dateOr = [];
      dateOr.push({ timestamp: range });
      dateOr.push({ createdAt: range });
      filter.$and = [...(filter.$and || []), { $or: dateOr }];
    }
    const total = await collections.activityLogs.countDocuments(filter);
    const items = await collections.activityLogs
      .find(filter)
      .sort({ timestamp: -1, createdAt: -1, date: -1 })
      .skip(Number(skip))
      .limit(Number(limit))
      .toArray();
    res.json({ items, total });
  } catch (err) {
    console.error('listActivityLogs error', err);
    res.status(500).json({ error: 'Failed to fetch activity logs' });
  }
}

// ---------- Introspect and Import (UCDS) ----------
async function introspectUcdsFields(req, res) {
  try {
    await connectToMongo();
    const col = require('../config/db').getDb().collection('ucds-data');
    const docs = await col.find({}, { projection: { _id: 0 } }).limit(200).toArray();
    const fieldMap = new Map();

    const inferType = (v) => {
      if (v === null || v === undefined) return 'text';
      if (typeof v === 'number') return 'number';
      if (typeof v === 'boolean') return 'boolean';
      if (v instanceof Date) return 'date';
      if (typeof v === 'string') {
        // simple date-like detection
        if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(v) || /\d{4}-\d{2}-\d{2}/.test(v)) return 'date';
        return 'text';
      }
      return 'text';
    };

    for (const d of docs) {
      Object.keys(d || {}).forEach((k) => {
        const current = fieldMap.get(k) || { key: k, count: 0, sample: undefined, type: 'text' };
        current.count += 1;
        const val = d[k];
        if (current.sample === undefined && val !== undefined) current.sample = val;
        if (current.type === 'text') current.type = inferType(val);
        fieldMap.set(k, current);
      });
    }

    const items = Array.from(fieldMap.values())
      .filter((f) => f.key !== undefined)
      .sort((a, b) => a.key.localeCompare(b.key));

    res.json({ items });
  } catch (err) {
    console.error('introspectUcdsFields error', err);
    res.status(500).json({ error: 'Failed to introspect ucds-data fields' });
  }
}

async function importFieldConfigsFromCollection(req, res) {
  try {
    await connectToMongo();
    const { module, fields } = req.body || {};
    if (!module || !Array.isArray(fields)) return res.status(400).json({ error: 'module and fields[] are required' });

    let inserted = 0, skipped = 0;
    for (const f of fields) {
      const fieldKey = f.fieldKey || f.key;
      if (!fieldKey) { skipped++; continue; }
      const exists = await collections.fieldConfigs.findOne({ module, fieldKey });
      if (exists) { skipped++; continue; }
      const doc = {
        module,
        fieldKey,
        label: f.label || fieldKey.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase()),
        type: f.type || 'text',
        required: !!f.required,
        visible: f.visible !== false,
        options: Array.isArray(f.options) ? f.options : [],
        order: typeof f.order === 'number' ? f.order : 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await collections.fieldConfigs.insertOne(doc);
      inserted++;
    }
    res.json({ ok: true, inserted, skipped });
  } catch (err) {
    console.error('importFieldConfigsFromCollection error', err);
    res.status(500).json({ error: 'Failed to import field configs' });
  }
}

async function updateActivityLog(req, res) {
  try {
    await connectToMongo();
    const { id } = req.params;
    const payload = req.body || {};
    delete payload._id;
    // NAS audit entries are the security record of who read what on the
    // share; they are not editable, by anyone, from anywhere.
    const current = await collections.activityLogs.findOne({ _id: new ObjectId(id) }, { projection: { domain: 1 } });
    if (current?.domain === 'nas') return res.status(403).json({ message: 'NAS audit entries cannot be edited.' });
    const result = await collections.activityLogs.findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: payload },
      { returnDocument: 'after' }
    );
    if (!result.value) return res.status(404).json({ error: 'Not found' });
    res.json(result.value);
  } catch (err) {
    console.error('updateActivityLog error', err);
    res.status(500).json({ error: 'Failed to update activity log' });
  }
}

async function deleteActivityLog(req, res) {
  try {
    await connectToMongo();
    const { id } = req.params;
    const target = await collections.activityLogs.findOne({ _id: new ObjectId(id) }, { projection: { domain: 1 } });
    if (target?.domain === 'nas') return res.status(403).json({ message: 'NAS audit entries cannot be deleted.' });
    const del = await collections.activityLogs.deleteOne({ _id: new ObjectId(id) });
    if (!del.deletedCount) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('deleteActivityLog error', err);
    res.status(500).json({ error: 'Failed to delete activity log' });
  }
}

module.exports = {
  // multer uploader for route wiring
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
};
