import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  safeRelativePath,
  stripLegacyPrefix,
  resolveSharePath,
  contentTypeFor,
  canPreview,
  toLongPath,
  warnAboutNasConfig,
} from '../services/nasStorage.js';
import { normalizeCode } from '../shared/services/orgUnits.js';

// Covers the traversal fixed in Phase 2 (req.query.file went straight to
// smb2.readFile(), so "../" walked out of the records share) and the path
// resolution added in Phase 7.

describe('safeRelativePath', () => {
  it('rejects traversal', () => {
    for (const p of [
      '../../etc/passwd',
      '..\\..\\secret.pdf',
      'ECC Folder/../../../windows/win.ini',
      'a/../../b',
      '.',
      '..',
    ]) {
      expect(safeRelativePath(p)).toBeNull();
    }
  });

  it('rejects rooted paths that name no share', () => {
    for (const p of ['/etc/shadow', '\\etc\\shadow']) {
      expect(safeRelativePath(p)).toBeNull();
    }
  });

  it('rejects empty input and null bytes', () => {
    expect(safeRelativePath('')).toBeNull();
    expect(safeRelativePath(undefined)).toBeNull();
    expect(safeRelativePath('file\u0000.pdf')).toBeNull();
  });

  it('accepts real record paths and normalises the separator', () => {
    expect(safeRelativePath('file.pdf')).toBe('file.pdf');
    expect(safeRelativePath('ECC Folder/report.pdf')).toBe('ECC Folder\\report.pdf');
    expect(safeRelativePath('Aurora\\2021\\doc.pdf')).toBe('Aurora\\2021\\doc.pdf');
  });

  it('accepts the punctuation that appears in real proponent folder names', () => {
    const p = 'Prime Rock Phils. Inc, Brgy. Banaban, Angat BU/ECC/doc.pdf';
    expect(safeRelativePath(p)).toBe('Prime Rock Phils. Inc, Brgy. Banaban, Angat BU\\ECC\\doc.pdf');
  });
});

describe('stripLegacyPrefix', () => {
  it('strips the mapped drive letter the desktop app used', () => {
    expect(stripLegacyPrefix('Z:\\RECORDS\\Database\\x.pdf')).toBe('RECORDS\\Database\\x.pdf');
  });

  it('strips drive letters other than Z', () => {
    // Two of the 18,067 migrated rows say N:. Hard-coding Z: would lose them.
    expect(stripLegacyPrefix('N:\\RECORDS\\x.pdf')).toBe('RECORDS\\x.pdf');
  });

  it('strips a UNC head, keeping the share-relative remainder', () => {
    expect(stripLegacyPrefix('\\\\10.0.0.1\\SHARE\\RECORDS\\x.pdf')).toBe('RECORDS\\x.pdf');
  });

  it('leaves an already-relative path alone', () => {
    expect(stripLegacyPrefix('RECORDS\\Database\\x.pdf')).toBe('RECORDS\\Database\\x.pdf');
  });

  it('honours an explicit allow-list', () => {
    process.env.NAS_LEGACY_PREFIXES = 'Z:';
    expect(stripLegacyPrefix('Z:\\a.pdf')).toBe('a.pdf');
    expect(stripLegacyPrefix('C:\\Windows\\system.ini')).toBeNull();
    delete process.env.NAS_LEGACY_PREFIXES;
  });
});

