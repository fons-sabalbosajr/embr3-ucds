const nas = require('../../../services/nasStorage');
const { PROVINCES } = require('../../../services/provinces');
const config = require('./configService');

// ---------------------------------------------------------------------------
// Filing: where an uploaded document goes on a unit's share, and the write.
//
// The desktop ERMS filed by hand-built folders — province, a five-year
// bucket, the year, the project or company, then a folder per document
// kind:
//
//   Records     RECORDS\Database\Records Database\Bataan\2016-2020\2019\<project>\HWID Folder\<file>
//   Legal       LEGAL\Database\Legal Database\Pampanga\2023\<company>\NOV\<file>
//   Laboratory  LABORATORY\Database\Laboratory Database\Bulacan\2021-2025\2025\<station>\<file>
//
// The pattern per unit is configuration (Admin Settings > ERMS Config); this
// fills the tokens from the document being filed and writes the file there,
// so a scan uploaded through the application sits beside the ones the
// desktop system filed, findable the same way.
// ---------------------------------------------------------------------------

const PROVINCE_LABEL = Object.fromEntries(PROVINCES.map((p) => [p.key, p.label]));

/** The five-year bucket the desktop system used: 2021-2025, 2016-2020, … */
function yearRange(year) {
  const start = Math.floor((year - 1) / 5) * 5 + 1;
  return `${start}-${start + 4}`;
}

const get = (obj, dotted) => String(dotted || '').split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);

/** The year a document files under: its `yearField` date, else today. */
function yearFor(unitCfg, values) {
  const rawDate = get(values, unitCfg.folder.yearField) || get(values.fields || {}, unitCfg.folder.yearField) || values.date;
  const parsed = rawDate ? new Date(rawDate) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed.getFullYear() : new Date().getFullYear();
}

/**
 * The project/company/station folder a document files under.
 *
 * The desktop system had the clerk pick or make this folder by hand; here
 * it is derived from `folderField` (the project title, the company name)
 * unless the person chose one — `values.folder`, from the folder picker on
 * the upload form — which wins, so a scan can be filed beside an existing
 * folder's documents whatever the record calls the project.
 */
function folderFor(unitCfg, values) {
  // A name may not begin with dots either: ".." is refused as a segment
  // downstream, and a folder called "..x" is only ever a mistake.
  const chosen = String(nas.safeName(values.folder, 120) || '').replace(/^[. ]+/, '');
  if (chosen) return chosen;
  const folderSource = get(values, unitCfg.folder.folderField) || get(values.fields || {}, unitCfg.folder.folderField);
  return nas.safeName(folderSource, 120) || 'Unsorted';
}

function fillPattern(pattern, unitCfg, docType, values) {
  const province = PROVINCE_LABEL[values.province] || values.province || 'Unfiled';
  const year = yearFor(unitCfg, values);
  const typeFolder = nas.safeName(docType?.folder, 80) || '';
  return pattern
    .replace(/\{province\}/g, nas.safeName(province, 60) || 'Unfiled')
    .replace(/\{yearRange\}/g, yearRange(year))
    .replace(/\{year\}/g, String(year))
    .replace(/\{folder\}/g, folderFor(unitCfg, values))
    .replace(/\{typeFolder\}/g, typeFolder);
}

const joinShare = (root, filled) => [root, ...String(filled).split(/[\\/]+/)].filter(Boolean).join('\\');

/**
 * The share-relative directory for a document.
 *
 * @param unitCfg   the unit's configuration (root, pattern, folderField, yearField)
 * @param docType   the document type (its folder)
 * @param values    the document's values, for {folder} and {year}; province is `values.province`
 */
function directoryFor(unitCfg, docType, values) {
  // A subfolder the clerk chose inside the project folder takes the place
  // of the type folder; where the layout has no type folder it goes after
  // the project folder.
  const sub = nas.safeName(values.subfolder, 120);
  let pattern = unitCfg.folder.pattern;
  if (sub) pattern = /\{typeFolder\}/.test(pattern) ? pattern.replace(/\{typeFolder\}/g, '{subfolder}') : pattern + '\\{subfolder}';
  return joinShare(unitCfg.folder.root, fillPattern(pattern, unitCfg, docType, values).replace(/\{subfolder\}/g, sub || ''));
}

/**
 * The share-relative directory the project folders sit in — the pattern up
 * to `{folder}` — for the same province and date. Null when the unit's
 * layout has no `{folder}` level, in which case there is nothing to pick.
 */
function parentDirectoryFor(unitCfg, values) {
  const pattern = String(unitCfg.folder.pattern || '');
  const at = pattern.indexOf('{folder}');
  if (at < 0) return null;
  const prefix = pattern.slice(0, at).replace(/[\\/]+$/, '');
  return joinShare(unitCfg.folder.root, fillPattern(prefix, unitCfg, null, values));
}

/** The file name as filed: the type's prefix, then the uploaded name. */
function fileNameFor(docType, originalName) {
  const base = nas.safeName(originalName, 150) || 'document';
  const prefix = docType?.filePrefix ? nas.safeName(docType.filePrefix, 40) : null;
  if (!prefix || base.toLowerCase().startsWith(prefix.toLowerCase())) return base;
  return `${prefix} ${base}`;
}

