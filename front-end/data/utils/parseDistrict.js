import Papa from 'papaparse';
// Bundled with the code: fetched from /data/ it reached only the development server.
import districtCsv from '../district.csv?raw';

const ROWS = Papa.parse(districtCsv, { header: true, skipEmptyLines: true }).data;

/** The municipalities' district and waterbody rows. The path is no longer read. */
// eslint-disable-next-line no-unused-vars
export const parseDistrict = async (_csvFilePath) => ROWS;
