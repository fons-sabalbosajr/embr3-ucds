import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pm = require('../modules/ucds/services/permitMatch.js');

// ---------------------------------------------------------------------------
// Reading a hand-typed ERMS permit number the way a person would. Pure: no
// database.
// ---------------------------------------------------------------------------

const row = (sort_key, ecc_cnc, haz_id) => ({ sort_key, ecc_cnc, haz_id });

describe('the permit matcher reads typing slips', () => {
  it('puts right the letter O, a missing zero, a typographic dash and a date run in', () => {
    expect(pm.clean('RO3-1103-0138')).toBe('R03-1103-0138');
    expect(pm.clean('O3TA-0712-14-685-212A')).toBe('03TA-0712-14-685-212A');
    expect(pm.clean('R3-2017-0370')).toBe('R03-2017-0370');
    expect(pm.clean('ECC‐OL‐R03‐2016‐0052')).toBe('ECC-OL-R03-2016-0052');
    expect(pm.clean('03NE070124-025-116A12 MARCH 2007')).toBe('03NE070124-025-116A');
    // "OL" is a prefix, not a zero.
    expect(pm.clean('ECC-OL-R03-2016-0052')).toBe('ECC-OL-R03-2016-0052');
  });

  it('finds the numbers inside one cell, and none in a name or a date', () => {
    expect(pm.numbersIn('Amended: ECC-R03-2511-5377 Original: R03-03252021-5079')).toEqual(['ECC-R03-2511-5377', 'R03-03252021-5079']);
    expect(pm.numbersIn('ECC-R03-2606-0001 (AMENDING  ECC-OL-R03-2022-0703)')).toEqual(['ECC-R03-2606-0001', 'ECC-OL-R03-2022-0703']);
    expect(pm.numbersIn('NO REF NUMBER')).toEqual([]);
    expect(pm.numbersIn('18 December 2012')).toEqual([]);
    expect(pm.numbersIn('MR. SAMSON G. VALDEZ')).toEqual([]);
  });

  it('links the slips it reads, and no more', () => {
    const index = pm.buildIndex([
      row('A-1', 'R03-1103-0138'),
      row('B-2', 'ECC-OL-R03-2016-0052'),
      row('C-3', 'ECC-OL-R03-2022-0703'),
      row('D-4', 'R03-0908-0020'),
      row('E-5', 'R03-2511-0001'),
      row('F-6', 'R03-2511-0002'),
    ]);
    expect(pm.findMatch(index, 'RO3-1103-0138')?.row.sort_key).toBe('A-1');
    expect(pm.findMatch(index, 'ECC‐OL‐RO3‐2016‐0052')?.row.sort_key).toBe('B-2');
    expect(pm.findMatch(index, 'ECC-R03-2606-0001 (AMENDING ECC-OL-R03-2022-0703)')).toMatchObject({ row: { sort_key: 'C-3' }, strategy: 'exact:part' });
    // A CNC is not the ECC with the same digits.
    expect(pm.findMatch(index, 'CNC-R3-0908-0020')).toBeNull();
    // Two numbers that point at two establishments link to neither.
    expect(pm.findMatch(index, 'R03-2511-0001 / R03-2511-0002')).toBeNull();
    expect(pm.candidatesOf(index, 'R03-2511-0001 / R03-2511-0002').map((c) => c.row.sort_key).sort()).toEqual(['E-5', 'F-6']);
  });

  it('still refuses a number two establishments share, and offers both', () => {
    const index = pm.buildIndex([row('A-1', 'R03-1504-0155'), row('B-2', 'R03-1504-0155')]);
    expect(pm.findMatch(index, 'R03-1504-0155')).toBeNull();
    expect(pm.candidatesOf(index, 'R03-1504-0155').map((c) => c.row.sort_key).sort()).toEqual(['A-1', 'B-2']);
  });
});
