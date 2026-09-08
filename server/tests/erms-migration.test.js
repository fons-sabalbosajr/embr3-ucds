import { describe, it, expect } from 'vitest';
import source from '../scripts/migrate-erms/lib/source.js';
import transform from '../scripts/migrate-erms/lib/transform.js';
import matcher from '../modules/ucds/services/permitMatch.js';

const { clean, parseDate, parseNumber, correctMonth } = source;
const { permitTypeOf, splitSerial, sharePathOf, transformRow } = transform;
const { buildIndex, findMatch, tokensOf, hwKey } = matcher;

describe('clean', () => {
  it('treats the extract\u2019s placeholders as absent', () => {
    for (const v of ['n/a', 'N/A', '', '   ', '-', 'null', 'none']) {
      expect(clean(v)).toBeNull();
    }
    expect(clean('--select project type--')).toBeNull();
  });

  it('strips the doubled quotes around Project_Type', () => {
    expect(clean('"""Mining and Quarrying Projects"""')).toBe('Mining and Quarrying Projects');
  });

  it('strips non-breaking spaces, which the export embeds', () => {
    expect(clean('Bulacan\u00a0')).toBe('Bulacan');
  });

  it('keeps real values intact', () => {
    expect(clean('  Prime Rock Phils. Inc  ')).toBe('Prime Rock Phils. Inc');
  });
});

describe('correctMonth', () => {
  it('repairs the misspellings present in the extract', () => {
    expect(correctMonth('Arpil')).toBe('april');
    expect(correctMonth('Ocotber')).toBe('october');
    expect(correctMonth('Ocotober')).toBe('october');
  });

  it('leaves correct spellings and valid abbreviations alone', () => {
    for (const m of ['January', 'july', 'Sep', 'Dec', 'Feb']) {
      expect(correctMonth(m)).toBeNull();
    }
  });

  it('refuses to guess at a token that is not a month', () => {
    expect(correctMonth('Poultry')).toBeNull();
    expect(correctMonth('Farm')).toBeNull();
    expect(correctMonth('R03')).toBeNull();
  });
});

describe('parseDate', () => {
  it('reads the formats the extract uses', () => {
    expect(parseDate('07 July 2021').value.getFullYear()).toBe(2021);
    expect(parseDate('Dec 6 2021  4:16PM').value.getFullYear()).toBe(2021);
    expect(parseDate('Aug 27 2026 2:01pm').value.getFullYear()).toBe(2026);
  });

  it('recovers a misspelled month and says that it did', () => {
    const r = parseDate('15 Arpil 2025');
    expect(r.ok).toBe(true);
    expect(r.corrected).toBe(true);
    expect(r.value.getMonth()).toBe(3); // April
  });

  it('reports an unusable value instead of guessing', () => {
    // These are real values from the Date_Approved column. "20211" could be
    // 2011 or 2021, and a project type in a date column is not a date at all.
    for (const bad of ['16 December 20211', 'Poultry Farm', 'R03-1308-0330', '30 June 201130 June 2011']) {
      const r = parseDate(bad);
      expect(r.ok).toBe(false);
      expect(r.value).toBeNull();
      expect(r.raw).toBe(bad); // preserved for review
    }
  });

  it('treats an absent value as fine, not as a failure', () => {
    expect(parseDate('n/a')).toEqual({ value: null, raw: null, ok: true, corrected: false });
  });
});

describe('permitTypeOf', () => {
  it('canonicalises the four real types', () => {
    expect(permitTypeOf('Environmental Compliance Certificate (Original)').code).toBe('ecc-original');
    expect(permitTypeOf('Certificate of Non-Coverage').code).toBe('cnc');
    expect(permitTypeOf('Hazardous Waste Generator Registration Certificate').code).toBe('hw-generator');
  });

  it('folds the three misspellings of "Amended" together', () => {
    for (const v of [
      'Environmental Compliance Certificate (Amended)',
      'Environmental Compliance Certificate (Amendment)',
      'Environmental Compliance Certificate (Amendedl)',
    ]) {
      expect(permitTypeOf(v).code).toBe('ecc-amended');
    }
  });

  it('marks anything else as other rather than dropping it', () => {
    expect(permitTypeOf('Some Future Permit').code).toBe('other');
  });
});

