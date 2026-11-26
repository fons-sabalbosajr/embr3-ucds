#!/usr/bin/env node
/**
 * Phase B2: copy a history from MongoDB to db_euniverse, check it, and switch.
 *
 *   npm run sql:move -- sign-in-history                copy what is missing, then compare counts
 *   npm run sql:move -- progress-events
 *   npm run sql:move -- all
 *   npm run sql:move -- sign-in-history --mode=dual    also set where it is written and read
 *   npm run sql:move -- status                         the mode and the counts, nothing changed
 *
 * The copy is safe to repeat: each row keeps its MongoDB _id (mongo_id), and
 * rows already in SQL Server are skipped. Nothing is deleted from MongoDB.
 * The result is recorded in eu.data_moves.
 *
 * Modes (services/euSql.js storeMode): mongo -> dual -> sql. Go to 'sql' only
 * when every running server has this code: an older server keeps writing to
 * MongoDB alone. Copy again just before switching, to catch what it wrote.
 * --mode=sql refuses unless the counts match.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { connectToMongo, getDb } = require('../../config/db');
const euSql = require('../../services/euSql');
const signInHistory = require('../../services/signInHistory');
const progressEvents = require('../../services/progressTracker/events');

const MOVES = {
  'sign-in-history': { store: signInHistory.STORE, collection: signInHistory.COLLECTION, table: signInHistory.TABLE, toRow: (d) => signInHistory.toRow(d, String(d._id)) },
  'progress-events': { store: progressEvents.STORE, collection: progressEvents.COLLECTION, table: progressEvents.TABLE, toRow: (d) => progressEvents.toRow(d, String(d._id)) },
};

const args = process.argv.slice(2);
const target = args.find((a) => !a.startsWith('--'));
const modeArg = (args.find((a) => a.startsWith('--mode=')) || '').slice(7) || null;
const log = (...a) => console.log(...a);

async function counts(m) {
  const mongo = await getDb().collection(m.collection).countDocuments({});
  const r = (await euSql.query(`SELECT COUNT_BIG(*) AS total, COUNT_BIG(mongo_id) AS copied FROM ${m.table}`)).recordset[0];
  return { mongo, sqlTotal: Number(r.total), sqlCopied: Number(r.copied) };
}

async function copy(name, m) {
  const have = new Set((await euSql.query(`SELECT mongo_id FROM ${m.table} WHERE mongo_id IS NOT NULL`)).recordset.map((r) => r.mongo_id));
  const writer = euSql.createBatchWriter({
    table: m.table,
    columns: Object.entries(m.columns),
    maxBatch: 1000,
    intervalMs: 60000,
  });
  let added = 0;
  for await (const doc of getDb().collection(m.collection).find({}).sort({ _id: 1 })) {
    if (have.has(String(doc._id))) continue;
    writer.add(m.toRow(doc));
    added += 1;
  }
  await writer.flush();
  if (writer.size()) throw new Error(`${writer.size()} row(s) could not be written; see the warnings above.`);
  return added;
}

async function record(name, m, c, note) {
  await euSql.query(
    `MERGE eu.data_moves AS t USING (SELECT @name AS collection_name) AS s ON t.collection_name = s.collection_name
     WHEN MATCHED THEN UPDATE SET target_table = @tbl, mongo_count = @mongo, sql_count = @sqlc, copied_at = SYSUTCDATETIME(),
          verified_at = CASE WHEN @ok = 1 THEN SYSUTCDATETIME() ELSE NULL END, notes = @note,
          switched_at = CASE WHEN @mode = 'sql' THEN SYSUTCDATETIME() ELSE t.switched_at END
     WHEN NOT MATCHED THEN INSERT (collection_name, target_table, mongo_count, sql_count, copied_at, verified_at, notes)
          VALUES (@name, @tbl, @mongo, @sqlc, SYSUTCDATETIME(), CASE WHEN @ok = 1 THEN SYSUTCDATETIME() ELSE NULL END, @note);`,
    {
      name: [euSql.sql.NVarChar(128), name],
      tbl: [euSql.sql.NVarChar(128), m.table],
      mongo: [euSql.sql.BigInt, c.mongo],
      sqlc: [euSql.sql.BigInt, c.sqlCopied],
      ok: [euSql.sql.Bit, c.mongo === c.sqlCopied ? 1 : 0],
      mode: [euSql.sql.VarChar(8), modeArg || ''],
      note: [euSql.sql.NVarChar(1000), note],
    }
  );
}

// The columns each writer needs, in table order (the batch writer's bulk insert).
MOVES['sign-in-history'].columns = {
  mongo_id: euSql.sql.Char(24), occurred_at: euSql.sql.DateTime2(3), event: euSql.sql.VarChar(16), user_id: euSql.sql.NVarChar(64),
  username: euSql.sql.NVarChar(128), name: euSql.sql.NVarChar(200), ip: euSql.sql.VarChar(64), user_agent: euSql.sql.NVarChar(200),
};
MOVES['progress-events'].columns = {
  mongo_id: euSql.sql.Char(24), season: euSql.sql.VarChar(64), occurred_at: euSql.sql.DateTime2(3), kind: euSql.sql.VarChar(32),
  file_name: euSql.sql.NVarChar(400), source: euSql.sql.NVarChar(64), modified_by: euSql.sql.NVarChar(200), payload: euSql.sql.NVarChar(euSql.sql.MAX),
};

(async () => {
  await connectToMongo();
  const names = target === 'all' || target === 'status' ? Object.keys(MOVES) : [target];
  if (!names.every((n) => MOVES[n])) throw new Error(`Name one of: ${Object.keys(MOVES).join(', ')}, all, status`);
  if (modeArg && !['mongo', 'dual', 'sql'].includes(modeArg)) throw new Error('--mode must be mongo, dual or sql');

  for (const name of names) {
    const m = MOVES[name];
    const mode = await euSql.storeMode(m.store);
    if (target === 'status') {
      const c = await counts(m);
      log(`${name.padEnd(16)} mode ${mode.padEnd(5)}  MongoDB ${c.mongo}  SQL ${c.sqlTotal} (${c.sqlCopied} copied)`);
      continue;
    }
    log(`\n== ${name} -> ${m.table} (mode now: ${mode})`);
    const added = await copy(name, m);
    const c = await counts(m);
    const ok = c.mongo === c.sqlCopied;
    log(`   copied ${added} new row(s); MongoDB ${c.mongo}, SQL ${c.sqlTotal} (${c.sqlCopied} from MongoDB, ${c.sqlTotal - c.sqlCopied} written there first)`);
    log(`   ${ok ? 'counts match' : 'COUNTS DIFFER'}`);
    if (modeArg) {
      if (modeArg === 'sql' && !ok) throw new Error(`Not switching ${name} to sql: the counts differ.`);
      await euSql.setStoreMode(m.store, modeArg);
      log(`   mode set to ${modeArg}`);
    }
    await record(name, m, c, `${added} copied; mode ${modeArg || mode}`);
  }
})()
  .then(async () => {
    await euSql.close();
    process.exit(0);
  })
  .catch(async (e) => {
    console.error('\nFAILED:', e.message);
    await euSql.close().catch(() => {});
    process.exit(1);
  });
