const { connectToMongo, collections } = require('../config/db');

// Save draft report without PDF upload (stores metadata only)
async function saveDraftReport(req, res) {
  try {
    const { reportInfo, user, date, fileName } = req.body;

    if (!reportInfo || !user || !date) {
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

    const { id_no, name, title, ecc_cnc, address } = parsedReportInfo;
    if (!id_no || !name || !title || !ecc_cnc || !address) {
      return res.status(400).send({ message: 'Incomplete reportInfo data' });
    }

    const parsedDate = new Date(date);
    if (isNaN(parsedDate.getTime())) {
      return res.status(400).send({ message: 'Invalid date format' });
    }

    const draftReport = {
      user: parsedUser,
      date: parsedDate,
      reportInfo: { id_no, name, title, ecc_cnc, address },
      fileName: fileName || '',
      pdfUrl: '',
    };

    await connectToMongo();
    await collections.draftReports.insertOne(draftReport);
    res.status(200).send({ message: 'Draft report saved successfully' });
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

async function listDraftReports(req, res) {
  try {
    await connectToMongo();
    const drafts = await collections.draftReports.find().toArray();
    res.json(drafts);
  } catch (error) {
    console.error('Error fetching draft reports:', error);
    res.status(500).send({ message: 'Error fetching draft reports' });
  }
}

module.exports = { saveDraftReport, saveDraftReportSurvey, listDraftReports };
