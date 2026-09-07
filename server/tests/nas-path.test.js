import { describe, it, expect } from 'vitest';
import { safeSharePath } from '../controllers/nasController.js';
import { normalizeCode } from '../shared/services/orgUnits.js';

// Covers the traversal fixed in Phase 2: req.query.file went straight to
// smb2.readFile(), so "../" walked out of the records share.

describe('safeSharePath', () => {
  it('rejects traversal', () => {
    for (const p of [
      '../../etc/passwd',
      '..\\..\\secret.pdf',
      'ECC Folder/../../../windows/win.ini',
      'a/../../b',
      '.',
      '..',
    ]) {
      expect(safeSharePath(p)).toBeNull();
    }
  });

  it('rejects absolute, UNC and drive-qualified paths', () => {
    for (const p of ['/etc/shadow', '\\\\server\\share\\x.pdf', 'C:\\Windows\\system.ini', 'c:/windows/x']) {
      expect(safeSharePath(p)).toBeNull();
    }
  });

  it('rejects empty input and null bytes', () => {
    expect(safeSharePath('')).toBeNull();
    expect(safeSharePath(undefined)).toBeNull();
    expect(safeSharePath('file\u0000.pdf')).toBeNull();
  });

  it('accepts real record paths and normalises the separator', () => {
    expect(safeSharePath('file.pdf')).toBe('file.pdf');
    expect(safeSharePath('ECC Folder/report.pdf')).toBe('ECC Folder\\report.pdf');
    expect(safeSharePath('Aurora\\2021\\doc.pdf')).toBe('Aurora\\2021\\doc.pdf');
  });

  it('accepts the punctuation that appears in real proponent folder names', () => {
    const p = 'Prime Rock Phils. Inc, Brgy. Banaban, Angat BU/ECC/doc.pdf';
    expect(safeSharePath(p)).toBe('Prime Rock Phils. Inc, Brgy. Banaban, Angat BU\\ECC\\doc.pdf');
  });
});

describe('orgUnits.normalizeCode', () => {
  it('collapses the spelling variants already in the user collection', () => {
    // "ORD-PISMU" and "ORD - PISMU" are the same office.
    expect(normalizeCode('ORD - PISMU')).toBe('ORD-PISMU');
    expect(normalizeCode('ORD-PISMU')).toBe('ORD-PISMU');
    expect(normalizeCode('  ord pismu  ')).toBe('ORD-PISMU');
    expect(normalizeCode('ORD_PISMU')).toBe('ORD-PISMU');
  });

  it('trims stray separators', () => {
    expect(normalizeCode('-ORD--PEMU-')).toBe('ORD-PEMU');
  });

  it('returns an empty string for nothing usable', () => {
    expect(normalizeCode('')).toBe('');
    expect(normalizeCode(null)).toBe('');
    expect(normalizeCode('   ')).toBe('');
  });
});
