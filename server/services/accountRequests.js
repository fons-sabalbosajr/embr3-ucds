const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { connectToMongo, collections, ObjectId } = require('../config/db');
const mailer = require('./mailer');
const templates = require('./mailTemplates');
const { ROLES, ROLE_LABELS, ASSIGNABLE_ROLES, ERMS_UNIT_VALUES, ERMS_UNIT_LABELS } = require('./authorization');
const { PROVINCE_KEYS } = require('./provinces');
const { badRequest, conflict, notFoundError } = require('../shared/middleware/errorHandler');

// ---------------------------------------------------------------------------
// Account requests: the only way into E-Universe.
//
//   1. Someone asks on the public Request Access page, saying which system
//      they need — UCDS (the planning register) or ERMS, and for ERMS which
//      unit. The request is recorded `pending`; the Developers are mailed,
//      and the person gets an acknowledgement.
//   2. A Developer approves it — choosing the account type, the ERMS unit,
//      the year containers and provinces — or turns it down with a reason.
//      Approving creates the account with a generated password and mails the
//      person their sign-in details; turning down mails them the reason.
//
// Only a Developer decides. A request is claimed before the account is made
// (pending -> approving), so two Developers approving at once cannot make
// two accounts; a failure part-way puts it back to pending.
// ---------------------------------------------------------------------------

/** What a person may ask for on the Request Access page. */
const SYSTEMS = {
  ucds: 'UCDS — Universe Central DB',
  erms: 'ERMS — Records Management',
};

/** In words, for the mail and the screens: "ERMS — Legal Services Unit". */
function describeAccess({ system, ermsUnit, permission } = {}) {
  if (permission) {
    if (permission === ROLES.RECORDS) return `ERMS — ${ERMS_UNIT_LABELS[ermsUnit] || ERMS_UNIT_LABELS.records}`;
    return `${ROLE_LABELS[permission] || permission}${permission === ROLES.DEVELOPER ? '' : ' (UCDS)'}`;
  }
  if (system === 'erms') return `ERMS — ${ERMS_UNIT_LABELS[ermsUnit] || 'unit not given'}`;
  if (system === 'ucds') return SYSTEMS.ucds;
  return 'Not stated';
}

/** Where a new request is announced: every Developer, and ADMIN_NOTIFY_EMAIL when set. */
async function developerAddresses() {
  await connectToMongo();
  const rows = await collections.users
    .find({ permission: ROLES.DEVELOPER, email: { $nin: [null, ''] } }, { projection: { email: 1 } })
    .toArray();
  const list = [...rows.map((r) => r.email), process.env.ADMIN_NOTIFY_EMAIL].filter(Boolean).map((e) => String(e).trim().toLowerCase());
  const unique = [...new Set(list)];
  return unique.length ? unique : [mailer.adminAddress()].filter(Boolean);
}

/** A temporary password: 14 characters, no look-alikes, a digit and a symbol. */
function temporaryPassword() {
  const set = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const body = Array.from(crypto.randomBytes(12), (b) => set[b % set.length]).join('');
  return `${body}${'!@#$%&*?'[crypto.randomInt(8)]}${crypto.randomInt(10)}`;
}

const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,39}$/i;
const caseless = { collation: { locale: 'en', strength: 2 } };

/** "Juan D. dela Cruz" -> "jdelacruz": the first initial and the surname. */
function suggestUsername(name) {
  const parts = String(name || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z\s-]/g, ' ').split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  // "dela Cruz", "de los Santos": the particles go with the surname.
  const particles = new Set(['de', 'dela', 'del', 'los', 'la', 'san', 'sta', 'santa', 'van', 'von']);
  let i = parts.length - 1;
  while (i > 1 && particles.has(parts[i - 1])) i -= 1;
  return `${parts[0][0]}${parts.slice(i).join('')}`.replace(/[^a-z0-9]/g, '').slice(0, 40);
}

/** A free username: the suggestion, or the suggestion with the lowest number free. */
async function freeUsername(base) {
  const root = String(base || '').toLowerCase().slice(0, 36) || 'user';
  for (let n = 0; n < 100; n += 1) {
    const candidate = n ? `${root}${n + 1}` : root;
    if (!(await collections.users.findOne({ username: candidate }, { ...caseless, projection: { _id: 1 } }))) return candidate;
  }
  return `${root}${crypto.randomInt(1000, 9999)}`;
}

