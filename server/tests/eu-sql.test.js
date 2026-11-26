import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

// services/euSql.js: the parts that need no SQL Server: how migration files
// are read, and how the batch writer behaves when the database is slow or down.
const require = createRequire(import.meta.url);
const { batches, checksum, migrationFiles, createBatchWriter } = require('../services/euSql');

const quiet = { warn: () => {} };

describe('Migrations', () => {
  it('splits a file into batches on lines that are only GO', () => {
    expect(batches('CREATE SCHEMA eu;\nGO\n  go  \nCREATE TABLE eu.t (a int);\r\nGO\r\n')).toEqual(['CREATE SCHEMA eu;', 'CREATE TABLE eu.t (a int);']);
    expect(batches('SELECT 1 -- GOOD, not a separator')).toEqual(['SELECT 1 -- GOOD, not a separator']);
  });

  it('gives the same checksum whatever the line endings', () => {
    expect(checksum('a\r\nb\r\n')).toBe(checksum('a\nb\n'));
    expect(checksum('a\nb')).not.toBe(checksum('a\nc'));
  });

  it('finds the migrations in order, starting with the foundation', () => {
    const files = migrationFiles();
    expect(files[0].file).toBe('001_foundation.sql');
    expect(files.map((f) => f.version)).toEqual([...files.map((f) => f.version)].sort());
  });
});

describe('Moved histories keep their shape', () => {
  const events = require('../services/progressTracker/events');
  const signIns = require('../services/signInHistory');

  it('gives back a Progress Tracker event exactly as MongoDB stores it', () => {
    const e = {
      season: 's1', at: new Date('2026-11-26T01:02:03.004Z'), kind: 'save', name: 'RAW.xlsx', source: 'raw', modifiedBy: 'Ana',
      version: 'v2', seenAt: new Date('2026-11-26T01:02:05.000Z'), delta: { ecc: 3, units: { pampanga: 2 } },
    };
    const row = events.toRow(e, '0123456789abcdef01234567');
    expect(row).toMatchObject({ season: 's1', kind: 'save', file_name: 'RAW.xlsx', source: 'raw', modified_by: 'Ana', mongo_id: '0123456789abcdef01234567' });
    const back = events.fromRow({ id: 9, ...row });
    expect(back).toEqual({ _id: '0123456789abcdef01234567', ...e });
  });

  it('keeps a baseline note, which has no file', () => {
    const back = events.fromRow({ id: 4, ...events.toRow({ season: 's1', at: new Date(0), kind: 'baseline', note: 'Baseline taken again.' }) });
    expect(back).toEqual({ _id: 'sql-4', season: 's1', at: new Date(0), kind: 'baseline', note: 'Baseline taken again.' });
  });

  it('maps a sign-in to its columns', () => {
    const at = new Date();
    expect(signIns.toRow({ event: 'sign-in', userId: 'u1', username: 'ana', name: 'Ana', ip: '1.2.3.4', userAgent: 'Edge', at }, 'm1')).toEqual({
      mongo_id: 'm1', occurred_at: at, event: 'sign-in', user_id: 'u1', username: 'ana', name: 'Ana', ip: '1.2.3.4', user_agent: 'Edge',
    });
  });
});

describe('Batch writer', () => {
  it('inserts many rows at once instead of one per request', async () => {
    const calls = [];
    const w = createBatchWriter({ table: 'eu.t', columns: [['a', null]], intervalMs: 50, maxBatch: 3, insert: async (rows) => calls.push(rows.length), logger: quiet });
    for (let i = 0; i < 7; i++) w.add({ a: i });
    await w.flush();
    expect(calls.reduce((n, c) => n + c, 0)).toBe(7);
    expect(Math.max(...calls)).toBeLessThanOrEqual(3);
    expect(w.size()).toBe(0);
  });

  it('keeps rows while the database is down and writes them when it is back', async () => {
    let up = false;
    const written = [];
    const w = createBatchWriter({
      table: 'eu.t',
      columns: [['a', null]],
      intervalMs: 10_000,
      insert: async (rows) => {
        if (!up) throw new Error('unreachable');
        written.push(...rows);
      },
      logger: quiet,
    });
    w.add({ a: 1 });
    w.add({ a: 2 });
    await w.flush();
    expect(w.size()).toBe(2);
    up = true;
    await w.flush();
    expect(written.map((r) => r.a)).toEqual([1, 2]);
    expect(w.size()).toBe(0);
  });

  it('drops the oldest rows, not the newest, when the queue is full', async () => {
    const w = createBatchWriter({ table: 'eu.t', columns: [['a', null]], intervalMs: 10_000, maxBatch: 1000, maxQueue: 3, insert: async () => { throw new Error('down'); }, logger: quiet });
    for (let i = 1; i <= 5; i++) w.add({ a: i });
    expect(w.size()).toBe(3);
    expect(w.dropped()).toBe(2);
  });
});
