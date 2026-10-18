const datasets = require('../services/datasetService');
const { principalOf } = require('../middleware/auth');
const { authorizedYears, hasCapability, isDeveloper } = require('../services/authorization');
const settings = require('../services/ucdsSettings');

// ---------------------------------------------------------------------------
// UCDS datasets — the yearly spreadsheets, served as tables.
//
// Every row route is year-scoped by resolveYearContext: the year is
// req.activeYear from the session, never from the request, so a URL for
// another year's rows answers with that year's nothing. The registry route is
// the exception — the sidebar needs every year the account may enter at once
// — and it returns names only.
// ---------------------------------------------------------------------------

/** For the sidebar: each authorized year with its datasets. */
async function registry(req, res, next) {
  try {
    const years = await authorizedYears(principalOf(req));
    res.json({ years: await datasets.registryFor(years) });
  } catch (error) {
    next(error);
  }
}

/** The active year's datasets, with import state. */
async function listForActiveYear(req, res, next) {
  try {
    const [entry] = await datasets.registryFor([req.activeYear]);
    res.json({ year: req.activeYear, datasets: entry?.datasets || [] });
  } catch (error) {
    next(error);
  }
}

async function describe(req, res, next) {
  try {
    const d = await datasets.describe(req.activeYear, req.params.key);
    if (!d) return res.status(404).json({ code: 'DATASET_NOT_FOUND', message: 'No such dataset for this year.' });
    return res.json({ year: req.activeYear, dataset: d });
  } catch (error) {
    return next(error);
  }
}

async function rowsPage(req, res, next) {
  try {
    const { sheet, page, pageSize, q, sortBy, sortDir } = req.query;
    res.json(await datasets.listRows(req.activeYear, req.params.key, { sheet, page, pageSize, q, sortBy, sortDir }));
  } catch (error) {
    next(error);
  }
}

const canEdit = (req) => hasCapability(principalOf(req), 'canManageData');

/** Editing can be switched off for everyone from Universe Central DB settings. */
async function editingAllowed(req, res) {
  if (!canEdit(req)) {
    res.status(403).json({ message: 'Your account cannot change data.' });
    return false;
  }
  if ((await settings.read()).datasets.editing === false) {
    res.status(403).json({ code: 'EDITING_OFF', message: 'Dataset editing is switched off in Universe Central DB settings.' });
    return false;
  }
  return true;
}

async function createRow(req, res, next) {
  try {
    if (!(await editingAllowed(req, res))) return undefined;
    const r = await datasets.addRow(req.activeYear, req.params.key, req.body?.sheet, req.body?.data, principalOf(req));
    return r.ok ? res.status(201).json(r) : res.status(r.status).json(r);
  } catch (error) {
    return next(error);
  }
}

async function updateRow(req, res, next) {
  try {
    if (!(await editingAllowed(req, res))) return undefined;
    const r = await datasets.updateRow(req.activeYear, req.params.key, req.params.id, req.body?.data, principalOf(req));
    return r.ok ? res.json(r) : res.status(r.status).json(r);
  } catch (error) {
    return next(error);
  }
}

async function createColumn(req, res, next) {
  try {
    if (!(await editingAllowed(req, res))) return undefined;
    const r = await datasets.addColumn(req.activeYear, req.params.key, req.body?.sheet, req.body?.name, principalOf(req));
    return r.ok ? res.status(201).json(r) : res.status(r.status).json(r);
  } catch (error) {
    return next(error);
  }
}

async function deleteRow(req, res, next) {
  try {
    if (!(await editingAllowed(req, res))) return undefined;
    const r = await datasets.deleteRow(req.activeYear, req.params.key, req.params.id);
    return r.ok ? res.json(r) : res.status(r.status).json(r);
  } catch (error) {
    return next(error);
  }
}

/** Developer only: (re)load the spreadsheet into the table. */
async function importDataset(req, res, next) {
  try {
    if (!isDeveloper(principalOf(req))) return res.status(403).json({ message: 'Developer access required' });
    const r = await datasets.importDataset(req.activeYear, req.params.key, principalOf(req));
    return r.ok ? res.json(r) : res.status(r.status).json(r);
  } catch (error) {
    return next(error);
  }
}

