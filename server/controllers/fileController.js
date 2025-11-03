const { GridFSBucket } = require('mongodb');
const { getDb } = require('../config/db');

async function streamFile(req, res) {
  try {
    const filename = req.params.filename;
    const db = getDb();
    const bucket = new GridFSBucket(db, { bucketName: 'pdfFiles' });
    const downloadStream = bucket.openDownloadStreamByName(filename);
    downloadStream.on('error', (error) => {
      console.error('Error fetching file:', error);
      res.status(500).send('Error fetching file');
    });
    downloadStream.pipe(res);
  } catch (error) {
    console.error('Error serving file:', error);
    res.status(500).send('Error serving file');
  }
}

module.exports = { streamFile };