describe('splitSerial', () => {
  it('recognises an attachment filed against an existing record', () => {
    expect(splitSerial('FSN-0000206 Att-00012')).toEqual({
      serialNo: 'FSN-0000206 Att-00012',
      parentSerialNo: 'FSN-0000206',
      attachmentNo: 'Att-00012',
    });
  });

  it('leaves an ordinary serial alone', () => {
    expect(splitSerial('FSN-0000001').parentSerialNo).toBeNull();
  });
});

describe('sharePathOf', () => {
  it('strips the mapped drive letter', () => {
    expect(sharePathOf('Z:\\RECORDS\\Database\\Records Database\\Aurora\\doc.pdf')).toBe(
      'RECORDS\\Database\\Records Database\\Aurora\\doc.pdf'
    );
    expect(sharePathOf('N:\\RECORDS\\x.pdf')).toBe('RECORDS\\x.pdf');
  });

  it('strips a UNC server and share', () => {
    expect(sharePathOf('\\\\10.14.76.167\\IDMS\\RECORDS\\x.pdf')).toBe('RECORDS\\x.pdf');
  });

  it('returns null for a path that is neither', () => {
    expect(sharePathOf('RECORDS\\x.pdf')).toBeNull();
    expect(sharePathOf(null)).toBeNull();
  });
});

describe('transformRow', () => {
  const row = {
    Serial_No: 'FSN-0000001',
    Proponent_Name: 'John Vir De Vera',
    Project_Title: 'Commercial Sand & Gravel Quarry',
    Permit_Type: 'Environmental Compliance Certificate (Amended)',
    Permit_Type_No: 'ECC-OL-R03-2019-0573',
    Permit_Process_Source: 'Online Process',
    Date_Amended: 'n/a',
    Date_Approved: '07 July 2021',
    Project_Type: '"""Mining and Quarrying Projects"""',
    Other_Project_Type: 'n/a',
    Province: 'Aurora',
    City: 'Maria Aurora',
    Barangay: 'Dialatman',
    Street: 'n/a',
    Latitude: 'n/a',
    Longitude: 'n/a',
    Remarks: 'no remarks',
    Attach_Files: 'ECC_Amended.pdf',
    Date_Uploaded: 'Dec 6 2021  4:16PM',
    Uploaded_by: 'Kenneth Bolos',
    File_Class: 'Public',
    File_Path: 'Z:\\RECORDS\\Database\\Records Database\\Aurora\\ECC_Amended.pdf',
    LogID: '1',
  };

  it('produces a clean document from a well-formed row', () => {
    const doc = transformRow(row, 0);
    expect(doc.serialNo).toBe('FSN-0000001');
    expect(doc.permit.type).toBe('ecc-amended');
    expect(doc.permit.dateApproved.getFullYear()).toBe(2021);
    expect(doc.permit.dateAmended).toBeNull();
    expect(doc.project.type).toBe('Mining and Quarrying Projects');
    expect(doc.location.province).toBe('aurora');
    expect(doc.document.sharePath).toBe('RECORDS\\Database\\Records Database\\Aurora\\ECC_Amended.pdf');
    expect(doc.dataQuality.clean).toBe(true);
    expect(doc.legacyId).toBe('FSN-0000001');
    expect(doc.ucdsRef).toBeNull();
  });

  it('preserves an unusable date and flags it rather than dropping it', () => {
    const doc = transformRow({ ...row, Date_Approved: 'Poultry Farm' }, 0);
    expect(doc.permit.dateApproved).toBeNull();
    expect(doc.permit.dateApprovedRaw).toBe('Poultry Farm');
    expect(doc.dataQuality.clean).toBe(false);
    expect(doc.dataQuality.issues[0]).toMatchObject({ field: 'Date_Approved', problem: 'unparseable' });
  });

  it('records the source line so a finding can be traced back to the file', () => {
    expect(transformRow(row, 0).sourceRow).toBe(2); // header is line 1
  });
});