/** Whether the upload is a kind the configuration accepts. */
async function checkUpload(file) {
  const cfg = await config.read();
  const ext = String(file?.originalname || '').toLowerCase().match(/\.[a-z0-9]{1,8}$/)?.[0] || '';
  if (!file || !file.buffer?.length) return { ok: false, code: 'NO_FILE', message: 'Choose a file to upload.' };
  if (!cfg.upload.allowedExtensions.includes(ext)) {
    return { ok: false, code: 'FILE_TYPE', message: `Only ${cfg.upload.allowedExtensions.join(', ')} files are accepted.` };
  }
  if (file.size > cfg.upload.maxMb * 1024 * 1024) {
    return { ok: false, code: 'FILE_TOO_LARGE', message: `Files are limited to ${cfg.upload.maxMb} MB.` };
  }
  return { ok: true };
}

/**
 * File one upload: compute the folder, write the bytes, describe the result
 * the way erms-records / erms-documents store a document.
 */
async function file(unitKey, docType, values, upload) {
  const unitCfg = await config.unit(unitKey);
  if (!unitCfg) return { ok: false, code: 'UNIT_UNKNOWN', message: 'Unknown unit.' };
  const check = await checkUpload(upload);
  if (!check.ok) return check;
  // A folder the person browsed to and chose — the desktop ERMS's way —
  // files the scan exactly there; otherwise the layout decides.
  if (values.targetPath) {
    const target = nas.safeRelativePath(values.targetPath);
    if (!target) return { ok: false, code: 'BAD_FOLDER', message: 'The chosen folder cannot be used. Choose another.' };
    return writeInto(unitCfg, joinShare(unitCfg.folder.root, target), docType, upload);
  }
  return writeInto(unitCfg, directoryFor(unitCfg, docType, values), docType, upload);
}

/** A directory under the unit's root, from a path relative to it ('' = the root); null when unusable. */
function underRoot(unitCfg, relative) {
  if (!relative) return unitCfg.folder.root;
  const safe = nas.safeRelativePath(relative);
  return safe ? joinShare(unitCfg.folder.root, safe) : null;
}

/** Where the layout would file for these values — the level the project folders are in — relative to the unit's root. */
function standardLevel(unitCfg, values) {
  const parent = parentDirectoryFor(unitCfg, values);
  if (!parent) return '';
  const root = String(unitCfg.folder.root || '').split(/[\\/]+/).filter(Boolean);
  return parent.split('\\').slice(root.length).join('\\');
}

/**
 * File one upload in the folder another document is already in — an
 * attachment beside the record it belongs to, as the desktop system filed
 * them (FSN-0000206 Att-00012 sits in FSN-0000206's ECC Folder). The folder
 * is taken from the stored path, so a record the desktop system filed under
 * a hand-made project folder gets its attachment there, not in a new one.
 * Returns { ok: false, code: 'NO_FOLDER' } when the stored path has none.
 */
async function fileBeside(unitKey, docType, storedPath, upload) {
  const unitCfg = await config.unit(unitKey);
  if (!unitCfg) return { ok: false, code: 'UNIT_UNKNOWN', message: 'Unknown unit.' };
  const segments = String(nas.safeRelativePath(storedPath) || '').split('\\').filter(Boolean);
  if (segments.length < 2) return { ok: false, code: 'NO_FOLDER', message: 'The record\'s document has no folder to file beside.' };
  const check = await checkUpload(upload);
  if (!check.ok) return check;
  return writeInto(unitCfg, segments.slice(0, -1).join('\\'), docType, upload);
}

/** Write the bytes into `dir` on the unit's container and describe the result. */
async function writeInto(unitCfg, dir, docType, upload) {
  const name = fileNameFor(docType, upload.originalname);
  const written = await nas.writeFile(unitCfg.container, dir, name, upload.buffer);
  if (!written.ok) {
    const messages = {
      'not-configured': ['NAS_NOT_CONFIGURED', `The ${unitCfg.label} storage container is not configured on this server.`],
      disabled: ['NAS_DISABLED', 'Document access is turned off.'],
      denied: ['NAS_DENIED', 'The server is not permitted to write to this folder on the share.'],
      unreachable: ['NAS_UNREACHABLE', 'The share could not be reached.'],
      'invalid-path': ['BAD_FOLDER', 'The filing folder could not be resolved inside the share.'],
      'bad-name': ['BAD_NAME', 'The file name is not usable on the share.'],
    };
    const [code, message] = messages[written.reason] || ['NAS_ERROR', 'The file could not be written to the share.'];
    return { ok: false, code, message, reason: written.reason };
  }
  return {
    ok: true,
    document: {
      fileName: written.fileName,
      sharePath: written.sharePath,
      filePath: `Z:\\${written.sharePath}`,
      container: unitCfg.container,
      size: written.size,
      contentType: written.contentType,
    },
  };
}

module.exports = { yearRange, yearFor, folderFor, directoryFor, parentDirectoryFor, fileNameFor, checkUpload, file, fileBeside, underRoot, standardLevel };
