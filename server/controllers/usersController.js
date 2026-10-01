const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');
const { connectToMongo, collections } = require('../config/db');
const mailer = require('../services/mailer');
const templates = require('../services/mailTemplates');
const { principalOf } = require('../middleware/auth');

// Ensure uploads directory exists (shared with server static mount)
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// POST /api/users/update
// Expects form-data with fields: username, photo (file)
async function updateUserAvatar(req, res) {
  try {
    await connectToMongo();
    const { username } = req.body;
    if (!username) {
      return res.status(400).json({ message: 'Username is required' });
    }

    const user = await collections.users.findOne({ username });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const filePath = `/uploads/${req.file.filename}`;

    await collections.users.updateOne(
      { username },
      { $set: { avatar: filePath } }
    );

    // Preserve legacy behavior: return user with updated avatar
    user.avatar = filePath;
    return res.status(200).json(user);
  } catch (error) {
    console.error('Error updating user avatar:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

// POST /api/newusers
// Expects form-data with fields: name, email, division, status, password, username, avatar (file)
async function createUser(req, res) {
  const { name, email, division, status, password, username } = req.body;
  const avatarPath = req.file ? `/uploads/${req.file.filename}` : null;

  if (!name || !email || !division || !status || !password || !username) {
    return res.status(400).json({
      error: 'Required fields: name, email, division, status, password, username',
    });
  }

  try {
    await connectToMongo();

    const existingUser = await collections.users.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    const existingUsername = await collections.users.findOne({ username });
    if (existingUsername) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = {
      name,
      username,
      email,
      password: hashedPassword,
      division,
      permission: 'viewer',
      status: status || 'offline',
      avatar: avatarPath,
      canAccessRangePicker: false,
      canGenerateData: false,
      canManageData: false,
      canViewAdminPanel: false,
      canViewDataHistory: false,
      designation: 'n/a',
      office: 'n/a',
      region: 'n/a',
    };

    const insertResult = await collections.users.insertOne(newUser);
    if (insertResult.acknowledged && insertResult.insertedId) {
      // The credentials go out from here, with the plaintext password the
      // administrator just generated. The browser used to send this through
      // EmailJS after the fact — and, being unconfigured, silently did not —
      // while still telling the administrator the email had gone. The response
      // now says whether it actually did, so the administrator can pass the
      // details on by hand if it did not.
      const emailSent = await mailer.send({
        to: email,
        ...templates.accountApproved({
          name,
          username,
          password,
          loginUrl: `${mailer.publicOrigin()}/e-universe/login`,
        }),
      });

      const { password: _hash, ...safeUser } = newUser;
      return res.status(201).json({ message: 'User created successfully', user: safeUser, emailSent });
    }

    return res.status(500).json({ error: 'Failed to create user' });
  } catch (error) {
    console.error('Error creating user:', error);
    return res.status(500).json({ error: 'Failed to create user' });
  }
}

const { ObjectId } = require('../config/db');

// Fields a client may never write through a profile/user update. `password` is
// the important one: clients receive user documents and send them back intact,
// so echoing a stale hash here would silently revert a password reset. Password
// changes go through the reset flow, which hashes properly.
const PROTECTED_USER_FIELDS = ['_id', 'password', 'resetToken', 'resetTokenExpiration'];
// Access is granted through its own routes (type, containers, years,
// capabilities, provinces), each with its own check. A details edit must not
// be a back door to any of them.
const ACCESS_FIELDS = [
  'permission', 'domains', 'capabilities', 'nasContainers', 'assignedYears', 'isDemo', 'ermsUnit',
  'canAccessRangePicker', 'canGenerateData', 'canManageData', 'canViewAdminPanel', 'canViewDataHistory',
  'aurora', 'bataan', 'bulacan', 'nuevaEcija', 'pampanga', 'tarlac', 'zambales',
];

// Never send credential material to a client. Applied to every user read so a
// hash cannot be round-tripped back into an update.
const PUBLIC_USER_PROJECTION = { password: 0, resetToken: 0, resetTokenExpiration: 0 };

function stripProtectedFields(payload) {
  const clean = { ...payload };
  for (const field of PROTECTED_USER_FIELDS) delete clean[field];
  return clean;
}

// PUT /api/users/:id — admin update (including avatar URL if sent)
async function updateUserById(req, res) {
  try {
    await connectToMongo();
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid user ID' });
    const { avatar } = req.body;
    const updatedUser = stripProtectedFields(req.body);
    delete updatedUser.avatar;
    for (const field of ACCESS_FIELDS) delete updatedUser[field];
    const updateOperation = { $set: updatedUser };
    if (avatar) updateOperation.$set.avatar = avatar;
    if (Object.keys(updateOperation.$set).length === 0) {
      return res.json({ message: 'Nothing to update' });
    }
    const result = await collections.users.updateOne({ _id: new ObjectId(id) }, updateOperation);
    if (result.matchedCount === 0) return res.status(404).json({ error: 'User not found' });
    return res.json({ message: 'User updated successfully' });
  } catch (error) {
    console.error('Error updating user:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}

/**
 * PUT /api/users/:id/type — set the account type. Developer only.
 *
 * The type decides which modules an account enters, so an explicit `domains`
 * override from an earlier scheme is cleared with it: the new type's defaults
 * apply, and the Access tab is where storage containers are designated.
 */
async function setUserType(req, res) {
  const { ASSIGNABLE_ROLES, ROLE_LABELS } = require('../services/authorization');
  try {
    await connectToMongo();
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid user ID' });
    const permission = String(req.body?.permission || '').trim().toLowerCase();
    if (!ASSIGNABLE_ROLES.includes(permission)) {
      return res.status(400).json({
        error: `Type must be one of: ${ASSIGNABLE_ROLES.map((r) => ROLE_LABELS[r]).join(', ')}.`,
      });
    }
    const actor = req.session?.user;
    if (actor && String(actor.userId) === String(id) && permission !== 'developer') {
      return res.status(400).json({ error: 'You cannot remove your own developer access.' });
    }
    const result = await collections.users.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: { permission, typeUpdatedAt: new Date(), typeUpdatedBy: actor?.username || 'unknown' },
        $unset: { domains: '' },
      }
    );
    if (result.matchedCount === 0) return res.status(404).json({ error: 'User not found' });
    return res.json({ message: 'Account type updated', permission, label: ROLE_LABELS[permission] });
  } catch (error) {
    console.error('Error setting user type:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}

/**
 * PUT /api/users/:id/erms-unit — the ERMS unit ("System") an account works
 * in: records, legal or laboratory. Developer only, like the type. The unit
 * decides which documents the person sees and which storage container holds
 * them; it applies on their next request.
 */
async function setUserErmsUnit(req, res) {
  const { ERMS_UNIT_VALUES, ERMS_UNIT_LABELS } = require('../services/authorization');
  try {
    await connectToMongo();
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid user ID' });
    const raw = req.body?.ermsUnit;
    const unit = raw === null || raw === '' ? null : String(raw).trim().toLowerCase();
    if (unit !== null && !ERMS_UNIT_VALUES.includes(unit)) {
      return res.status(400).json({ error: `System must be one of: ${ERMS_UNIT_VALUES.map((u) => ERMS_UNIT_LABELS[u]).join(', ')}.` });
    }
    const actor = req.session?.user;
    const result = await collections.users.updateOne(
      { _id: new ObjectId(id) },
      unit
        ? { $set: { ermsUnit: unit, ermsUnitUpdatedAt: new Date(), ermsUnitUpdatedBy: actor?.username || 'unknown' } }
        : { $unset: { ermsUnit: '' }, $set: { ermsUnitUpdatedAt: new Date(), ermsUnitUpdatedBy: actor?.username || 'unknown' } }
    );
    if (result.matchedCount === 0) return res.status(404).json({ error: 'User not found' });
    return res.json({ message: 'ERMS system updated', ermsUnit: unit, label: unit ? ERMS_UNIT_LABELS[unit] : null });
  } catch (error) {
    console.error('Error setting ERMS unit:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}

/**
 * DELETE /api/users/:id — remove an account and what belongs to it.
 *
 * Goes with the account: its sessions (so it is signed out everywhere at
 * once), its login-status row, its sign-up request, its storage PIN, and its
 * uploaded photo. Stays: the audit trail. app-logs and ucds-log entries record
 * what was done to the register and by whom; removing them would make the
 * register's history lie, and a deleted account is exactly the case an
 * auditor asks about. The entries keep the username as written.
 *
 * Developer only, never yourself, and never the last developer.
 */
async function deleteUser(req, res) {
  try {
    await connectToMongo();
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid user ID' });
    const actor = req.session?.user;
    if (actor && String(actor.userId) === String(id)) {
      return res.status(400).json({ error: 'You cannot delete your own account.' });
    }
    const user = await collections.users.findOne({ _id: new ObjectId(id) });
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (String(user.permission).toLowerCase() === 'developer') {
      const developers = await collections.users.countDocuments({ permission: 'developer' });
      if (developers <= 1) return res.status(400).json({ error: 'This is the last Developer account; it cannot be deleted.' });
    }

    const db = require('../config/db').getDb();
    const removed = {};
    removed.sessions = (await db.collection('sessions').deleteMany({ 'session.user.userId': String(user._id) })).deletedCount;
    removed.loginStatus = (await collections.loginStatus.deleteMany({ $or: [{ userId: user._id }, { username: user.username }] })).deletedCount;
    removed.signUp = user.email ? (await collections.signUp.deleteMany({ email: user.email })).deletedCount : 0;
    removed.storagePin = (await db.collection('app-config').deleteOne({ _id: `nas-pin:${user._id}` })).deletedCount;
    if (typeof user.avatar === 'string' && user.avatar.startsWith('/uploads/')) {
      const file = path.join(uploadsDir, path.basename(user.avatar));
      try {
        fs.unlinkSync(file);
        removed.photo = 1;
      } catch {
        removed.photo = 0;
      }
    }
    await collections.users.deleteOne({ _id: user._id });

    return res.json({ message: 'Account deleted', username: user.username, removed });
  } catch (error) {
    console.error('Error deleting user:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}

/** GET /api/users/types — the assignable types with their descriptions. */
function listUserTypes(req, res) {
  const { ASSIGNABLE_ROLES, ROLE_LABELS, ROLE_DESCRIPTIONS, ROLES, ERMS_UNIT_VALUES, ERMS_UNIT_LABELS } = require('../services/authorization');
  return res.json({
    types: ASSIGNABLE_ROLES.map((value) => ({ value, label: ROLE_LABELS[value], description: ROLE_DESCRIPTIONS[value] })),
    legacy: [{ value: ROLES.ADMIN, label: ROLE_LABELS[ROLES.ADMIN], description: ROLE_DESCRIPTIONS[ROLES.ADMIN] }],
    ermsUnits: ERMS_UNIT_VALUES.map((value) => ({ value, label: ERMS_UNIT_LABELS[value] })),
  });
}

// PUT /api/profile/update/:id — profile update (self)
// What a person may change about themselves. Everything else on the account
// — type, years, containers, capabilities, provinces, email — is an
// administrator's decision with its own route.
const SELF_EDITABLE_FIELDS = ['name', 'division', 'designation', 'office', 'region', 'empid', 'contactNumber', 'bio'];

async function updateProfile(req, res) {
  try {
    await connectToMongo();
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid user ID' });
    const me = principalOf(req);
    if (String(me?.userId) !== String(id)) return res.status(403).json({ error: 'You can only edit your own profile.' });
    const updatedUser = {};
    for (const field of SELF_EDITABLE_FIELDS) {
      if (req.body?.[field] !== undefined) updatedUser[field] = String(req.body[field]).slice(0, 200);
    }
    if (Object.keys(updatedUser).length === 0) {
      return res.json({ message: 'Nothing to update' });
    }
    const result = await collections.users.updateOne({ _id: new ObjectId(id) }, { $set: updatedUser });
    if (result.matchedCount === 0) return res.status(404).json({ error: 'User not found' });
    return res.json({ message: 'User updated successfully' });
  } catch (error) {
    console.error('Error updating user:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}

// PUT /api/status/:id — update sign-up request status
async function updateSignupStatus(req, res) {
  try {
    await connectToMongo();
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid user ID' });
    const { status } = req.body;
    const updateResult = await collections.signUp.updateOne({ _id: new ObjectId(id) }, { $set: { status } });
    if (updateResult.matchedCount === 0) return res.status(404).json({ error: 'User not found in sign-up collection' });
    return res.json({ message: 'Status updated successfully in sign-up collection' });
  } catch (error) {
    console.error('Error updating status:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}

/**
 * PUT /api/users/:id/years — the year containers an account may enter.
 * Developer or Administrator. Years must exist as containers; Developers and
 * Administrators enter every year regardless, so the list is kept but moot
 * for them.
 */
async function setUserYears(req, res) {
  try {
    await connectToMongo();
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid user ID' });
    const wanted = Array.isArray(req.body?.years) ? [...new Set(req.body.years.map(Number).filter(Number.isInteger))] : null;
    if (!wanted) return res.status(400).json({ error: 'Send { years: [2025, 2026] }' });
    const known = (await collections.yearContainers.find({}, { projection: { year: 1 } }).toArray()).map((y) => y.year);
    const unknown = wanted.filter((y) => !known.includes(y));
    if (unknown.length) return res.status(400).json({ error: `No year container for ${unknown.join(', ')}.` });
    const years = [...wanted].sort((a, b) => a - b);
    const result = await collections.users.updateOne({ _id: new ObjectId(id) }, { $set: { assignedYears: years } });
    if (result.matchedCount === 0) return res.status(404).json({ error: 'User not found' });
    return res.json({ assignedYears: years });
  } catch (error) {
    console.error('Error assigning years:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}

/**
 * PUT /api/profile/theme — the signed-in person's own look: light or dark,
 * the accent, the density, the tinted sider. Stored on the account so it
 * follows them to any device; the browser keeps a copy for the sign-in
 * pages, which have no account to ask yet.
 */
const THEME_MODES = new Set(['light', 'dark']);
const THEME_ACCENTS = new Set(['forest', 'ocean', 'slate', 'plum', 'ember', 'teal', 'indigo', 'crimson', 'amber', 'graphite', 'blue', 'green', 'purple', 'red', 'orange', 'gray', 'default']);
const THEME_DENSITIES = new Set(['comfortable', 'compact', 'relaxed']);

async function setMyTheme(req, res) {
  try {
    await connectToMongo();
    const me = principalOf(req);
    const t = req.body?.theme || req.body || {};
    const theme = {};
    if (THEME_MODES.has(t.mode)) theme.mode = t.mode;
    if (typeof t.accent === 'string' && /^[a-z][a-z0-9-]{1,30}$/.test(t.accent)) theme.accent = t.accent;
    if (THEME_DENSITIES.has(t.density)) theme.density = t.density;
    if (typeof t.tintedSider === 'boolean') theme.tintedSider = t.tintedSider;
    // The richer appearance (see front-end ThemeProvider): a custom accent,
    // the navigation style, corner radius and content surface.
    if (t.accentHex === null) theme.accentHex = null;
    else if (typeof t.accentHex === 'string' && /^#[0-9a-f]{6}$/i.test(t.accentHex)) theme.accentHex = t.accentHex.toLowerCase();
    if (['tinted', 'neutral', 'deep', 'vivid', 'graphite'].includes(t.navStyle)) theme.navStyle = t.navStyle;
    if (['sharp', 'rounded', 'round'].includes(t.radius)) theme.radius = t.radius;
    if (['plain', 'soft', 'warm', 'cool'].includes(t.surface)) theme.surface = t.surface;
    if (!Object.keys(theme).length) return res.status(400).json({ error: 'Nothing to save.' });
    const set = Object.fromEntries(Object.entries(theme).map(([k, v]) => [`preferences.theme.${k}`, v]));
    await collections.users.updateOne({ _id: new ObjectId(me.userId) }, { $set: set });
    const doc = await collections.users.findOne({ _id: new ObjectId(me.userId) }, { projection: { 'preferences.theme': 1 } });
    return res.json({ theme: doc?.preferences?.theme || theme });
  } catch (error) {
    console.error('Error saving theme:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
void THEME_ACCENTS;

module.exports = { updateUserAvatar, createUser, updateUserById, updateProfile, updateSignupStatus, setUserType, setUserErmsUnit, listUserTypes, deleteUser, setUserYears, setMyTheme };
 
// ---- Additional Users GET endpoints migrated from server.js ----
async function getUsers(req, res) {
  try {
    await connectToMongo();
    const { username } = req.query;
    const query = username ? { username } : {};
    const users = await collections.users.find(query, { projection: PUBLIC_USER_PROJECTION }).toArray();
    if (username && users.length === 0) return res.status(404).json({ message: 'User  not found' });
    return res.json(users);
  } catch (error) {
    console.error('Error fetching user data:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}

async function getUserDetails(req, res) {
  const { username } = req.query;
  if (!username) return res.status(400).json({ message: 'Username is required' });
  try {
    await connectToMongo();
    const user = await collections.users.findOne({ username }, { projection: PUBLIC_USER_PROJECTION });
    if (!user) return res.status(404).json({ message: 'User not found' });
    return res.json(user);
  } catch (error) {
    console.error('Error retrieving user details:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}

async function getLoginStatus(req, res) {
  try {
    await connectToMongo();
    const loginStatuses = await collections.loginStatus.find({}).toArray();
    return res.json(loginStatuses);
  } catch (error) {
    console.error('Error fetching login statuses:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}

async function getSignUps(req, res) {
  try {
    await connectToMongo();
    const users = await collections.signUp.find().toArray();
    return res.json(users);
  } catch (error) {
    console.error('Error fetching user data:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}

async function getUserAvatar(req, res) {
  try {
    await connectToMongo();
    const name = req.query.name;
    if (!name) return res.status(400).json({ error: 'Name parameter is required' });
    const user = await collections.users.findOne({ username: name });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const avatar = user.avatar;
    if (avatar) return res.json({ avatar });
    return res.status(404).json({ error: 'Avatar not found' });
  } catch (error) {
    console.error('Error fetching user avatar:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}

function generatePassword(req, res) {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let password = '';
  for (let i = 0; i < 8; i++) password += charset[Math.floor(Math.random() * charset.length)];
  return res.json({ password });
}

module.exports.getUsers = getUsers;
module.exports.getUserDetails = getUserDetails;
module.exports.getLoginStatus = getLoginStatus;
module.exports.getSignUps = getSignUps;
module.exports.getUserAvatar = getUserAvatar;
module.exports.generatePassword = generatePassword;

// Current user info and online users migrated from server.js
async function getCurrentUser(req, res) {
  try {
    const sessionUser = req.session && req.session.user ? req.session.user : null;
    const sourceUser = sessionUser || req.user; // fallback if any
    if (!sourceUser || !sourceUser.userId) return res.status(401).send({ message: 'User not authenticated' });
    await connectToMongo();
    const user = await collections.users.findOne({ _id: new (require('../config/db').ObjectId)(sourceUser.userId) });
    if (!user) return res.status(404).send({ message: 'User not found' });
    return res.json({ _id: user._id, name: user.name, username: user.username, email: user.email, division: user.division, permission: user.permission, status: user.status, avatar: user.avatar });
  } catch (error) {
    console.error('Error fetching user:', error);
    return res.status(500).send({ message: 'Error fetching user data' });
  }
}

async function getOnlineUsers(req, res) {
  try {
    await connectToMongo();
    const onlineUsers = await collections.loginStatus.find().toArray();
    const formattedOnlineUsers = await Promise.all(
      onlineUsers.map(async (user) => {
        const userDoc = await collections.users.findOne({ name: user.name });
        const avatar = userDoc ? userDoc.avatar : null;
        return { userId: user.userId, userName: user.userName, name: user.name, isLoggedIn: user.isLoggedIn, loginTime: user.loginTime, logoutTime: user.logoutTime, avatar };
      })
    );
    return res.status(200).json({ onlineUsers: formattedOnlineUsers });
  } catch (error) {
    console.error('Error fetching online users:', error);
    return res.status(500).json({ error: 'An error occurred while fetching online users.' });
  }
}

module.exports.getCurrentUser = getCurrentUser;
module.exports.getOnlineUsers = getOnlineUsers;

// ---- Additional Users endpoints migrated from server.js ----
async function updateUserPermissionsByEmail(req, res) {
  const { email } = req.params;
  const { canViewAdminPanel, canViewDataHistory, canManageData, canGenerateData, canAccessRangePicker } = req.body || {};
  try {
    await connectToMongo();
    const user = await collections.users.findOne({ email });
    if (!user) return res.status(404).json({ message: 'User  not found' });
    const result = await collections.users.updateOne(
      { email },
      { $set: { canViewAdminPanel, canViewDataHistory, canManageData, canGenerateData, canAccessRangePicker } }
    );
    if (result.modifiedCount === 0) return res.status(204).send();
    return res.status(200).json({ message: 'User  permissions updated successfully' });
  } catch (error) {
    console.error('Error updating user permissions:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}

async function updateProvincePermissionsByEmail(req, res) {
  const { email } = req.params;
  const provincePermissions = req.body || {};
  try {
    await connectToMongo();
    const user = await collections.users.findOne({ email });
    if (!user) return res.status(404).json({ message: 'User  not found' });
    const result = await collections.users.updateOne({ email }, { $set: provincePermissions });
    if (result.modifiedCount === 0) return res.status(204).json({ message: 'No changes applied.' });
    return res.status(200).json({ message: 'Province permissions updated successfully.' });
  } catch (error) {
    console.error('Error updating province permissions:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}

async function removeSignUpUser(req, res) {
  const { id } = req.params;
  const { ObjectId } = require('../config/db');
  try {
    await connectToMongo();
    const result = await collections.signUp.deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 1) return res.status(200).send({ message: 'User removed successfully' });
    return res.status(404).send({ message: 'User not found' });
  } catch (error) {
    console.error('Error removing user:', error);
    return res.status(500).send({ message: 'Internal server error' });
  }
}

async function getRecentActivity(req, res) {
  try {
    if (!req.session || !req.session.user || !req.session.user.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    await connectToMongo();
    const { ObjectId } = require('../config/db');
    const userId = req.session.user.userId;
    const recentActivity = await collections.ucds
      .find({ userId: new ObjectId(userId) })
      .sort({ timestamp: -1 })
      .limit(5)
      .toArray();
    return res.json(recentActivity);
  } catch (error) {
    console.error('Error fetching recent activity:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}

module.exports.updateUserPermissionsByEmail = updateUserPermissionsByEmail;
module.exports.updateProvincePermissionsByEmail = updateProvincePermissionsByEmail;
module.exports.removeSignUpUser = removeSignUpUser;
module.exports.getRecentActivity = getRecentActivity;