async function exportCsv(req, res, next) {
  try {
    if ((await settings.read()).datasets.export === false) {
      return res.status(403).json({ code: 'EXPORT_OFF', message: 'Export is switched off in Universe Central DB settings.' });
    }
    const d = await datasets.describe(req.activeYear, req.params.key);
    if (!d || !d.imported) return res.status(404).json({ message: 'Nothing to export: the dataset has not been imported.' });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${req.activeYear}-${req.params.key}.csv"`);
    res.write('﻿');
    for await (const chunk of datasets.exportCsv(req.activeYear, req.params.key, req.query.sheet)) res.write(chunk);
    return res.end();
  } catch (error) {
    return next(error);
  }
}

/** GET /api/ucds/settings — effective settings, for every UCDS screen. */
async function getSettings(req, res, next) {
  try {
    res.json(await settings.read());
  } catch (error) {
    next(error);
  }
}

/** PUT /api/ucds/settings — Developer or Administrator. */
async function putSettings(req, res, next) {
  try {
    res.json(await settings.save(req.body || {}, principalOf(req)));
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/ucds/datasets/import-year — Developer only. Imports one or all
 * of a year's spreadsheets without switching the session's container, for the
 * Data Management tab. The year must be one the caller may enter.
 */
async function importForYear(req, res, next) {
  try {
    const user = principalOf(req);
    if (!isDeveloper(user)) return res.status(403).json({ message: 'Developer access required' });
    const year = Number(req.body?.year);
    if (!(await authorizedYears(user)).includes(year)) return res.status(403).json({ message: 'That year container is not available to you.' });
    const [entry] = await datasets.registryFor([year]);
    const wanted = req.body?.key ? [String(req.body.key)] : (entry?.datasets || []).filter((d) => d.kind === 'table').map((d) => d.key);
    const results = [];
    for (const key of wanted) {
      const r = await datasets.importDataset(year, key, user);
      results.push({ key, ok: r.ok, rowCount: r.rowCount || 0, message: r.message || null });
    }
    return res.json({ year, results });
  } catch (error) {
    return next(error);
  }
}

// --- user-added menu items (see services/menuItems.js) -----------------------------

const menuItems = require('../services/menuItems');
const audit = require('../shared/services/audit');

/** Every year the account may enter, with the items people added under each. */
async function listMenuItems(req, res, next) {
  try {
    const years = await authorizedYears(principalOf(req));
    res.json({ years: await menuItems.forYears(years), canManage: canEdit(req) });
  } catch (error) {
    next(error);
  }
}

async function getMenuItem(req, res, next) {
  try {
    const item = await menuItems.get(req.activeYear, req.params.id);
    if (!item) return res.status(404).json({ code: 'ITEM_NOT_FOUND', message: 'No such item in this year.' });
    const [entry] = await menuItems.forYears([req.activeYear]);
    const children = (entry?.items || []).filter((i) => i.parent === item.id);
    return res.json({ year: req.activeYear, item, children });
  } catch (error) {
    return next(error);
  }
}

function requireMenuEdit(req, res, next) {
  if (!canEdit(req)) {
    return res.status(403).json({ code: 'CAPABILITY_REQUIRED', message: 'Adding items to the menu needs the Manage Data capability.' });
  }
  return next();
}

async function createMenuItem(req, res, next) {
  try {
    const item = await menuItems.create(req.activeYear, req.body || {}, principalOf(req));
    await audit.record(req, { domain: 'ucds', action: 'menu-item-create', label: `menu item added: ${item.label}`, collection: menuItems.COLLECTION, documentId: item.id });
    res.status(201).json({ item });
  } catch (error) {
    next(error);
  }
}

async function updateMenuItem(req, res, next) {
  try {
    const item = await menuItems.update(req.activeYear, req.params.id, req.body || {}, principalOf(req));
    await audit.record(req, { domain: 'ucds', action: 'menu-item-update', label: `menu item changed: ${item.label}`, collection: menuItems.COLLECTION, documentId: item.id });
    res.json({ item });
  } catch (error) {
    next(error);
  }
}

async function deleteMenuItem(req, res, next) {
  try {
    const result = await menuItems.remove(req.activeYear, req.params.id);
    await audit.record(req, { domain: 'ucds', action: 'menu-item-delete', label: `menu item removed: ${result.label} (${result.removed})`, collection: menuItems.COLLECTION, documentId: req.params.id });
    res.json(result);
  } catch (error) {
    next(error);
  }
}

// --- the Planning Unit's own tables (see services/customTables.js) ---------------------

const customTables = require('../services/customTables');

/** The table's design and rows, and whether this account may change them. */
async function readCustomTable(req, res, next) {
  try {
    const t = await customTables.read(req.activeYear, req.params.id);
    const editing = (await settings.read()).datasets.editing !== false;
    res.json({ ...t, canEdit: canEdit(req) && editing, canExport: (await settings.read()).datasets.export !== false });
  } catch (error) {
    next(error);
  }
}

async function saveCustomColumns(req, res, next) {
  try {
    const columns = await customTables.saveColumns(req.activeYear, req.params.id, req.body?.columns, principalOf(req));
    await audit.record(req, { domain: 'ucds', action: 'custom-table-columns', label: `table columns saved (${columns.length})`, collection: menuItems.COLLECTION, documentId: req.params.id });
    res.json({ columns });
  } catch (error) {
    next(error);
  }
}

async function addCustomRows(req, res, next) {
  try {
    res.status(201).json(await customTables.addRows(req.activeYear, req.params.id, req.body?.rows, principalOf(req)));
  } catch (error) {
    next(error);
  }
}

async function updateCustomRow(req, res, next) {
  try {
    res.json({ row: await customTables.updateRow(req.activeYear, req.params.id, req.params.rowId, req.body?.values, principalOf(req)) });
  } catch (error) {
    next(error);
  }
}

async function deleteCustomRows(req, res, next) {
  try {
    const r = await customTables.deleteRows(req.activeYear, req.params.id, req.body?.ids);
    await audit.record(req, { domain: 'ucds', action: 'custom-table-rows-delete', label: `table rows deleted (${r.deleted})`, collection: customTables.ROWS, documentId: req.params.id });
    res.json(r);
  } catch (error) {
    next(error);
  }
}

/** The table as shown on the page (filtered, sorted, formulas worked out), as .xlsx. */
async function exportCustomTable(req, res, next) {
  try {
    if ((await settings.read()).datasets.export === false) {
      return res.status(403).json({ code: 'EXPORT_OFF', message: 'Export is switched off in Universe Central DB settings.' });
    }
    const item = await menuItems.get(req.activeYear, req.params.id);
    if (!item || item.kind !== 'table') return res.status(404).json({ message: 'No such table in this year.' });
    const { buffer, rows } = customTables.workbookOf({ ...req.body, title: item.label });
    const name = `${req.activeYear}-${item.label}`.replace(/[^\w.\- ]+/g, '').replace(/\s+/g, '-').slice(0, 80) || 'table';
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${name}.xlsx"`);
    res.setHeader('X-Export-Rows', String(rows));
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, X-Export-Rows');
    return res.send(buffer);
  } catch (error) {
    return next(error);
  }
}

/** Changing a table: canManageData, and editing not switched off in the settings. */
async function requireTableEdit(req, res, next) {
  try {
    if (await editingAllowed(req, res)) return next();
    return undefined;
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getSettings, putSettings, importForYear, registry, listForActiveYear, describe, rowsPage, createRow, createColumn, updateRow, deleteRow, importDataset, exportCsv,
  listMenuItems, getMenuItem, requireMenuEdit, createMenuItem, updateMenuItem, deleteMenuItem,
  readCustomTable, saveCustomColumns, addCustomRows, updateCustomRow, deleteCustomRows, exportCustomTable, requireTableEdit,
};
