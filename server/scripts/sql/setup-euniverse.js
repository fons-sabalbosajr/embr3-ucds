#!/usr/bin/env node
/**
 * Phase B1: create E-Universe's own SQL Server database and login.
 *
 *   npm run sql:setup                       create what is missing, then migrate
 *   npm run sql:setup -- --rotate-password  give eu_app a new password
 *
 * Creates, on the legacy ERMS SQL Server (the office server):
 *   db_euniverse        E-Universe's data, moved from MongoDB phase by phase
 *   db_euniverse_test   the same tables, for the test suite; never live data
 *   login eu_app        owner of those two databases and nothing else
 *
 * Connects for this one job with the administrator login saved under
 * Storage › SQL Server (app-config/legacy-sql); from then on E-Universe uses
 * eu_app. eu_app's password is 40 random characters, generated here, stored
 * encrypted (CONFIG_ENCRYPTION_KEY) in app-config/euniverse-sql BEFORE the
 * login is created, so a failure halfway cannot lose it; it is never printed.
 * Database names are constants in this file; the password reaches SQL Server
 * only as a parameter, quoted there by QUOTENAME.
 *
 * Then signs in as eu_app and checks it is confined: owner of its databases,
 * no access to the desktop's, not a server administrator. Safe to run again.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const crypto = require('crypto');
const sql = require('mssql');
const { connectToMongo, getDb } = require('../../config/db');
const secrets = require('../../services/secrets');
const euSql = require('../../services/euSql');

const DATABASES = ['db_euniverse', 'db_euniverse_test'];
const LOGIN = 'eu_app';
const ROTATE = process.argv.includes('--rotate-password');
const log = (...a) => console.log(...a);

/** 40 characters from a set SQL Server's policy accepts and no shell or quote can trip over. */
function newPassword() {
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '!#%+-=@^_~'];
  const all = sets.join('');
  const pick = (s) => s[crypto.randomInt(s.length)];
  const chars = [...sets.map(pick), ...Array.from({ length: 36 }, () => pick(all))];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

