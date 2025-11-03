const { connectToMongo, collections } = require('../config/db');

async function updateHealthcare(req, res) {
  try {
    await connectToMongo();
    const { id } = req.params;
    const newData = req.body;
    const oldDocument = await collections.healthcare.findOne({ id_no: parseInt(id, 10) });
    if (!oldDocument) return res.status(404).json({ error: 'Healthcare data not found' });
    const result = await collections.healthcare.updateOne({ id_no: parseInt(id, 10) }, { $set: newData });
    if (result.modifiedCount === 1) {
      const auditCollection = (await connectToMongo()).collections.activityLogs;
      const changes = [];
      Object.keys(newData).forEach((key) => {
        if (oldDocument[key] !== newData[key]) changes.push({ field: key, old_value: oldDocument[key], new_value: newData[key] });
      });
      await auditCollection.insertOne({ type: 'HealthcareUpdate', id_no: parseInt(id, 10), updated_at: new Date(), changes });
      return res.status(200).json({ message: 'Healthcare data updated successfully' });
    }
    if (result.matchedCount === 1 && result.modifiedCount === 0) return res.status(200).json({ message: 'No changes were made to the healthcare data' });
    return res.status(404).json({ error: 'Healthcare data not found or no changes were made' });
  } catch (error) {
    console.error('Error updating healthcare data:', error);
    return res.status(500).json({ error: 'Failed to update healthcare data. Please try again later.' });
  }
}

async function updateChemical(req, res) {
  try {
    await connectToMongo();
    const { id } = req.params;
    const newData = req.body;
    const oldDocument = await collections.chemicals.findOne({ id_no: parseInt(id, 10) });
    if (!oldDocument) return res.status(404).json({ error: 'Chemical data not found' });
    const result = await collections.chemicals.updateOne({ id_no: parseInt(id, 10) }, { $set: newData });
    if (result.modifiedCount === 1) {
      const auditCollection = (await connectToMongo()).collections.activityLogs;
      const changes = [];
      Object.keys(newData).forEach((key) => {
        if (oldDocument[key] !== newData[key]) changes.push({ field: key, old_value: oldDocument[key], new_value: newData[key] });
      });
      await auditCollection.insertOne({ type: 'ChemicalUpdate', id_no: parseInt(id, 10), updated_at: new Date(), changes });
      return res.status(200).json({ message: 'Chemical data updated successfully' });
    }
    if (result.matchedCount === 1 && result.modifiedCount === 0) return res.status(200).json({ message: 'No changes were made to the chemical data' });
    return res.status(404).json({ error: 'Chemical data not found or no changes were made' });
  } catch (error) {
    console.error('Error updating chemical data:', error);
    return res.status(500).json({ error: 'Failed to update chemical data. Please try again later.' });
  }
}

async function updateTsd(req, res) {
  try {
    await connectToMongo();
    const { id } = req.params;
    const newData = req.body;
    const oldDocument = await collections.tsd.findOne({ id_no: parseInt(id, 10) });
    if (!oldDocument) return res.status(404).json({ error: 'TSD data not found' });
    const result = await collections.tsd.updateOne({ id_no: parseInt(id, 10) }, { $set: newData });
    if (result.modifiedCount === 1) {
      const auditCollection = (await connectToMongo()).collections.activityLogs;
      const changes = [];
      Object.keys(newData).forEach((key) => {
        if (oldDocument[key] !== newData[key]) changes.push({ field: key, old_value: oldDocument[key], new_value: newData[key] });
      });
      await auditCollection.insertOne({ type: 'TsdUpdate', id_no: parseInt(id, 10), updated_at: new Date(), changes });
      return res.status(200).json({ message: 'TSD data updated successfully' });
    }
    if (result.matchedCount === 1 && result.modifiedCount === 0) return res.status(200).json({ message: 'No changes were made to the tsd data' });
    return res.status(404).json({ error: 'TSD data not found or no changes were made' });
  } catch (error) {
    console.error('Error updating tsd data:', error);
    return res.status(500).json({ error: 'Failed to update tsd data. Please try again later.' });
  }
}

module.exports = { updateHealthcare, updateChemical, updateTsd };
 
// Read handlers
async function getHealthcare(req, res) {
  try {
    await connectToMongo();
    const data = await collections.healthcare.find({}).toArray();
    return res.status(200).json(data);
  } catch (error) {
    console.error('Error fetching healthcare data:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}

async function getChemicals(req, res) {
  try {
    await connectToMongo();
    const data = await collections.chemicals.find({}).toArray();
    return res.status(200).json(data);
  } catch (error) {
    console.error('Error fetching chemical data:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}

async function getTsd(req, res) {
  try {
    await connectToMongo();
    const data = await collections.tsd.find({}).toArray();
    return res.status(200).json(data);
  } catch (error) {
    console.error('Error fetching tsd data:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}

module.exports.getHealthcare = getHealthcare;
module.exports.getChemicals = getChemicals;
module.exports.getTsd = getTsd;