describe('resolveSharePath', () => {
  const ROOT = '\\\\10.0.0.9\\RECORDS_SHARE';

  beforeEach(() => {
    process.env.NAS_ROOT = ROOT;
    delete process.env.NAS_BASE_DIR;
    delete process.env.NAS_LEGACY_PREFIXES;
  });
  afterEach(() => {
    delete process.env.NAS_ROOT;
    delete process.env.NAS_BASE_DIR;
  });

  it('resolves a stored legacy path under the configured root', () => {
    expect(resolveSharePath('Z:\\RECORDS\\Database\\Bataan\\1992\\Sample.pdf')).toBe(
      `${ROOT}\\RECORDS\\Database\\Bataan\\1992\\Sample.pdf`
    );
  });

  it('applies an optional base directory', () => {
    process.env.NAS_BASE_DIR = 'Database/Records Database';
    expect(resolveSharePath('Bataan\\x.pdf')).toBe(`${ROOT}\\Database\\Records Database\\Bataan\\x.pdf`);
  });

  it('never escapes the root, whatever the stored value says', () => {
    for (const p of [
      'Z:\\..\\..\\Windows\\system.ini',
      '..\\..\\..\\secret',
      '\\\\evil-host\\share\\..\\..\\x',
      'a\\..\\..\\b',
    ]) {
      const resolved = resolveSharePath(p);
      if (resolved !== null) expect(resolved.startsWith(`${ROOT}\\`)).toBe(true);
    }
  });

  it('contains a foreign drive letter rather than following it', () => {
    // Stripping is safe because containment is re-checked: C:\Windows lands
    // inside the share, it does not reach the server's own disk.
    const resolved = resolveSharePath('C:\\Windows\\system.ini');
    expect(resolved).toBe(`${ROOT}\\Windows\\system.ini`);
  });

  it('returns null when no share is configured', () => {
    delete process.env.NAS_ROOT;
    delete process.env.NAS_SHARE;
    expect(resolveSharePath('a.pdf')).toBeNull();
  });
});

describe('NAS_BASE_DIR misconfiguration', () => {
  const ROOT = '\\\\10.0.0.9\\RECORDS_SHARE';

  beforeEach(() => {
    process.env.NAS_ROOT = ROOT;
  });
  afterEach(() => {
    delete process.env.NAS_ROOT;
    delete process.env.NAS_BASE_DIR;
  });

  it('doubles the path when set to the legacy prefix, which is why it is warned about', () => {
    // The natural misreading: NAS_BASE_DIR looks like "the legacy path", but
    // it is a subdirectory below the share root. Set to the legacy prefix it
    // produces \\host\share\Z:\RECORDS\...\RECORDS\... and every document in
    // the system reports "not on the share" — a silent, total outage.
    process.env.NAS_BASE_DIR = 'Z:\\RECORDS\\Database\\Records Database';
    const resolved = resolveSharePath('RECORDS\\Database\\Records Database\\a.pdf');
    expect(resolved).toContain('\\Z:\\');
    expect(resolved.match(/RECORDS/g).length).toBeGreaterThan(1);
  });

  it('warns at startup rather than failing silently', () => {
    process.env.NAS_BASE_DIR = 'Z:\\RECORDS\\Database\\Records Database';
    const warnings = [];
    const original = console.warn;
    console.warn = (m) => warnings.push(String(m));
    try {
      warnAboutNasConfig();
    } finally {
      console.warn = original;
    }
    expect(warnings.join('\n')).toMatch(/NAS_BASE_DIR is a drive letter or UNC path/);
  });

  it('says nothing when it is empty, which is correct for this deployment', () => {
    process.env.NAS_BASE_DIR = '';
    const warnings = [];
    const original = console.warn;
    console.warn = (m) => warnings.push(String(m));
    try {
      warnAboutNasConfig();
    } finally {
      console.warn = original;
    }
    expect(warnings).toEqual([]);
  });
});

describe('long paths', () => {
  it('prefixes UNC paths so they survive past 260 characters', () => {
    // 26.7% of migrated records exceed MAX_PATH. Without this the Windows API
    // reports them as missing, which reads like data loss rather than a limit.
    expect(toLongPath('\\\\host\\share\\a.pdf')).toBe('\\\\?\\UNC\\host\\share\\a.pdf');
  });
});

describe('content types', () => {
  it('maps the formats the records share actually holds', () => {
    expect(contentTypeFor('a.pdf')).toBe('application/pdf');
    expect(contentTypeFor('A.PDF')).toBe('application/pdf');
    expect(contentTypeFor('scan.tiff')).toBe('image/tiff');
    expect(contentTypeFor('note.docx')).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
  });

  it('falls back to a type no browser will execute', () => {
    expect(contentTypeFor('odd.xyz')).toBe('application/octet-stream');
    expect(contentTypeFor('script.html')).toBe('application/octet-stream');
  });

  it('only previews formats that are safe to render inline', () => {
    expect(canPreview('a.pdf')).toBe(true);
    expect(canPreview('a.png')).toBe(true);
    expect(canPreview('a.docx')).toBe(false);
    expect(canPreview('a.html')).toBe(false);
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
