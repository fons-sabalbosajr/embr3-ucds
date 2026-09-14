const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { GridFSBucket } = require('mongodb');
const { connectToMongo, getDb } = require('../config/db');
const nas = require('./nasStorage');

// ---------------------------------------------------------------------------
// Generated report PDFs: from the database to the records share.
//
// Early ICIR drafts were stored inside MongoDB (GridFS, the pdfFiles.files
// and pdfFiles.chunks pair — the chunks ARE the file bytes, split into 255 KB
// pieces; the two collections are one thing and go together). Three 16 MB
// reports cost 50 MB of a 512 MB cluster. Newer reports are written to the
// server's uploads folder. Neither is where the Bureau keeps documents: the
// records share is.
//
// This moves them to a folder inside the Records container —
// RECORDS\Database\E-Universe Reports by default — verifies every byte
// arrived, points the draft-report records at the new location, and only
// then lets the database copy be removed. The file route keeps serving the
// same URLs: it looks on the share first and falls back to GridFS until the
// move is done.
// ---------------------------------------------------------------------------

const BUCKET = 'pdfFiles';
const SUBDIR = (process.env.NAS_REPORTS_DIR || 'RECORDS\\Database\\E-Universe Reports').replace(/^[\\/]+|[\\/]+$/g, '');

const bucket = () => new GridFSBucket(getDb(), { bucketName: BUCKET });

/** Where a report file lives on the share, share-relative. */
const sharePathFor = (filename) => `${SUBDIR}\\${path.basename(filename)}`;

/** The share-side stat for a report file, or null. */
async function onShare(filename) {
  const s = await nas.statFile(sharePathFor(filename), nas.RECORDS_KEY);
  return s.ok ? s : null;
}

/** What is in the database, and which of it is already on the share. */
async function inventory() {
  await connectToMongo();
  const files = await getDb().collection(`${BUCKET}.files`).find({}).sort({ uploadDate: 1 }).toArray();
  const chunks = await getDb().collection(`${BUCKET}.chunks`).estimatedDocumentCount();
  const drafts = await getDb().collection('draft-reports').find({}, { projection: { fileName: 1, pdfUrl: 1, storage: 1 } }).toArray();
  const items = [];
  for (const f of files) {
    const shared = await onShare(f.filename);
    items.push({
      id: String(f._id),
      filename: f.filename,
      bytes: f.length,
      uploadedAt: f.uploadDate,
      onShare: Boolean(shared),
      shareBytes: shared?.size ?? null,
      verified: Boolean(shared && shared.size === f.length),
      referencedBy: drafts.filter((d) => d.fileName === f.filename).length,
    });
  }
  const cfg = nas.nasConfig(nas.RECORDS_KEY);
  // What the folder on the share holds now, so the screen still shows the
  // reports after the database copy is gone.
  const listing = cfg?.enabled ? await nas.listDirectory(SUBDIR, nas.RECORDS_KEY) : { ok: false, reason: 'disabled' };
  const shareItems = listing.ok
    ? listing.entries
        .filter((e) => e.type === 'file')
        .map((e) => ({ name: e.name, bytes: e.size ?? null, modifiedAt: e.modifiedAt ?? null }))
    : [];
  return {
    folder: SUBDIR,
    containerConfigured: Boolean(cfg),
    containerEnabled: Boolean(cfg?.enabled),
    folderState: listing.ok ? 'ok' : listing.reason,
    shareFiles: shareItems.length,
    shareItems,
    databaseFiles: items.length,
    databaseChunks: chunks,
    databaseBytes: items.reduce((n, i) => n + i.bytes, 0),
    allVerified: items.length > 0 && items.every((i) => i.verified),
    items,
  };
}

/**
 * Copy every database file to the share and verify it. Idempotent: a file
 * already there with the right size is left alone. Nothing is deleted here.
 */
