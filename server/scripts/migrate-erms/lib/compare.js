// ---------------------------------------------------------------------------
// Comparing a desktop-ERMS export against erms-records.
//
// Extracted from divergence.js so the classification can be tested: a checker
// that reports "no divergence" is only reassuring if it has been shown to
// report divergence when there is some.
// ---------------------------------------------------------------------------

/**
 * Fields worth comparing.
 *
 * Deliberately excludes anything the web module owns or stamps: _id, ucdsRef
 * (computed from the register, absent from the export), archive, createdAt,
 * updatedAt, migratedAt and dataQuality. Comparing those would report a
 * difference on every record and drown the real ones.
 */
const COMPARED = [
  ['proponentName', (d) => d.proponentName],
  ['projectTitle', (d) => d.projectTitle],
  ['remarks', (d) => d.remarks],
  ['permit.type', (d) => d.permit?.type],
  ['permit.number', (d) => d.permit?.number],
  ['permit.processSource', (d) => d.permit?.processSource],
  ['permit.dateApproved', (d) => iso(d.permit?.dateApproved)],
  ['permit.dateAmended', (d) => iso(d.permit?.dateAmended)],
  ['project.type', (d) => d.project?.type],
  ['project.otherType', (d) => d.project?.otherType],
  ['location.province', (d) => d.location?.province],
  ['location.city', (d) => d.location?.city],
  ['location.barangay', (d) => d.location?.barangay],
  ['location.street', (d) => d.location?.street],
  ['document.fileName', (d) => d.document?.fileName],
  ['document.filePath', (d) => d.document?.filePath],
  ['document.fileClass', (d) => d.document?.fileClass],
  ['document.uploadedBy', (d) => d.document?.uploadedBy],
  ['document.uploadedAt', (d) => iso(d.document?.uploadedAt)],
];

function iso(v) {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** '' and undefined both mean "absent"; only null is stored. */
const norm = (v) => (v === undefined || v === '' ? null : v);

function diffOf(fromSource, fromDb) {
  const changes = [];
  for (const [field, get] of COMPARED) {
    const source = norm(get(fromSource));
    const database = norm(get(fromDb));
    if (JSON.stringify(source) !== JSON.stringify(database)) {
      changes.push({ field, source, database });
    }
  }
  return changes;
}

// Records filed in the web module: by a person ('ucds-erms'), or from the
// desktop's attachment register, which the export does not carry
// (legacy-sql/orphan-attachments.js, 'erms-attachment-register').
const WEB_SOURCES = new Set(['ucds-erms', 'erms-attachment-register']);

/**
 * Sort every record into one of the findings: web-only and set aside are
 * expected; source-only and conflicting are divergence.
 *
 * @param {Map<string, object>} sourceDocs  transformed rows from the export
 * @param {Array<object>} dbDocs            documents from erms-records
 * @param {{setAside?: Set<string>}} opts   serials VERA's duplicate fix set
 *   aside (erms-set-aside): one document filed twice in the desktop system,
 *   kept once in the web — absent from the database on purpose.
 */
function classify(sourceDocs, dbDocs, { setAside = new Set() } = {}) {
  const byDb = new Map(dbDocs.map((d) => [d.serialNo, d]));
  const webOnly = [];
  const sourceOnly = [];
  const conflicting = [];
  const asideFound = [];

  for (const [serialNo, doc] of byDb) {
    if (sourceDocs.has(serialNo)) continue;
    // A record the web module created is expected to be absent upstream.
    if (WEB_SOURCES.has(doc.legacySource)) webOnly.push(doc);
    else sourceOnly.push({ serialNo, side: 'missing from export', doc });
  }

  for (const [serialNo, sourceDoc] of sourceDocs) {
    const dbDoc = byDb.get(serialNo);
    if (!dbDoc) {
      if (setAside.has(serialNo)) asideFound.push(serialNo);
      else sourceOnly.push({ serialNo, side: 'missing from database', doc: sourceDoc });
      continue;
    }
    const changes = diffOf(sourceDoc, dbDoc);
    if (changes.length) conflicting.push({ serialNo, changes });
  }

  return { webOnly, sourceOnly, conflicting, setAside: asideFound, clean: !sourceOnly.length && !conflicting.length };
}

module.exports = { COMPARED, diffOf, classify, iso };
