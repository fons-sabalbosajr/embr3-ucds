const { connectToMongo, collections, ObjectId } = require('../config/db');

async function logActivity(req, res, next) {
  const { method, path, body } = req;

  if (!['POST', 'PUT', 'PATCH', 'GET'].includes(method)) return next();

  if (!req.session || !req.session.user) return res.status(401).send('Unauthorized: No session found');

  const userId = req.session.user.userId;
  const username = req.session.user.username;

  let actionType;
  let actionLabel;
  let changes = null;

  let collectionName = '';
  if (path.includes('/survey/')) {
    const year = body.year || '2025';
    collectionName = `survey-data-${year}`;
  } else if (path.includes('/update-data/')) {
    collectionName = 'ucds-data';
  } else if (path.includes('/postings/')) {
    collectionName = 'postings';
  } else if (path.includes('/draft-reports/')) {
    collectionName = 'draft-reports';
  } else if (path.includes('/users/')) {
    collectionName = 'users';
  }

  if (collectionName) {
    let filter;
    const { id } = req.params || {};

    if (id) {
      if (/^[a-fA-F\d]{24}$/.test(id)) {
        filter = { _id: new ObjectId(id) };
      } else {
        // Fallback: simple match for sort_key
        filter = { sort_key: id };
      }
    }

    try {
      await connectToMongo();
      const db = collections;
      const collection = require('../config/db').getDb().collection(collectionName);

      if (method === 'PUT' || method === 'PATCH') {
        const originalData = await collection.findOne(filter);
        if (!originalData) return next();

        changes = {};
        for (let key in body) {
          if (Object.prototype.hasOwnProperty.call(body, key) && body[key] !== originalData[key]) {
            changes[key] = { from: originalData[key], to: body[key] };
          }
        }

        actionType = method === 'PUT' ? 'Update Data' : 'Patch';
        actionLabel = `Updated/Modify fields: ${JSON.stringify(changes)}`;
      } else if (method === 'POST') {
        actionType = 'Added Data';
        actionLabel = `Added data: ${JSON.stringify(body)}`;
      } else if (method === 'GET') {
        actionType = 'Read Data';
        actionLabel = `Fetched data from ${collectionName}`;
      }
    } catch (error) {
      console.error('Error during activity logging:', error);
      return next();
    }
  } else {
    actionType = 'Generic Action';
    actionLabel = `Performed action on path: ${path}`;
  }

  const activityLog = {
    userId,
    username,
    method,
    path,
    actionType,
    actionLabel,
    requestData: body,
    timestamp: new Date(),
  };

  try {
    await connectToMongo();
    await require('../config/db').getDb().collection('app-logs').insertOne(activityLog);
  } catch (error) {
    console.error('Error logging activity:', error);
  }

  next();
}

module.exports = { logActivity };
