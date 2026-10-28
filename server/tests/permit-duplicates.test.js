import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { ermsPermitFindings } = require('../modules/ucds/services/permitDuplicates.js');

// ---------------------------------------------------------------------------
// One permit on several establishments, settled from the ERMS ECC/CNC
// documents (VERA's register check). No database: the documents are passed in.
// ---------------------------------------------------------------------------

const ecc = (serialNo, number, proponentName, projectTitle, province = 'pampanga', type = 'ecc-original') => ({
  serialNo,
  permit: { type, label: type === 'cnc' ? 'Certificate of Non-Coverage' : 'ECC (Original)', number, dateApproved: '2012-03-04T16:00:00.000Z' },
  proponentName,
  projectTitle,
  location: { province },
});

const row = (sort_key, title, name, ecc_cnc, province = 'Pampanga') => ({ _id: `id-${sort_key}`, sort_key, title, name, province, ecc_cnc });

describe('shared permits settled from ERMS', () => {
  it("gives the other firm its own number when ERMS names the holder and holds the other firm's ECC", async () => {
    const rows = [
      row('PA-1', 'Marquee Mall Expansion', 'Ayala Land Inc', '03PA-0701-26-007-120A'),
      row('PA-2', 'Marquee BPO Building', 'Ayala Land Inc', '03PA 0701-26-007-120A'),
    ];
    const records = [
      ecc('FSN-1', '03PA-0701-26-007-120A', 'Ayala Land Inc', 'Marquee Mall Expansion'),
      ecc('FSN-2', 'R03-1009-0436', 'Ayala Land Inc', 'Marquee BPO Building'),
    ];
    const r = await ermsPermitFindings(rows, { records });
    expect(r.proposals).toHaveLength(1);
    expect(r.proposals[0]).toMatchObject({ sort_key: 'PA-2', oldValue: '03PA 0701-26-007-120A', newValue: 'R03-1009-0436', fsn: 'FSN-2', confidence: 'likely', method: 'erms', recordId: 'id-PA-2' });
    expect(r.review.find((x) => x.key === 'duplicate-permits').count).toBe(0);
  });

  it('never takes an HW generator registration for an ECC', async () => {
    const rows = [row('NE-1', 'Petron Guimba', 'Petron', '03NE-0211-10-063-120A', 'Nueva_Ecija'), row('NE-2', 'Santa Rosa Petron Service Station', 'Juan Cruz', '03NE 0211-10-063-120A', 'Nueva_Ecija')];
    const records = [
      ecc('FSN-1', '03NE-0211-10-063-120A', 'Petron', 'Petron Guimba', 'nuevaecija'),
      // Only the ECC/CNC types are ever passed in; the query filters the rest out.
    ];
    const r = await ermsPermitFindings(rows, { records });
    expect(r.proposals).toHaveLength(0);
    expect(r.review.find((x) => x.key === 'duplicate-permits').samples[0].detail).toMatch(/names NE-1/);
  });

  it('lists one establishment entered twice for review, and changes nothing', async () => {
    const rows = [row('BU-1', 'New Hope Subdivision Phase 2', 'X Realty', '03BU 0403-05 135-212A', 'Bulacan'), row('BU-2', 'NEW HOPE SUBDIVISION PHASE 2', 'X Realty', '03BU-0403-05-135-212A', 'Bulacan')];
    const r = await ermsPermitFindings(rows, { records: [] });
    expect(r.proposals).toHaveLength(0);
    const twice = r.review.find((x) => x.key === 'same-firm-twice');
    expect(twice.count).toBe(1);
    expect(twice.samples[0].sort_key).toBe('BU-1, BU-2');
  });

  it('leaves it to a person when ERMS has no document, or names neither firm', async () => {
    const rows = [row('TA-1', 'Agro Farm', 'A', '03TA-0411-13-726-116A', 'Tarlac'), row('TA-2', 'Rice Mill', 'B', '03TA-0411-13-726-116A', 'Tarlac')];
    const none = await ermsPermitFindings(rows, { records: [] });
    expect(none.proposals).toHaveLength(0);
    expect(none.review[0].samples[0].detail).toMatch(/no ECC\/CNC document/);
    const other = await ermsPermitFindings(rows, { records: [ecc('FSN-9', '03TA-0411-13-726-116A', 'Somebody Else Corp', 'Unrelated Resort', 'tarlac')] });
    expect(other.proposals).toHaveLength(0);
    expect(other.review[0].samples[0].detail).toMatch(/names none of them/);
  });

  it('does not read ERMS when no permit is shared', async () => {
    const r = await ermsPermitFindings([row('AU-1', 'One', 'A', '03AU-0101-01-001-120A', 'Aurora')]);
    expect(r).toMatchObject({ groups: 0, proposals: [] });
  });
});
