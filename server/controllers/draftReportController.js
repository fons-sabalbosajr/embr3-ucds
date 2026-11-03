const { connectToMongo, collections } = require('../config/db');
const nas = require('../services/nasStorage');
const reportFiles = require('../services/reportFiles');

const text = (v, max = 300) => (v == null ? null : String(v).replace(/\s+/g, ' ').trim().slice(0, max) || null);
const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// An ICIR draft, kept for the establishment it was made for — the register
// record's id, serial and title, whatever fields were ticked to print — and
// its PDF filed on the records share beside the earlier reports
// (services/reportFiles), where /api/files serves it. It used to keep only
// the printed fields, refused a draft whose ticked fields lacked one of five,
// and dropped the PDF.
async function saveDraftReport(req, res) {
  try {
    const { reportInfo, user, date, fileName } = req.body;
    if (!reportInfo || !user || !date) return res.status(400).send({ message: 'Missing required fields' });

    let info;
    let parsedUser;
    try {
      info = JSON.parse(reportInfo);
      parsedUser = JSON.parse(user);
    } catch {
      return res.status(400).send({ message: 'Invalid JSON format' });
    }
    const recordId = text(info.recordId, 40);
    const sortKey = text(info.sort_key, 40);
    if (!recordId && !sortKey) return res.status(400).send({ message: 'Which establishment the report is for is missing.' });
    const parsedDate = new Date(date);
    if (isNaN(parsedDate.getTime())) return res.status(400).send({ message: 'Invalid date format' });

    let stored = { fileName: text(fileName, 200) || '', pdfUrl: '' };
    let fileSaved = false;
    if (req.file?.buffer?.length) {
      const w = await nas.writeFile(nas.RECORDS_KEY, reportFiles.SUBDIR, fileName || req.file.originalname || `ICIR-${sortKey || recordId}.pdf`, req.file.buffer);
      if (w.ok) {
        stored = { fileName: w.fileName, pdfUrl: w.sharePath, storage: 'nas' };
        fileSaved = true;
      }
    }

    const draftReport = {
      user: { name: text(parsedUser?.name, 120) },
      date: parsedDate,
      reportInfo: {
        recordId,
        sort_key: sortKey,
        id_no: info.id_no ?? null,
        register: text(info.register, 40),
        name: text(info.name),
        title: text(info.title),
        ecc_cnc: text(info.ecc_cnc),
        address: text(info.address),
        purpose: text(info.purpose, 40),
      },
      ...stored,
    };
    await connectToMongo();
    await collections.draftReports.insertOne(draftReport);
    res.status(200).send({ message: 'Draft report saved successfully', fileSaved });
  } catch (error) {
    console.error('Failed to save draft report:', error);
    res.status(500).send({ message: 'Failed to save draft report', error: error.message });
  }
}

// Save draft report for survey with PDF upload reference
async function saveDraftReportSurvey(req, res) {
  try {
    const { reportInfo, user, date, fileName } = req.body;

    if (!reportInfo || !user || !date || !req.file) {
      return res.status(400).send({ message: 'Missing required fields' });
    }

    let parsedReportInfo;
    let parsedUser;
    try {
      parsedReportInfo = JSON.parse(reportInfo);
      parsedUser = JSON.parse(user);
    } catch (parseError) {
      return res.status(400).send({ message: 'Invalid JSON format' });
    }

    const { id_no, name, title, iis_no, address } = parsedReportInfo;
    if (!id_no || !name || !title || !iis_no || !address) {
      return res.status(400).send({ message: 'Incomplete reportInfo data' });
    }

    const parsedDate = new Date(date);
    if (isNaN(parsedDate.getTime())) {
      return res.status(400).send({ message: 'Invalid date format' });
    }

    // Using memory storage in existing setup; fall back to original name if no filename is set
    const uploadedName = (req.file && (req.file.filename || req.file.originalname)) || `upload-${Date.now()}.pdf`;
    const pdfFilePath = `uploads/${uploadedName}`;

    const draftReport = {
      user: parsedUser,
      date: parsedDate,
      reportInfo: { id_no, name, title, iis_no, address },
      fileName: fileName || '',
      pdfUrl: pdfFilePath,
    };

    await connectToMongo();
    await collections.draftReports.insertOne(draftReport);
    res.status(200).send({ message: 'Draft report saved successfully' });
  } catch (error) {
    console.error('Failed to save draft report:', error);
    res.status(500).send({ message: 'Failed to save draft report', error: error.message });
  }
}

/**
 * The drafts of one establishment, newest first: `recordId` (the register
 * record's _id) and `title`. Drafts from before they named their record
 * carry only id_no, which has since been given to other firms, so those
 * are matched by the establishment's title.
 */
async function listDraftReports(req, res) {
  try {
    await connectToMongo();
    const recordId = text(req.query.recordId, 40);
    const title = text(req.query.title);
    const filter = {};
    if (recordId || title) {
      filter.$or = [
        ...(recordId ? [{ 'reportInfo.recordId': recordId }] : []),
        ...(title ? [{ 'reportInfo.recordId': null, 'reportInfo.title': { $regex: `^\\s*${escapeRe(title)}\\s*$`, $options: 'i' } }] : []),
      ];
    }
    const drafts = await collections.draftReports.find(filter).sort({ date: -1 }).limit(500).toArray();
    res.json(drafts);
  } catch (error) {
    console.error('Error fetching draft reports:', error);
    res.status(500).send({ message: 'Error fetching draft reports' });
  }
}

module.exports = { saveDraftReport, saveDraftReportSurvey, listDraftReports };
