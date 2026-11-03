import Papa from 'papaparse';
// Bundled with the code: fetched from /data/ it reached only the development
// server, and a production build's PSIC code, industry type and sub-type
// stayed "n/a".
import psicCsv from '../psiccode.csv?raw';

const MAP = (() => {
  const psicCodeMap = {};
  for (const item of Papa.parse(psicCsv, { header: true, skipEmptyLines: true }).data) {
    const industryClass = String(item['Industry Category'] || '').trim();
    if (!industryClass) continue;
    psicCodeMap[industryClass] = { psicCode: item['PSIC Code'], industryType: item['Industry Type'], industrySubType: item['Industry SubType'] };
  }
  return psicCodeMap;
})();

/** Industry classification -> { psicCode, industryType, industrySubType }. The path is no longer read. */
// eslint-disable-next-line no-unused-vars
export const parsePSICCode = async (_csvFilePath) => MAP;

/** Every industry classification in the PSIC table, A–Z. */
export const industryClasses = () => Object.keys(MAP).sort((a, b) => a.localeCompare(b));
