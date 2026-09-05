const { MongoClient, ObjectId } = require('mongodb');

const mongoUri = process.env.MONGO_URI;

if (!mongoUri) {
  throw new Error('MONGO_URI is not set in environment variables');
}

const client = new MongoClient(mongoUri, { ssl: true });

let db; // universe-db

// Named collection handles (populated after connect)
const collections = {};

async function connectToMongo() {
  if (db) return { db, client, collections };
  await client.connect();
  db = client.db('universe-db');

  // Initialize commonly used collections
  collections.users = db.collection('users');
  collections.signUp = db.collection('sign-up');
  collections.loginStatus = db.collection('login-status');
  collections.ucds = db.collection('ucds-data');
  collections.archive = db.collection('archive-data');
  collections.postings = db.collection('postings');
  collections.draftReports = db.collection('draft-reports');
  collections.survey2024 = db.collection('survey-data-2024');
  collections.survey2025 = db.collection('survey-data-2025');
  collections.activityLogs = db.collection('app-logs');
  collections.surveyLog = db.collection('survey-log');
  collections.ucdsLog = db.collection('ucds-log');
  collections.projectType = db.collection('project_type');
  collections.healthcare = db.collection('ucds-data-healthcare');
  collections.chemicals = db.collection('ucds-data-chemicals');
  collections.tsd = db.collection('ucds-data-tsd');
  collections.trc = db.collection('ucds-data-trc');
  collections.swmplan = db.collection('ucds-eswm-ten_swm_plan');
  collections.mrf = db.collection('ucds-eswm-mrf');
  collections.slf = db.collection('ucds-eswm-slf');
  collections.equipment = db.collection('ucds-eswm-equipment');
  collections.ods = db.collection('ucds-eswm-ods');
  // Developer settings collections
  collections.fieldConfigs = db.collection('developer-field-configs');
  collections.pdfForms = db.collection('developer-pdf-forms');

  // Year container registry (see services/yearService.js)
  collections.yearContainers = db.collection('year-containers');

  return { db, client, collections };
}

function getDb() {
  if (!db) throw new Error('MongoDB not connected. Call connectToMongo() first.');
  return db;
}

module.exports = { connectToMongo, getDb, collections, client, ObjectId };
