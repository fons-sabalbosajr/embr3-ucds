import { describe, it, expect } from 'vitest';
import compare from '../scripts/migrate-erms/lib/compare.js';

const { diffOf, classify } = compare;

// ---------------------------------------------------------------------------
// A checker that reports "no divergence" is only reassuring once it has been
// shown to report divergence when there is some. The live run against the
// current export finds nothing — which is correct, but proves nothing on its
// own, because a checker that always returns "clean" would say the same.
// ---------------------------------------------------------------------------

const record = (over = {}) => ({
  serialNo: 'FSN-0000001',
  legacySource: 'erms-advance',
  proponentName: 'Prime Rock Phils. Inc',
  projectTitle: 'Quarry',
  remarks: null,
  permit: {
    type: 'ecc-original',
    number: 'ECC-OL-R03-2019-0573',
    processSource: 'Manual Process',
    dateApproved: new Date('2021-07-07T00:00:00Z'),
    dateAmended: null,
  },
  project: { type: 'Mining and Quarrying Projects', otherType: null },
  location: { province: 'bataan', city: 'Balanga', barangay: 'Poblacion', street: null },
  document: {
    fileName: 'ECC.pdf',
    filePath: 'Z:\\RECORDS\\ECC.pdf',
    fileClass: 'Public',
    uploadedBy: 'Kenneth Bolos',
    uploadedAt: new Date('2021-12-06T08:16:00Z'),
  },
  ...over,
});

const asSource = (docs) => new Map(docs.map((d) => [d.serialNo, d]));

describe('diffOf', () => {
  it('finds nothing between identical records', () => {
    expect(diffOf(record(), record())).toEqual([]);
  });

  it('reports a changed field with both values', () => {
    const changes = diffOf(record(), record({ proponentName: 'Someone Else' }));
    expect(changes).toHaveLength(1);
    expect(changes[0]).toEqual({
      field: 'proponentName',
      source: 'Prime Rock Phils. Inc',
      database: 'Someone Else',
    });
  });

  it('looks inside nested objects', () => {
    const changes = diffOf(record(), record({ permit: { ...record().permit, number: 'CNC-1' } }));
    expect(changes.map((c) => c.field)).toEqual(['permit.number']);
  });

  it('compares dates by value, not by object identity', () => {
    // The export produces a fresh Date; the database returns another. Same
    // instant must not read as a difference.
    const fromDb = record();
    fromDb.permit.dateApproved = new Date('2021-07-07T00:00:00Z');
    expect(diffOf(record(), fromDb)).toEqual([]);

    fromDb.permit.dateApproved = new Date('2021-07-08T00:00:00Z');
    expect(diffOf(record(), fromDb).map((c) => c.field)).toEqual(['permit.dateApproved']);
  });

  it('treats empty string, undefined and null as the same absence', () => {
    expect(diffOf(record({ remarks: '' }), record({ remarks: null }))).toEqual([]);
    expect(diffOf(record({ remarks: undefined }), record({ remarks: null }))).toEqual([]);
  });

  it('ignores the fields the web module owns', () => {
    // ucdsRef, archive, dataQuality and the timestamps exist only on the
    // database side; comparing them would flag every record.
    const fromDb = record({
      _id: 'abc',
      ucdsRef: { sortKey: 'BA-1' },
      archive: { boxCode: 'BOX-1' },
      dataQuality: { clean: false, issues: [{ field: 'x' }] },
      createdAt: new Date(),
      updatedAt: new Date(),
      migratedAt: new Date(),
    });
    expect(diffOf(record(), fromDb)).toEqual([]);
  });
});

describe('classify', () => {
  it('reports a clean comparison when both sides agree', () => {
    const result = classify(asSource([record()]), [record()]);
    expect(result.clean).toBe(true);
    expect(result.sourceOnly).toEqual([]);
    expect(result.conflicting).toEqual([]);
  });

  it('treats a web-created record as expected, not as divergence', () => {
    const web = record({ serialNo: 'FSN-0018100', legacySource: 'ucds-erms' });
    const result = classify(asSource([record()]), [record(), web]);

    expect(result.webOnly).toHaveLength(1);
    expect(result.webOnly[0].serialNo).toBe('FSN-0018100');
    expect(result.clean).toBe(true);
  });

  it('treats an attachment filed here from the desktop register, and a duplicate set aside, as expected', () => {
    const fromRegister = record({ serialNo: 'FSN-0009839 Att-00032', legacySource: 'erms-attachment-register' });
    const twice = record({ serialNo: 'FSN-0008059' });
    const result = classify(asSource([record(), twice]), [record(), fromRegister], { setAside: new Set(['FSN-0008059']) });

    expect(result.webOnly.map((d) => d.serialNo)).toEqual(['FSN-0009839 Att-00032']);
    expect(result.setAside).toEqual(['FSN-0008059']);
    expect(result.clean).toBe(true);
    // Set aside only by name: any other missing record is still divergence.
    expect(classify(asSource([record(), twice]), [record()]).clean).toBe(false);
  });

  it('flags a migrated record missing from the export', () => {
    // The desktop app no longer has a record the database does — the export is
    // stale, or something was deleted upstream.
    const orphan = record({ serialNo: 'FSN-0000002' });
    const result = classify(asSource([record()]), [record(), orphan]);

    expect(result.sourceOnly).toHaveLength(1);
    expect(result.sourceOnly[0]).toMatchObject({
      serialNo: 'FSN-0000002',
      side: 'missing from export',
    });
    expect(result.clean).toBe(false);
  });

  it('flags a record written to the desktop app after the freeze', () => {
    const late = record({ serialNo: 'FSN-0018200' });
    const result = classify(asSource([record(), late]), [record()]);

    expect(result.sourceOnly).toHaveLength(1);
    expect(result.sourceOnly[0]).toMatchObject({
      serialNo: 'FSN-0018200',
      side: 'missing from database',
    });
    expect(result.clean).toBe(false);
  });

  it('flags the same record edited differently on both sides', () => {
    const edited = record({ projectTitle: 'Quarry (revised)' });
    const result = classify(asSource([record()]), [edited]);

    expect(result.conflicting).toHaveLength(1);
    expect(result.conflicting[0].serialNo).toBe('FSN-0000001');
    expect(result.conflicting[0].changes[0].field).toBe('projectTitle');
    expect(result.clean).toBe(false);
  });

  it('separates several findings in one run', () => {
    const source = asSource([
      record(),
      record({ serialNo: 'FSN-0000003' }), // only upstream
    ]);
    const dbDocs = [
      record({ projectTitle: 'changed' }), // conflicting
      record({ serialNo: 'FSN-0000004' }), // only in the database
      record({ serialNo: 'FSN-0018100', legacySource: 'ucds-erms' }), // web-created
    ];

    const result = classify(source, dbDocs);
    expect(result.conflicting).toHaveLength(1);
    expect(result.sourceOnly).toHaveLength(2);
    expect(result.webOnly).toHaveLength(1);
    expect(result.clean).toBe(false);
  });
});
