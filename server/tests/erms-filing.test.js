import { describe, it, expect } from 'vitest';
import filing from '../modules/erms/services/filingService.js';

// ---------------------------------------------------------------------------
// Where an upload files on the share (modules/erms/services/filingService.js).
//
//   - the layout fills from the document's values, as the desktop system did
//   - a folder the clerk chose on the form wins over the derived one
//   - the folder picker's level is the pattern up to {folder}
// ---------------------------------------------------------------------------

const records = {
  container: 'records',
  folder: {
    root: 'RECORDS\\Database\\Records Database',
    pattern: '{province}\\{yearRange}\\{year}\\{folder}\\{typeFolder}',
    folderField: 'projectTitle',
    yearField: 'permit.dateApproved',
  },
};
const laboratory = {
  container: 'laboratory',
  folder: {
    root: 'LABORATORY\\Database\\Laboratory Database',
    pattern: '{province}\\{yearRange}\\{year}\\{folder}',
    folderField: 'firmName',
    yearField: 'dateOfSampling',
  },
};
const ecc = { code: 'ecc-original', folder: 'ECC Folder' };

describe('filing layout', () => {
  it('derives the folder from the project title by default', () => {
    const dir = filing.directoryFor(records, ecc, {
      province: 'bataan',
      projectTitle: 'Cement Plant: Phase 2',
      permit: { dateApproved: '2019-05-04' },
    });
    expect(dir).toBe('RECORDS\\Database\\Records Database\\Bataan\\2016-2020\\2019\\Cement Plant Phase 2\\ECC Folder');
  });

  it('files under the folder the clerk chose instead', () => {
    const dir = filing.directoryFor(records, ecc, {
      province: 'bataan',
      projectTitle: 'Cement Plant: Phase 2',
      permit: { dateApproved: '2019-05-04' },
      folder: 'Cement Plant',
    });
    expect(dir).toBe('RECORDS\\Database\\Records Database\\Bataan\\2016-2020\\2019\\Cement Plant\\ECC Folder');
    expect(filing.folderFor(records, { folder: '  ../Evil:name  ' })).toBe('Evil name');
  });

  it('reads a unit document’s folder and year from its fields', () => {
    const dir = filing.directoryFor(laboratory, { folder: '' }, {
      province: 'bulacan',
      fields: { firmName: 'Station 4', dateOfSampling: '2025-02-10' },
    });
    expect(dir).toBe('LABORATORY\\Database\\Laboratory Database\\Bulacan\\2021-2025\\2025\\Station 4');
  });

  it('names the level the folder picker lists', () => {
    expect(filing.parentDirectoryFor(records, { province: 'bataan', date: '2024-03-01' })).toBe(
      'RECORDS\\Database\\Records Database\\Bataan\\2021-2025\\2024'
    );
    expect(filing.parentDirectoryFor(laboratory, { province: 'bulacan', fields: { dateOfSampling: '2025-02-10' } })).toBe(
      'LABORATORY\\Database\\Laboratory Database\\Bulacan\\2021-2025\\2025'
    );
    // No {folder} level, nothing to pick.
    expect(filing.parentDirectoryFor({ folder: { root: 'X', pattern: '{province}\\{year}' } }, { province: 'bataan' })).toBeNull();
    // Today's year when no date is known.
    expect(filing.parentDirectoryFor(records, { province: 'tarlac' })).toMatch(new RegExp(`Tarlac\\\\\\d{4}-\\d{4}\\\\${new Date().getFullYear()}$`));
  });
});
