const { connectToMongo, getDb, ObjectId } = require('../config/db');
const { badRequest, notFoundError } = require('../shared/middleware/errorHandler');

// ---------------------------------------------------------------------------
// User-added items in the Universe Central DB menu.
//
// Each year container's branch of the sidebar shows what the server found
// in the year folder: the Monitoring Plan (the register, per province) and
// the spreadsheets. Planning staff can now add their own items beside them
// — a folder to group things, or a table of their own — under the year, or
// under the Monitoring Plan folder, or inside a folder they made.
//
// An item is a name and a place. A `table` item will hold columns and rows
// of the Planning Unit's own design (the editor is the next step; the
// shape is here so nothing needs migrating when it lands). A `folder` only
// holds other items.
//
// Scoped by year container like everything in UCDS. Writing needs the
// canManageData capability, the same one that lets a person change the
// register; reading is any UCDS account in that year.
// ---------------------------------------------------------------------------

const COLLECTION = 'ucds-menu-items';
const KINDS = ['folder', 'table'];
// Where an item may hang: the year's root, the Monitoring Plan folder, or
// another user-made folder (by id).
const ROOTS = ['root', 'monitoring'];

const collection = () => getDb().collection(COLLECTION);

async function ensureIndexes() {
  await connectToMongo();
  await collection().createIndex({ year: 1, parent: 1, order: 1 });
}

const cleanLabel = (v) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);

function publicView(doc) {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return { id: String(_id), ...rest };
}

/** Every item for the given years, flat, ordered — the sidebar builds the tree. */
async function forYears(years) {
  await connectToMongo();
  const ys = years.map(Number).filter(Number.isInteger);
  if (!ys.length) return [];
  const docs = await collection().find({ year: { $in: ys } }).sort({ year: 1, order: 1, createdAt: 1 }).toArray();
  const byYear = new Map(ys.map((y) => [y, []]));
  for (const d of docs) byYear.get(d.year)?.push(publicView(d));
  return ys.map((year) => ({ year, items: byYear.get(year) || [] }));
}

async function get(year, id) {
  await connectToMongo();
  if (!ObjectId.isValid(id)) return null;
  const doc = await collection().findOne({ _id: new ObjectId(id), year });
  return publicView(doc);
}

/** A parent reference is a root name or the id of a folder in the same year. */
async function resolveParent(year, parent) {
  const p = String(parent || 'root').trim();
  if (ROOTS.includes(p)) return p;
  if (!ObjectId.isValid(p)) throw badRequest('Choose where the item goes.', 'BAD_PARENT');
  const folder = await collection().findOne({ _id: new ObjectId(p), year });
  if (!folder) throw notFoundError('That folder does not exist in this year.', 'PARENT_NOT_FOUND');
  if (folder.kind !== 'folder') throw badRequest('Items can only be placed inside a folder.', 'PARENT_NOT_FOLDER');
  return String(folder._id);
}

async function create(year, input, actor) {
  await connectToMongo();
  const label = cleanLabel(input?.label);
  if (!label) throw badRequest('Give the item a name.', 'LABEL_REQUIRED');
  const kind = KINDS.includes(input?.kind) ? input.kind : 'folder';
  const parent = await resolveParent(year, input?.parent);
  const last = await collection().find({ year, parent }).sort({ order: -1 }).limit(1).toArray();
  const doc = {
    year,
    parent,
    kind,
    label,
    order: last.length ? (last[0].order || 0) + 1 : 1,
    // A table's own design; empty until the editor fills it.
    table: kind === 'table' ? { columns: [], rowCount: 0 } : null,
    createdAt: new Date(),
    createdBy: actor?.username || 'unknown',
    updatedAt: null,
    updatedBy: null,
  };
  const { insertedId } = await collection().insertOne(doc);
  return publicView({ ...doc, _id: insertedId });
}

async function update(year, id, input, actor) {
  await connectToMongo();
  if (!ObjectId.isValid(id)) throw notFoundError('Item not found.', 'ITEM_NOT_FOUND');
  const before = await collection().findOne({ _id: new ObjectId(id), year });
  if (!before) throw notFoundError('Item not found.', 'ITEM_NOT_FOUND');
  const set = { updatedAt: new Date(), updatedBy: actor?.username || 'unknown' };
  if (input?.label !== undefined) {
    const label = cleanLabel(input.label);
    if (!label) throw badRequest('Give the item a name.', 'LABEL_REQUIRED');
    set.label = label;
  }
  if (input?.parent !== undefined) {
    const parent = await resolveParent(year, input.parent);
    if (parent === String(before._id)) throw badRequest('A folder cannot be moved into itself.', 'BAD_PARENT');
    // Nor into one of its own descendants.
    if (before.kind === 'folder' && !ROOTS.includes(parent)) {
      const ancestors = await ancestorIds(year, parent);
      if (ancestors.includes(String(before._id))) throw badRequest('A folder cannot be moved into its own contents.', 'BAD_PARENT');
    }
    set.parent = parent;
  }
  if (Number.isInteger(input?.order)) set.order = input.order;
  await collection().updateOne({ _id: before._id }, { $set: set });
  return publicView({ ...before, ...set });
}

async function ancestorIds(year, id) {
  const out = [];
  let cursor = id;
  for (let i = 0; i < 50 && cursor && !ROOTS.includes(cursor); i += 1) {
    const doc = await collection().findOne({ _id: new ObjectId(cursor), year }, { projection: { parent: 1 } });
    if (!doc) break;
    out.push(String(doc._id));
    cursor = doc.parent;
  }
  return out;
}

/** Remove an item and everything inside it. */
async function remove(year, id) {
  await connectToMongo();
  if (!ObjectId.isValid(id)) throw notFoundError('Item not found.', 'ITEM_NOT_FOUND');
  const root = await collection().findOne({ _id: new ObjectId(id), year });
  if (!root) throw notFoundError('Item not found.', 'ITEM_NOT_FOUND');
  const ids = [String(root._id)];
  let frontier = [String(root._id)];
  while (frontier.length) {
    const children = await collection().find({ year, parent: { $in: frontier } }, { projection: { _id: 1 } }).toArray();
    frontier = children.map((c) => String(c._id));
    ids.push(...frontier);
  }
  await collection().deleteMany({ _id: { $in: ids.map((x) => new ObjectId(x)) } });
  // A removed table's rows go with it (required here: customTables requires this file).
  await require('./customTables').removeRowsOf(year, ids);
  return { removed: ids.length, label: root.label };
}

module.exports = { COLLECTION, KINDS, ROOTS, ensureIndexes, forYears, get, create, update, remove };