async function moveToShare(actor) {
  const cfg = nas.nasConfig(nas.RECORDS_KEY);
  if (!cfg) return { ok: false, status: 503, message: 'The Records container is not configured.' };
  if (!cfg.enabled) return { ok: false, status: 503, message: 'The Records container is switched off.' };

  const dir = nas.resolveSharePath(SUBDIR, nas.RECORDS_KEY);
  if (!dir) return { ok: false, status: 400, message: 'The report folder does not resolve inside the Records container.' };
  try {
    await fsp.mkdir(nas.toLongPath(dir), { recursive: true });
  } catch (err) {
    if (err.code === 'EACCES' || err.code === 'EPERM') {
      return { ok: false, status: 502, code: 'SHARE_READ_ONLY', message: 'The Records service account cannot create folders on the share. Ask the NAS administrator for write access to RECORDS\\Database, or use an account that has it.' };
    }
    return { ok: false, status: 502, message: `Could not create the folder on the share (${err.code || err.message}).` };
  }

  await connectToMongo();
  const files = await getDb().collection(`${BUCKET}.files`).find({}).toArray();
  const results = [];
  for (const f of files) {
    const dest = nas.resolveSharePath(sharePathFor(f.filename), nas.RECORDS_KEY);
    const existing = await onShare(f.filename);
    if (existing && existing.size === f.length) {
      results.push({ filename: f.filename, ok: true, skipped: true });
      continue;
    }
    try {
      await new Promise((resolve, reject) =>
        bucket().openDownloadStream(f._id).pipe(fs.createWriteStream(nas.toLongPath(dest))).on('finish', resolve).on('error', reject)
      );
      const check = await onShare(f.filename);
      if (!check || check.size !== f.length) throw new Error(`size mismatch after copy (${check?.size} vs ${f.length})`);
      await getDb().collection('draft-reports').updateMany(
        { fileName: f.filename },
        { $set: { storage: 'nas', pdfUrl: sharePathFor(f.filename), movedAt: new Date(), movedBy: actor?.username || 'unknown' } }
      );
      results.push({ filename: f.filename, ok: true, bytes: f.length });
    } catch (err) {
      results.push({ filename: f.filename, ok: false, message: err.code === 'EPERM' || err.code === 'EACCES' ? 'write refused by the share' : err.message });
    }
  }
  return { ok: results.every((r) => r.ok), results, folder: SUBDIR };
}

/**
 * Drop the database copy. Refuses unless every file has been verified on the
 * share, so this cannot be the step that loses a report.
 */
async function removeFromDatabase() {
  const inv = await inventory();
  if (!inv.databaseFiles) return { ok: true, removed: 0, message: 'Nothing left in the database.' };
  if (!inv.allVerified) {
    const missing = inv.items.filter((i) => !i.verified).map((i) => i.filename);
    return { ok: false, status: 409, code: 'NOT_ON_SHARE', message: `Not every file is verified on the share yet: ${missing.join(', ')}. Move them first.` };
  }
  await getDb().collection(`${BUCKET}.chunks`).drop().catch(() => {});
  await getDb().collection(`${BUCKET}.files`).drop().catch(() => {});
  return { ok: true, removed: inv.databaseFiles, bytes: inv.databaseBytes };
}

/**
 * A readable stream for a report by file name: the share first, then the
 * database while the move is still pending. Null when neither has it.
 */
async function openReport(filename) {
  const name = path.basename(String(filename || ''));
  if (!name) return null;
  const shared = await onShare(name);
  if (shared) return { source: 'nas', size: shared.size, stream: nas.openStream(shared.resolved) };
  await connectToMongo();
  const f = await getDb().collection(`${BUCKET}.files`).findOne({ filename: name });
  if (f) return { source: 'database', size: f.length, stream: bucket().openDownloadStreamByName(name) };
  return null;
}

module.exports = { SUBDIR, inventory, moveToShare, removeFromDatabase, openReport, sharePathFor };
