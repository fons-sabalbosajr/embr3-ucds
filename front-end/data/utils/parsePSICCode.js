import Papa from 'papaparse';

export const parsePSICCode = async (csvFilePath) => {
  return new Promise((resolve, reject) => {
    Papa.parse(csvFilePath, {
      download: true,
      header: true,
      complete: (results) => {
        const psicCodeMap = {};
        results.data.forEach((item) => {
          const industryClass = item['Industry Category'];
          const psicCode = item['PSIC Code'];
          const industryType = item['Industry Type'];
          const industrySubType = item['Industry SubType'];
          psicCodeMap[industryClass] = { psicCode, industryType, industrySubType };
        });
        resolve(psicCodeMap);
      },
      error: (error) => {
        reject(error);
      },
    });
  });
};