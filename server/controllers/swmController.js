const { connectToMongo, collections, ObjectId } = require('../config/db');

async function getSwmPlanData(req, res) {
  try {
    await connectToMongo();
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 20;
    const skip = (page - 1) * pageSize;

    const mongoQuery = {};
    const queryConditions = [];

    const globalSearchFieldsSWM = ['lguName', 'province', 'planId', 'status', 'remarks'];
    if (req.query.search) {
      const searchTermTrimmed = String(req.query.search).trim();
      if (searchTermTrimmed) {
        const orConditions = globalSearchFieldsSWM.map((sField) => ({ [sField]: { $regex: searchTermTrimmed, $options: 'i' } }));
        if (orConditions.length > 0) queryConditions.push({ $or: orConditions });
      }
    }

    const columnFilterableFieldsSWM = ['lguName', 'province', 'status', 'yearSubmitted', 'yearApproved', 'planId', 'remarks'];
    columnFilterableFieldsSWM.forEach((field) => {
      if (req.query[field] && req.query[field].length > 0 && !['search', 'page', 'pageSize'].includes(field)) {
        const filterValues = Array.isArray(req.query[field]) ? req.query[field] : [req.query[field]];
        const firstFilterValue = String(filterValues[0]).trim();
        if (firstFilterValue) queryConditions.push({ [field]: { $regex: firstFilterValue, $options: 'i' } });
      }
    });

    if (req.query.province && typeof req.query.province === 'string' && req.query.province.trim() !== '' && req.query.province.trim().toLowerCase() !== 'all provinces') {
      queryConditions.push({ province: { $regex: `^${req.query.province.trim()}$`, $options: 'i' } });
    }
    if (req.query.planStatus && typeof req.query.planStatus === 'string' && req.query.planStatus.trim() !== '') {
      queryConditions.push({ status: { $regex: `^${req.query.planStatus.trim()}$`, $options: 'i' } });
    }

    if (queryConditions.length > 0) mongoQuery.$and = queryConditions;

    const total = await collections.swmplan.countDocuments(mongoQuery);

    const pipeline = [];
    if (Object.keys(mongoQuery).length > 0) pipeline.push({ $match: mongoQuery });

    pipeline.push(
      { $addFields: { _temp_id_no: { $ifNull: ['$id_no', ''] } } },
      { $addFields: { _id_no_parts: { $split: ['$_temp_id_no', '-'] } } },
      {
        $addFields: {
          _id_no_prefix: {
            $cond: {
              if: { $gt: [{ $size: { $ifNull: ['$_id_no_parts', []] } }, 0] },
              then: { $arrayElemAt: ['$_id_no_parts', 0] },
              else: '$_temp_id_no',
            },
          },
          _id_no_number_str: {
            $cond: {
              if: { $gt: [{ $size: { $ifNull: ['$_id_no_parts', []] } }, 1] },
              then: { $arrayElemAt: ['$_id_no_parts', 1] },
              else: null,
            },
          },
        },
      },
      { $addFields: { _id_no_number: { $convert: { input: '$_id_no_number_str', to: 'int', onError: null, onNull: null } } } },
    );

    pipeline.push({ $sort: { _id_no_prefix: 1, _id_no_number: 1 } });
    pipeline.push({ $skip: skip });
    pipeline.push({ $limit: pageSize });

    pipeline.push({ $project: { _temp_id_no: 0, _id_no_parts: 0, _id_no_prefix: 0, _id_no_number_str: 0, _id_no_number: 0 } });

    const plans = await collections.swmplan.aggregate(pipeline, { allowDiskUse: true }).toArray();
    return res.status(200).json({ data: plans, total });
  } catch (error) {
    console.error('Error fetching SWM Plan data:', error);
    return res.status(500).send('Internal Server Error');
  }
}

async function getSwmPlanStats(req, res) {
  try {
    await connectToMongo();
    const totalPlans = await collections.swmplan.countDocuments({});

    const statusBreakdown = await collections.swmplan.aggregate([
      { $match: { status: { $exists: true, $ne: null, $ne: '' } } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $project: { _id: 0, status: '$_id', count: 1 } },
      { $sort: { count: -1 } },
    ]).toArray();

    const provinceBreakdown = await collections.swmplan.aggregate([
      { $match: { province: { $exists: true, $ne: null, $ne: '' } } },
      { $group: { _id: '$province', count: { $sum: 1 } } },
      { $project: { _id: 0, province: '$_id', count: 1 } },
      { $sort: { count: -1 } },
    ]).toArray();

    const remarksBreakdown = await collections.swmplan.aggregate([
      { $match: { remarks_recommendations: { $exists: true, $ne: null, $ne: '' } } },
      { $group: { _id: '$remarks_recommendations', count: { $sum: 1 } } },
      { $project: { _id: 0, remarkType: '$_id', count: 1 } },
      { $sort: { count: -1 } },
    ]).toArray();
    const remarksBreakdownObject = remarksBreakdown.reduce((acc, item) => {
      acc[item.remarkType] = item.count;
      return acc;
    }, {});

    const currentYear = new Date().getFullYear();
    const plansSubmittedThisYear = await collections.swmplan.countDocuments({
      submissionDate: { $gte: new Date(`${currentYear}-01-01T00:00:00.000Z`), $lt: new Date(`${currentYear + 1}-01-01T00:00:00.000Z`) },
    });

    return res.json({ totalPlans, statusBreakdown, provinceBreakdown, plansSubmittedThisYear, remarksBreakdown: remarksBreakdownObject });
  } catch (error) {
    console.error('Error fetching SWM Plan dashboard stats:', error);
    return res.status(500).json({ error: 'Failed to fetch SWM Plan dashboard statistics.' });
  }
}

async function updateSwmPlanData(req, res) {
  try {
    await connectToMongo();
    const { id } = req.params;
    const newData = req.body;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid ID format for SWM Plan.' });
    const { _id, ...updatePayload } = newData;
    const result = await collections.swmplan.updateOne({ _id: new ObjectId(id) }, { $set: updatePayload });
    if (result.matchedCount === 0) return res.status(404).json({ error: 'SWM Plan not found.' });
    if (result.modifiedCount === 0) return res.status(200).json({ message: 'No changes made to the SWM Plan.' });
    return res.status(200).json({ message: 'SWM Plan updated successfully.' });
  } catch (error) {
    console.error('Error updating SWM Plan data:', error);
    return res.status(500).json({ error: 'Failed to update SWM Plan data.' });
  }
}

module.exports = { getSwmPlanData, getSwmPlanStats, updateSwmPlanData };