/** The requests, newest first; `status` narrows them (pending, approved, rejected). */
async function list({ status } = {}) {
  await connectToMongo();
  const filter = status ? { status } : {};
  const rows = await collections.signUp.find(filter).sort({ requestedAt: -1, _id: -1 }).toArray();
  return Promise.all(
    rows.map(async (r) => ({
      ...r,
      accessLabel: describeAccess(r),
      suggestedUsername: r.status === 'pending' ? await freeUsername(suggestUsername(r.name)) : undefined,
    }))
  );
}

/**
 * Approve a request and make the account.
 *
 * `input`: { username, permission, ermsUnit, assignedYears, provinces, name,
 * email, division, designation }. Everything the Developer leaves out falls
 * back to the request.
 */
async function approve(id, input, actor) {
  await connectToMongo();
  if (!ObjectId.isValid(String(id))) throw badRequest('Invalid request id.');
  const _id = new ObjectId(String(id));
  const request = await collections.signUp.findOne({ _id });
  if (!request) throw notFoundError('That request is no longer there.', 'REQUEST_NOT_FOUND');
  if (request.status !== 'pending') throw conflict(`This request was already ${request.status}.`, 'REQUEST_DECIDED');

  const permission = String(input.permission || '').trim().toLowerCase();
  if (!ASSIGNABLE_ROLES.includes(permission)) {
    throw badRequest(`Choose the account type: ${ASSIGNABLE_ROLES.map((r) => ROLE_LABELS[r]).join(', ')}.`, 'TYPE_REQUIRED');
  }
  const ermsUnit = permission === ROLES.RECORDS ? String(input.ermsUnit || request.ermsUnit || '').trim().toLowerCase() : null;
  if (permission === ROLES.RECORDS && !ERMS_UNIT_VALUES.includes(ermsUnit)) {
    throw badRequest('Choose the ERMS unit the person works in.', 'UNIT_REQUIRED');
  }

  const name = String(input.name ?? request.name ?? '').trim().slice(0, 120);
  const email = String(input.email ?? request.email ?? '').trim().toLowerCase().slice(0, 160);
  const division = String(input.division ?? request.division ?? '').trim().slice(0, 120);
  const designation = String(input.designation ?? request.position ?? '').trim().slice(0, 120);
  if (!name) throw badRequest('The name is required.', 'NAME_REQUIRED');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw badRequest('Enter a valid email address.', 'EMAIL_INVALID');

  const username = String(input.username || '').trim();
  if (!USERNAME_RE.test(username)) {
    throw badRequest('The username is 3 to 40 letters, digits, dots, dashes or underscores, starting with a letter or digit.', 'USERNAME_INVALID');
  }
  const [takenName, takenEmail] = await Promise.all([
    collections.users.findOne({ username }, { ...caseless, projection: { _id: 1 } }),
    collections.users.findOne({ email }, { ...caseless, projection: { _id: 1 } }),
  ]);
  if (takenName) throw conflict(`The username ${username} is taken. Try ${await freeUsername(username)}.`, 'USERNAME_TAKEN');
  if (takenEmail) throw conflict(`${email} already has an account.`, 'EMAIL_TAKEN');

  // Year containers: for UCDS accounts; must exist. Developers hold every year anyway.
  const years = [...new Set((Array.isArray(input.assignedYears) ? input.assignedYears : []).map(Number).filter(Number.isInteger))].sort((a, b) => a - b);
  if (years.length) {
    const known = (await collections.yearContainers.find({}, { projection: { year: 1 } }).toArray()).map((y) => y.year);
    const unknown = years.filter((y) => !known.includes(y));
    if (unknown.length) throw badRequest(`No year container for ${unknown.join(', ')}.`, 'YEAR_UNKNOWN');
  }
  if ([ROLES.PLANNING, ROLES.VIEWER].includes(permission) && !years.length) {
    throw badRequest('Choose at least one year container for a UCDS account.', 'YEARS_REQUIRED');
  }

  // Provinces: the ones chosen read and write; the rest none.
  const chosen = new Set((Array.isArray(input.provinces) ? input.provinces : []).filter((p) => PROVINCE_KEYS.includes(p)));
  if (permission !== ROLES.DEVELOPER && !chosen.size) throw badRequest('Choose the provinces the person works on.', 'PROVINCES_REQUIRED');
  const provinces = Object.fromEntries(PROVINCE_KEYS.map((k) => [k, permission === ROLES.DEVELOPER || chosen.has(k) ? 'readWrite' : 'none']));

  // Claim the request: a second approval of the same request stops here.
  const claimed = await collections.signUp.findOneAndUpdate({ _id, status: 'pending' }, { $set: { status: 'approving' } });
  if (!(claimed?.value ?? claimed)) throw conflict('Someone else is deciding this request.', 'REQUEST_DECIDED');

  const password = temporaryPassword();
  const now = new Date();
  const user = {
    name,
    username,
    email,
    division,
    designation: designation || 'n/a',
    office: 'EMB Region III',
    region: 'III',
    password: await bcrypt.hash(password, 10),
    permission,
    ...(ermsUnit ? { ermsUnit } : {}),
    assignedYears: years,
    ...provinces,
    // An ERMS User holds their unit's storage container (authorization.nasContainersOf);
    // anyone else's containers are designated later, on the Access tab.
    nasContainers: ermsUnit ? [ermsUnit] : [],
    status: 'offline',
    avatar: null,
    // A starting point the Developer adjusts on the Access tab: a Planning
    // Admin edits and reads the history, an Encoder edits.
    canAccessRangePicker: false,
    canGenerateData: false,
    canManageData: [ROLES.PLANNING, ROLES.VIEWER].includes(permission),
    canViewAdminPanel: false,
    canViewDataHistory: permission === ROLES.PLANNING,
    createdAt: now,
    createdBy: actor?.username || 'unknown',
    approvedFrom: _id,
  };

  let inserted;
  try {
    inserted = await collections.users.insertOne(user);
  } catch (err) {
    await collections.signUp.updateOne({ _id, status: 'approving' }, { $set: { status: 'pending' } });
    throw err;
  }
  await collections.signUp.updateOne(
    { _id },
    { $set: { status: 'approved', decidedAt: now, decidedBy: actor?.username || 'unknown', userId: inserted.insertedId, username, accessLabel: describeAccess(user) } }
  );

  const emailSent = await mailer.send({
    to: email,
    ...templates.accountApproved({
      name,
      username,
      password,
      access: describeAccess(user),
      loginUrl: `${mailer.publicOrigin()}/e-universe/login`,
    }),
  });

  const { password: _hash, ...safe } = user;
  return {
    user: { ...safe, _id: inserted.insertedId },
    emailSent,
    // The Developer sees the password only when the mail did not go, to pass it on by hand.
    temporaryPassword: emailSent ? undefined : password,
  };
}

/** Turn a request down, with the reason the person is told. */
async function reject(id, { reason } = {}, actor) {
  await connectToMongo();
  if (!ObjectId.isValid(String(id))) throw badRequest('Invalid request id.');
  const _id = new ObjectId(String(id));
  const why = String(reason || '').replace(/<[^>]*>/g, '').trim().slice(0, 500);
  const now = new Date();
  const res = await collections.signUp.findOneAndUpdate(
    { _id, status: 'pending' },
    { $set: { status: 'rejected', decidedAt: now, decidedBy: actor?.username || 'unknown', reason: why || null } },
    { returnDocument: 'after' }
  );
  const request = res?.value ?? res;
  if (!request) {
    const existing = await collections.signUp.findOne({ _id });
    if (!existing) throw notFoundError('That request is no longer there.', 'REQUEST_NOT_FOUND');
    throw conflict(`This request was already ${existing.status}.`, 'REQUEST_DECIDED');
  }
  const emailSent = await mailer.send({ to: request.email, ...templates.registrationRejected({ name: request.name, reason: why }) });
  return { request, emailSent };
}

module.exports = { SYSTEMS, describeAccess, developerAddresses, temporaryPassword, suggestUsername, freeUsername, list, approve, reject };