describe('register index and matching', () => {
  const register = [
    { sort_key: 'AU-1', name: 'Firm A', ecc_cnc: '\tECC-OL-R03-2017-0370\t' },
    { sort_key: 'BU-2', name: 'Firm B', ecc_cnc: '03BU-0403-07-203-120A, CNC-OL-R03-2017-10-01090' },
    { sort_key: 'PA-3', name: 'Firm C', haz_id: 'OL-GR-R3-77-002894 ' },
    { sort_key: 'TA-4', name: 'Firm D', ecc_cnc: 'In-process' },
  ];
  const index = buildIndex(register);

  it('splits a cell holding several permit numbers', () => {
    expect(tokensOf('03BU-0403-07-203-120A, CNC-OL-R03-2017-10-01090')).toHaveLength(2);
  });

  it('ignores placeholder text that is not a permit number', () => {
    expect(tokensOf('In-process')).toHaveLength(0);
    expect(tokensOf('')).toHaveLength(0);
  });

  it('matches despite surrounding whitespace in the register', () => {
    expect(findMatch(index, 'ECC-OL-R03-2017-0370').row.sort_key).toBe('AU-1');
  });

  it('matches a number reachable only through the second value in a cell', () => {
    expect(findMatch(index, 'CNC-OL-R03-2017-10-01090').row.sort_key).toBe('BU-2');
  });

  it('matches hazardous-waste registrations against haz_id, not ecc_cnc', () => {
    expect(findMatch(index, 'OL-GR-R3-77-002894').row.sort_key).toBe('PA-3');
  });

  it('matches across differing prefix conventions, and says how', () => {
    // ERMS writes R03-2017-0370 where the register writes ECC-OL-R03-2017-0370.
    const hit = findMatch(index, 'R03-2017-0370');
    expect(hit.row.sort_key).toBe('AU-1');
    expect(hit.strategy).toBe('digits');
  });

  it('returns null rather than a guess when nothing matches', () => {
    expect(findMatch(index, 'ECC-OL-R03-9999-9999')).toBeNull();
    expect(findMatch(index, '')).toBeNull();
  });

  it('refuses an ambiguous key so a loose rule cannot invent a link', () => {
    const ambiguous = buildIndex([
      { sort_key: 'X-1', name: 'One', ecc_cnc: 'ECC-R03-1234-5678' },
      { sort_key: 'X-2', name: 'Two', ecc_cnc: 'CNC-R03-1234-5678' },
    ]);
    // Both reduce to the same digit sequence but belong to different firms.
    expect(findMatch(ambiguous, 'R03-1234-5678')).toBeNull();
    // The exact spelling is still unambiguous and still matches.
    expect(findMatch(ambiguous, 'ECC-R03-1234-5678').row.sort_key).toBe('X-1');
  });

  it('will not match on a short digit run', () => {
    const shortIdx = buildIndex([{ sort_key: 'Y-1', name: 'Short', ecc_cnc: 'AB-123' }]);
    expect(findMatch(shortIdx, '123')).toBeNull();
  });
});

describe('hwKey — Hazardous Waste Generator ids', () => {
  it('treats the separator and padding variants as one id', () => {
    // All of these are the same registration written five ways.
    const keys = [
      'GR-R3-08-00017',
      'GR3-08-00017',
      'GR R3-08-00017',
      'GR-03-08-0017',
      'OL-GR-R3-08-00017',
    ].map(hwKey);
    expect(new Set(keys).size).toBe(1);
    expect(keys[0]).not.toBeNull();
  });

  it('keeps the M marker, which denotes a manually generated id', () => {
    expect(hwKey('M-GR-R3-08-00017')).not.toBe(hwKey('GR-R3-08-00017'));
  });

  it('keeps the series segment, which is part of the id', () => {
    expect(hwKey('GR-R3-08-00017')).not.toBe(hwKey('GR-R3-77-00017'));
  });

  it('returns null for the placeholder text the register contains', () => {
    for (const v of ['In-process', 'NODATA', 'App.No:123', "The project didn't exist.", '']) {
      expect(hwKey(v)).toBeNull();
    }
  });

  it('is used for matching, and reports itself as the strategy', () => {
    const index = buildIndex([{ sort_key: 'HW-1', name: 'Generator', haz_id: 'GR3-08-00011' }]);
    const hit = findMatch(index, 'GR-R3-08-00011');
    expect(hit.row.sort_key).toBe('HW-1');
    expect(hit.strategy).toBe('hw');
  });
});

describe('parseNumber', () => {
  it('returns null for the placeholders rather than NaN', () => {
    expect(parseNumber('n/a')).toBeNull();
    expect(parseNumber('')).toBeNull();
  });

  it('parses real coordinates', () => {
    expect(parseNumber('15.7581')).toBeCloseTo(15.7581);
  });
});
