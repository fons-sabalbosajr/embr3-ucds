#!/usr/bin/env node
// What each demonstration account may reach, as the API resolves it: sign in
// as each and read /api/auth/me plus the unit listing. Run after
// seed-demo-accounts.js to confirm the accounts match their roles.
import 'dotenv/config';
import request from 'supertest';
import app from '../app.js';

const ACCOUNTS = [
  ['demo.records', process.env.DEMO_RECORDS_PASSWORD],
  ['demo.legal', process.env.DEMO_LEGAL_PASSWORD],
  ['demo.laboratory', process.env.DEMO_LABORATORY_PASSWORD],
  ['demo.planning', process.env.DEMO_PLANNING_PASSWORD],
  ['demo.encoder', process.env.DEMO_ENCODER_PASSWORD],
];

for (const [username, password] of ACCOUNTS) {
  const agent = request.agent(app);
  const login = await agent.post('/login').send({ username, password });
  if (login.status !== 200) {
    console.log(`${username}: sign-in failed (${login.status})`);
    continue;
  }
  const me = (await agent.get('/api/auth/me')).body;
  const units = await agent.get('/api/erms/units');
  const legalDocs = await agent.get('/api/erms/units/legal/documents');
  const labDocs = await agent.get('/api/erms/units/laboratory/documents');
  const records = await agent.get('/api/erms/records?pageSize=1');
  const dashboard = await agent.get('/api/erms/dashboard');
  console.log(`\n${username}  (${me.roleLabel}${me.ermsUnitLabel ? ` · ${me.ermsUnitLabel}` : ''})`);
  console.log(`  domains     ${me.domains.join(', ')}`);
  console.log(`  provinces   ${me.provinces.join(', ') || '—'}`);
  console.log(`  containers  ${me.storageContainers.map((c) => c.key).join(', ') || '—'}`);
  console.log(`  units       ${units.status === 200 ? units.body.units.map((u) => `${u.key}${u.canFile ? ' (files)' : ''}`).join(', ') : `refused (${units.status})`}`);
  console.log(`  records     ${records.status === 200 ? `${records.body.total} visible; provinces on dashboard: ${dashboard.body.byProvince?.map((p) => p._id).join(', ')}` : `refused (${records.status})`}`);
  console.log(`  legal docs  ${legalDocs.status === 200 ? `${legalDocs.body.total} visible` : `refused (${legalDocs.status} ${legalDocs.body.code || ''})`}`);
  console.log(`  lab docs    ${labDocs.status === 200 ? `${labDocs.body.total} visible` : `refused (${labDocs.status} ${labDocs.body.code || ''})`}`);
}
process.exit(0);
