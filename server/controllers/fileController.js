const reportFiles = require('../services/reportFiles');

/**
 * GET /api/files/:filename — a generated report by name.
 *
 * Reports live on the records share (RECORDS\Database\E-Universe Reports);
 * the database copy is only consulted while a move is still pending. Same
 * URL either way, so the Report Drafts screen does not care where the bytes
 * came from.
 */
async function streamFile(req, res) {
  try {
    const report = await reportFiles.openReport(req.params.filename);
    if (!report) return res.status(404).json({ message: 'That report file is not available.' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', report.size);
    res.setHeader('Cache-Control', 'private, no-store');
    report.stream.on('error', (error) => {
      console.error('Error fetching report file:', error.code || error.message);
      if (!res.headersSent) res.status(500).send('Error fetching file');
      else res.destroy(error);
    });
    return report.stream.pipe(res);
  } catch (error) {
    console.error('Error serving file:', error);
    return res.status(500).send('Error serving file');
  }
}

module.exports = { streamFile };