async function main() {
  if (!secrets.isConfigured()) throw new Error('CONFIG_ENCRYPTION_KEY is not set; a password cannot be stored safely.');
  await connectToMongo();
  const configs = getDb().collection('app-config');

  const admin = await configs.findOne({ _id: 'legacy-sql' });
  if (!admin?.host || !admin.password) throw new Error('No SQL Server login is saved. Set it under Storage › SQL Server first.');
  const adminPassword = secrets.decrypt(admin.password);
  if (!adminPassword) throw new Error('The saved SQL Server password cannot be read (CONFIG_ENCRYPTION_KEY).');

  log(`\n== Connecting to ${admin.host}:${admin.port || 1433} as ${admin.username} (administrator, for setup only)`);
  const pool = new sql.ConnectionPool({
    server: admin.host,
    port: admin.port || 1433,
    user: admin.username,
    password: adminPassword,
    database: 'master',
    connectionTimeout: 15000,
    requestTimeout: 120000,
    options: { encrypt: admin.encrypt !== false, trustServerCertificate: admin.trustServerCertificate !== false, appName: 'E-Universe setup' },
  });
  await pool.connect();
  try {
    const who = (await pool.request().query("SELECT IS_SRVROLEMEMBER('sysadmin') AS sa, IS_SRVROLEMEMBER('dbcreator') AS dbc, IS_SRVROLEMEMBER('securityadmin') AS seca")).recordset[0];
    if (!who.sa && !(who.dbc && who.seca)) throw new Error(`${admin.username} cannot create databases and logins (needs sysadmin, or dbcreator + securityadmin).`);

    for (const db of DATABASES) {
      const exists = (await pool.request().input('db', sql.NVarChar(128), db).query('SELECT DB_ID(@db) AS id')).recordset[0].id;
      if (exists) log(`   ${db}: exists`);
      else {
        await pool.request().batch(`CREATE DATABASE [${db}]`);
        log(`   ${db}: created`);
      }
      // No log-backup schedule exists for it, so FULL recovery would let the
      // transaction log grow until the disk fills. Back it up nightly instead.
      await pool.request().batch(`ALTER DATABASE [${db}] SET RECOVERY SIMPLE`);
    }

    // The password: stored (encrypted) before the login is created or changed.
    const current = await configs.findOne({ _id: euSql.DOC_ID });
    let password = current?.password ? secrets.decrypt(current.password) : null;
    const loginExists = (await pool.request().input('login', sql.NVarChar(128), LOGIN).query('SELECT SUSER_ID(@login) AS id')).recordset[0].id != null;
    const setPassword = ROTATE || !password || (loginExists && !current?.loginReady);
    if (setPassword || !password) {
      password = newPassword();
      await configs.updateOne(
        { _id: euSql.DOC_ID },
        {
          $set: {
            host: admin.host,
            port: admin.port || 1433,
            database: DATABASES[0],
            username: LOGIN,
            password: secrets.encrypt(password),
            encrypt: admin.encrypt !== false,
            trustServerCertificate: admin.trustServerCertificate !== false,
            loginReady: false,
            updatedAt: new Date(),
            updatedBy: 'cli:sql-setup',
          },
        },
        { upsert: true }
      );
      log('== eu_app password: new one generated and stored encrypted (never shown)');
    }

    const statement = loginExists
      ? `N'ALTER LOGIN [${LOGIN}] WITH PASSWORD = ' + QUOTENAME(@pw, '''') + N', CHECK_POLICY = ON'`
      : `N'CREATE LOGIN [${LOGIN}] WITH PASSWORD = ' + QUOTENAME(@pw, '''') + N', CHECK_POLICY = ON, CHECK_EXPIRATION = OFF, DEFAULT_DATABASE = [${DATABASES[0]}]'`;
    if (!loginExists || setPassword) {
      await pool.request().input('pw', sql.NVarChar(128), password).batch(`DECLARE @s nvarchar(max) = ${statement}; EXEC (@s);`);
      log(`== login ${LOGIN}: ${loginExists ? 'password changed' : 'created'}`);
    } else {
      log(`== login ${LOGIN}: exists, password unchanged`);
    }

    for (const db of DATABASES) {
      await pool.request().batch(
        `EXEC (N'USE [${db}]; IF USER_ID(N''${LOGIN}'') IS NULL CREATE USER [${LOGIN}] FOR LOGIN [${LOGIN}]; ALTER ROLE db_owner ADD MEMBER [${LOGIN}];')`
      );
      log(`   ${db}: ${LOGIN} is its owner (db_owner)`);
    }
    await configs.updateOne({ _id: euSql.DOC_ID }, { $set: { loginReady: true, updatedAt: new Date() } });
  } finally {
    await pool.close();
  }

  // ---- confirm, as eu_app ----------------------------------------------------
  log(`\n== Checking as ${LOGIN}`);
  await euSql.close();
  const others = (
    await euSql.query(`SELECT name, HAS_DBACCESS(name) AS access FROM sys.databases
                       WHERE database_id > 4 AND name NOT IN ('db_euniverse', 'db_euniverse_test')`)
  ).recordset;
  const self = (await euSql.query("SELECT IS_SRVROLEMEMBER('sysadmin') AS sa, IS_MEMBER('db_owner') AS owner, DB_NAME() AS db")).recordset[0];
  const leaks = others.filter((o) => o.access === 1).map((o) => o.name);
  log(`   connected to ${self.db}; db_owner: ${self.owner === 1 ? 'yes' : 'NO'}; sysadmin: ${self.sa === 1 ? 'YES (unexpected)' : 'no'}`);
  log(`   other databases it can open: ${leaks.length ? leaks.join(', ') + '  <-- should be none' : 'none'}`);
  if (self.sa === 1 || leaks.length) {
    throw new Error(`${LOGIN} is not confined to its own databases. ${leaks.length ? 'The guest user is probably enabled in: ' + leaks.join(', ') + '. Ask the DBA to run REVOKE CONNECT FROM guest there.' : ''}`);
  }

  // ---- tables ----------------------------------------------------------------
  for (const db of DATABASES) {
    process.env.EU_SQL_DATABASE = db;
    await euSql.close();
    const done = await euSql.migrate();
    const st = await euSql.migrationStatus();
    log(`== ${db}: ${done.length ? `applied ${done.join(', ')}` : 'up to date'} (schema version ${st.applied.at(-1)?.version || 'none'})`);
  }
  delete process.env.EU_SQL_DATABASE;
  await euSql.close();
  log('\nDone. E-Universe connects as eu_app from now on; the administrator login was used only for this setup.');
}

main()
  .then(() => process.exit(0))
  .catch(async (e) => {
    console.error('\nFAILED:', e.message);
    await euSql.close().catch(() => {});
    process.exit(1);
  });
