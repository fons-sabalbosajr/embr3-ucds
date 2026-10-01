const { MongoClient, ObjectId } = require('mongodb');

const mongoUri = process.env.MONGO_URI;

if (!mongoUri) {
  throw new Error('MONGO_URI is not set in environment variables');
}

// Pool sized for ~500 people working at once. Atlas free/shared tiers cap
// connections per cluster (500 on M0), and every Node process shares this one
// client, so 50 leaves room for a second instance and the session store.
// Idle connections are released so a quiet evening does not hold 50 open.
// The SRV/TXT records and the shard hostnames resolve over TCP when the
// network drops UDP DNS (see config/dns.js); `lookup` is what the driver's
// sockets use for the hostnames.
const { configureDns, resilientLookup } = require('./dns');
configureDns();

const client = new MongoClient(mongoUri, {
  ssl: true,
  maxPoolSize: Number(process.env.MONGO_MAX_POOL) || 50,
  minPoolSize: 5,
  maxIdleTimeMS: 60_000,
  serverSelectionTimeoutMS: 10_000,
  compressors: ['zstd', 'snappy', 'zlib'],
  lookup: resilientLookup,
});

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
  collections.activityLogs = db.collection('app-logs');
  collections.ucdsLog = db.collection('ucds-log');
  collections.projectType = db.collection('project_type');
  // Developer settings collections

  // Year container registry (see services/yearService.js)
  collections.yearContainers = db.collection('year-containers');

  // Shared platform master data
  collections.orgUnits = db.collection('org-units');

  // ERMS domain. Only modules/erms writes these.
  collections.ermsRecords = db.collection('erms-records');
  collections.ermsIdMap = db.collection('erms-id-map');

  return { db, client, collections };
}

function getDb() {
  if (!db) throw new Error('MongoDB not connected. Call connectToMongo() first.');
  return db;
}

module.exports = { connectToMongo, getDb, collections, client, ObjectId };
