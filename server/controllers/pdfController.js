const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { PDFDocument } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');
const { connectToMongo, collections } = require('../config/db');

// GET /generate-icir/:id
async function generateICIR(req, res) {
  const { id } = req.params;
  try {
    if (!parseInt(id)) return res.status(400).send('Invalid id_no format');
    await connectToMongo();
    const record = await collections.ucds.findOne({ id_no: parseInt(id, 10) });
    if (!record) return res.status(404).send('Record not found');

    const pdfPath = path.join(__dirname, '..', 'tmp', 'icir-form.pdf');
    const pdfBuffer = await fs.promises.readFile(pdfPath);
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    pdfDoc.registerFontkit(fontkit);
    const fontPath = path.join(__dirname, '..', 'fonts', 'arial.ttf');
    const fontBytes = await fs.promises.readFile(fontPath);
    const customFont = await pdfDoc.embedFont(fontBytes);

    const form = pdfDoc.getForm();
    const formFields = form.getFields();
    formFields.forEach((field) => {
      switch (field.getName()) {
        case 'establishment_name':
          field.setText(`${record.title || ''}`);
          field.updateAppearances(customFont);
          break;
        case 'establishment_address':
          field.setText(`${record.address || ''}`);
          field.updateAppearances(customFont);
          break;
        case 'establishment_industry_class':
          field.setText(`${record.industry_class || ''}`);
          field.updateAppearances(customFont);
          break;
        case 'establishment_psic_code':
          field.setText(`${record.psic_code || ''}`);
          field.updateAppearances(customFont);
          break;
        case 'establishment_ecc_cnc1':
          field.setText(`${record.ecc_cnc || ''}`);
          field.updateAppearances(customFont);
          break;
        case 'ecc_issued1':
          field.setText(`${record.date_approved || ''}`);
          field.updateAppearances(customFont);
          break;
        case 'establishment_pto_code':
          field.setText(`${record.pto_code || ''}`);
          field.updateAppearances(customFont);
          break;
        case 'pto_issued':
          field.setText(`${record.pto_issued || ''}`);
          field.updateAppearances(customFont);
          break;
        case 'pto_exp':
          field.setText(`${record.pto_expiration || ''}`);
          field.updateAppearances(customFont);
          break;
        case 'establishment_wwdp_code':
          field.setText(`${record.wwdp_code || ''}`);
          field.updateAppearances(customFont);
          break;
        case 'wwdp_issued':
          field.setText(`${record.wwdp_issued || ''}`);
          field.updateAppearances(customFont);
          break;
        case 'wwdp_expiration':
          field.setText(`${record.wwdp_expiration || ''}`);
          field.updateAppearances(customFont);
          break;
        default:
          break;
      }
    });

    const pdfBytes = await pdfDoc.save();
    const compressedPdfBytes = zlib.gzipSync(pdfBytes);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="ICIR-${record.title}.pdf"`);
    res.setHeader('Content-Encoding', 'gzip');
    res.setHeader('Content-Length', compressedPdfBytes.length);
    res.send(compressedPdfBytes);
  } catch (error) {
    console.error('Error generating ICIR:', error);
    res.status(500).send('Failed to generate ICIR');
  }
}

// GET /generate-custom-icir/:id
async function generateCustomICIR(req, res) {
  const { id } = req.params;
  const selectedData = req.query;
  const idPattern = /^[A-Za-z0-9\-]+$/;
  if (!idPattern.test(id)) return res.status(400).send('Invalid id format');

  const fieldMapping = {
    title: 'establishment_name',
    name: 'contact_person',
    address: 'establishment_address',
    industry_class: 'establishment_industry_class',
    psic_code: 'establishment_psic_code',
    emp_total: 'emp_total',
    bod: 'bod_loading',
    wwtf_type: 'wwtf_type',
    ecc_cnc: 'establishment_ecc_cnc1',
    pco_no: 'pco_accreditation',
    pco_validity: 'pco_validity',
    date_approved: 'ecc_issued1',
    date_amended: 'ecc_expiration1',
    haz_id: 'establishment_haz_id',
    haz_issued: 'haz_issued',
    pto_code: 'establishment_pto_code',
    pto_issued: 'pto_issued',
    pto_expiration: 'pto_expiration',
    wwdp_code: 'establishment_wwdp_code',
    wwdp_issued: 'wwdp_issued',
    wwdp_expiration: 'wwdp_expiration',
    long: 'longitude',
    lat: 'latitude',
    handler: 'inspector1',
  };

  try {
    const pdfPath = path.join(__dirname, '..', 'tmp', 'icir-form.pdf');
    const pdfBuffer = await fs.promises.readFile(pdfPath);
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    pdfDoc.registerFontkit(fontkit);
    const fontPath = path.join(__dirname, '..', 'fonts', 'arial.ttf');
    if (!fs.existsSync(fontPath)) return res.status(500).send('Custom font file not found');
    const fontBytes = await fs.promises.readFile(fontPath);
    const customFont = await pdfDoc.embedFont(fontBytes);
    const form = pdfDoc.getForm();
    const formFields = form.getFields();
    formFields.forEach((field) => {
      const fieldName = field.getName();
      const pdfFieldName = Object.keys(fieldMapping).find((key) => fieldMapping[key] === fieldName);
      if (pdfFieldName) {
        const value = selectedData[pdfFieldName] || '';
        if (field.constructor.name === 'PDFTextField') {
          field.setText(value);
          field.updateAppearances(customFont);
        } else if (field.constructor.name === 'PDFCheckBox') {
          const isChecked = value.toLowerCase() === 'true' || value === '1';
          if (isChecked) field.check();
        } else if (field.constructor.name === 'PDFRadioButton') {
          const options = field.getOptions();
          if (options.includes(value)) field.select(value);
        }
      }
    });
    const pdfBytes = await pdfDoc.save();
    const compressedPdfBytes = zlib.gzipSync(pdfBytes);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="ICIR-${selectedData.title || 'Unknown'}.pdf"`);
    res.setHeader('Content-Encoding', 'gzip');
    res.setHeader('Content-Length', compressedPdfBytes.length);
    res.send(compressedPdfBytes);
  } catch (error) {
    console.error('Error generating custom ICIR:', error);
    if (error.stack) console.error(error.stack);
    res.status(500).send('Failed to generate ICIR');
  }
}

module.exports = { generateICIR, generateCustomICIR };
