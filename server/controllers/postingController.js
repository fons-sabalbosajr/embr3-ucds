const { connectToMongo, collections, ObjectId } = require('../config/db');

async function createPosting(req, res) {
  try {
    const { title, message, date, acknowledgement, iconType } = req.body;
    await connectToMongo();
    await collections.postings.insertOne({
      title,
      message,
      date,
      acknowledgement,
      iconType,
      createdDate: new Date(),
    });
    res.status(201).send({ message: 'Announcement saved successfully!' });
  } catch (error) {
    console.error('Error saving announcement:', error);
    res.status(500).send({ message: 'Error saving announcement' });
  }
}

async function listPostings(req, res) {
  try {
    await connectToMongo();
    const postings = await collections.postings.find().toArray();
    res.json(postings);
  } catch (error) {
    console.error('Error fetching postings data:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

async function updatePosting(req, res) {
  try {
    await connectToMongo();
    const { id } = req.params;
    const updates = req.body;

    const cleanUpdates = {};
    for (const key in updates) {
      if (updates[key] !== undefined) {
        if (key === 'date') cleanUpdates['createdDate'] = new Date(updates[key]);
        else cleanUpdates[key] = updates[key];
      }
    }

    const currentPosting = await collections.postings.findOne({ _id: new ObjectId(id) });
    if (!currentPosting) return res.status(404).json({ error: 'Posting not found' });

    await collections.postings.updateOne({ _id: new ObjectId(id) }, { $set: cleanUpdates });

    if (updates.status && updates.status !== currentPosting.status) {
      // A UCDS audit entry: MongoDB or SQL Server by category (services/activityStore.js).
      await require('../services/activityStore').record({
        type: 'PostingStatusChange',
        postingId: id,
        changedBy: req.session?.user?.username || 'unknown',
        oldStatus: currentPosting.status || 'undefined',
        newStatus: updates.status,
        timestamp: new Date(),
      });
    }

    res.json({ message: 'Posting updated successfully' });
  } catch (error) {
    console.error('Error updating posting:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

async function patchPosting(req, res) {
  try {
    await connectToMongo();
    const { id } = req.params;
    const { isRead, showAgain } = req.body;
    const updateFields = {};
    if (isRead !== undefined) updateFields.isRead = isRead;
    if (showAgain !== undefined) updateFields.showAgain = showAgain;
    await collections.postings.updateOne({ _id: new ObjectId(id) }, { $set: updateFields });
    res.json({ message: 'Announcement updated' });
  } catch (error) {
    console.error('Error updating announcement:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

async function deletePosting(req, res) {
  try {
    await connectToMongo();
    const { id } = req.params;
    const result = await collections.postings.deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) return res.status(404).json({ error: 'Posting not found' });
    res.json({ message: 'Posting deleted successfully' });
  } catch (error) {
    console.error('Error deleting posting:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

module.exports = { createPosting, listPostings, updatePosting, patchPosting, deletePosting };
