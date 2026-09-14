const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { ObjectId } = require('../config/db');
const { connectToMongo } = require('../config/db');
const mailer = require('../services/mailer');
const templates = require('../services/mailTemplates');
const {
  roleOf,
  ROLE_LABELS,
  domainsOf,
  capabilitiesOf,
  authorizedYears,
} = require('../services/authorization');
const storageAccess = require('../services/storageAccess');
const { userProvinceAccess, userProvinceKeys } = require('../services/provinces');

/**
 * The session principal.
 *
 * Carries the resolved entitlement rather than the raw document, so every
 * downstream check reads the same answer. The per-province values are stored
 * normalised ('none' | 'view' | 'readWrite') because the collection holds a
 * mix of booleans and strings, and authorizedProvinces() reads them straight
 * off this object.
 */
function buildSessionPayload(user) {
  const capabilities = capabilitiesOf(user);
  const provinceAccess = userProvinceAccess(user);

  return {
    userId: user._id.toString(),
    name: user.name,
    username: user.username,
    division: user.division,
    permission: user.permission,
    role: roleOf(user),
    domains: domainsOf(user),
    capabilities,
    provinceAccess,
    assignedYears: Array.isArray(user.assignedYears) ? user.assignedYears.map(Number) : [],
    avatar: user.avatar,

    // Legacy flat fields. Existing consumers (checkAuth, authorizedProvinces)
    // still read these; they are kept in step with the structured values above
    // rather than duplicated by hand.
    ...capabilities,
    ...provinceAccess,
  };
}

async function register(req, res) {
  const { name, division, position, email } = req.body;
  if (!name || !division || !position || !email) {
    return res.status(400).json({ error: 'Name, division/section, position, and email are required' });
  }
  try {
    const { collections } = await connectToMongo();
    const existingUser = await collections.signUp.findOne({ email });
    if (existingUser) return res.status(400).json({ error: 'Email already exists' });

    const result = await collections.signUp.insertOne({
      name,
      division,
      position,
      email,
      status: 'pending',
      requestedAt: new Date(),
    });

    // The request is recorded whether or not the mail goes out: an SMTP
    // problem should not turn away a registrant, and the request is still
    // visible under Sign-up Requests. Both sends run together and neither is
    // awaited before answering.
    const origin = mailer.publicOrigin();
    const notifyAdmin = mailer.send({
      to: mailer.adminAddress(),
      ...templates.registrationReceived({
        name,
        division,
        position,
        email,
        reviewUrl: `${origin}/universe/admin/users`,
      }),
    });
    const acknowledge = mailer.send({ to: email, ...templates.registrationAcknowledged({ name }) });
    Promise.all([notifyAdmin, acknowledge]).catch(() => {});

    return res.status(201).json({ status: 'User registration submitted for approval', userId: result.insertedId });
  } catch (error) {
    console.error('Error during registration:', error.message);
    return res.status(500).json({ error: 'An error occurred during registration' });
  }
}

async function login(req, res) {
  const login = String(req.body?.username || '').trim();
  const { password } = req.body || {};
  if (!login || !password) return res.status(400).json({ error: 'Username and password are required.' });
  try {
    const { collections } = await connectToMongo();
    // Either the username or the email address on the account, matched
    // case-insensitively: "ASabalbosa" and "Name@Gmail.com" both sign in.
    // Both fields are unique regardless of case, so this cannot pick the
    // wrong account. Password recovery is addressed by email, and people then
    // try to sign in with it; refusing that was the commonest "my new
    // password does not work".
    const user = await collections.users.findOne(
      { $or: [{ username: login }, { email: login }] },
      { collation: { locale: 'en', strength: 2 } }
    );
    if (!user) return res.status(401).json({ error: 'Invalid username or password.' });

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) return res.status(401).json({ error: 'Invalid username or password.' });

    req.session.user = buildSessionPayload(user);
    // A fresh sign-in always starts at the year container picker.
    delete req.session.activeYear;

    await collections.loginStatus.updateOne(
      { userId: user._id },
      { $set: {
          isLoggedIn: true,
          loginTime: new Date(),
          name: user.name,
          username: user.username,
          division: user.division,
          permission: user.permission,
        },
      },
      { upsert: true }
    );

    await collections.users.updateOne({ _id: user._id }, { $set: { status: 'online' } });

    return res.status(200).json({ status: 'success', ...buildSessionPayload(user) });
  } catch (error) {
    console.error('Error during login:', error);
    return res.status(500).json({ error: 'An unexpected error occurred.' });
  }
}

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

/**
 * Account recovery, step one: email a single-use link.
 *
 * The answer is the same whether or not the address is on file. It used to be
 * 404 "User not found", which let anyone with the public form check which
 * addresses have accounts. It also used to return the reset link — and so the
 * token — in the JSON body, which made the email step optional for anyone who
 * could type an address into the form.
 */
async function requestPasswordReset(req, res) {
  const email = String(req.body?.email || '').trim();
  if (!email) return res.status(400).json({ error: 'Email is required.' });

  const accepted = () =>
    res.status(200).json({
      status: 'success',
      message: 'If that address is registered, a reset link has been sent to it.',
    });

  try {
    const { collections } = await connectToMongo();
    const user = await collections.users.findOne({ email });
    if (!user) return accepted();

    if (!mailer.isConfigured()) {
      return res.status(503).json({
        error: 'Email is not configured on the server, so a reset link cannot be sent. Contact your system administrator.',
      });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    await collections.users.updateOne(
      { _id: user._id },
      { $set: { resetToken, resetTokenExpiration: Date.now() + RESET_TOKEN_TTL_MS } }
    );

    const resetLink = `${mailer.publicOrigin()}/universe-central-database-system/reset-password?token=${resetToken}`;
    await mailer.send({
      to: user.email,
      ...templates.passwordReset({
        name: user.name,
        username: user.username,
        resetLink,
        minutes: RESET_TOKEN_TTL_MS / 60000,
      }),
      throwOnError: true,
    });

    return accepted();
  } catch (error) {
    console.error('Error during password reset request:', error.message);
    if (error.code === 'MAIL_SEND_FAILED' || error.code === 'MAIL_NOT_CONFIGURED') {
      return res.status(502).json({ error: 'The reset email could not be sent. Please try again later.' });
    }
    return res.status(500).json({ error: 'An error occurred.' });
  }
}

async function resetPassword(req, res) {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) return res.status(400).json({ error: 'Token and new password are required.' });
  try {
    const { collections } = await connectToMongo();
    const user = await collections.users.findOne({ resetToken: token, resetTokenExpiration: { $gt: Date.now() } });
    if (!user) return res.status(400).json({ error: 'Invalid or expired token.' });

    if (String(newPassword).length < 8) {
      return res.status(400).json({ error: 'The new password must be at least 8 characters.' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await collections.users.updateOne(
      { _id: user._id },
      { $set: { password: hashedPassword }, $unset: { resetToken: '', resetTokenExpiration: '' } }
    );

    // A courtesy notice, so a reset the owner did not make is noticed. Not
    // awaited: the password is already changed and the response should say so.
    if (user.email) {
      mailer
        .send({ to: user.email, ...templates.passwordChanged({ name: user.name }) })
        .catch(() => {});
    }

    // The username goes back so the sign-in page can be prefilled with it.
    // The reset was addressed by email, and people who reset a password have
    // often forgotten which account it belongs to.
    return res.status(200).json({ message: 'Password reset successful.', username: user.username });
  } catch (error) {
    console.error('Error during password reset:', error);
    return res.status(500).json({ error: 'An error occurred during password reset.' });
  }
}

function authCheck(req, res) {
  if (req.session && req.session.user) return res.status(200).json({ isAuthenticated: true });
  return res.status(401).json({ isAuthenticated: false });
}

function checkAuth(req, res) {
  if (!(req.session && req.session.user)) {
    return res.status(401).json({ message: 'User not authenticated' });
  }
  const u = req.session.user;
  res.status(200).json({
    status: 'Success',
    userId: u.userId,
    name: u.name,
    username: u.username,
    division: u.division,
    permission: u.permission,
    role: u.role || roleOf(u),
    assignedYears: u.assignedYears || [],
    activeYear: req.session.activeYear || null,
    avatar: u.avatar,
    canGenerateData: u.canGenerateData,
    canManageData: u.canManageData,
    canViewAdminPanel: u.canViewAdminPanel,
    canViewDataHistory: u.canViewDataHistory,
    canAccessRangePicker: u.canAccessRangePicker,
    aurora: u.aurora,
    bataan: u.bataan,
    bulacan: u.bulacan,
    nuevaEcija: u.nuevaEcija,
    pampanga: u.pampanga,
    tarlac: u.tarlac,
    zambales: u.zambales,
  });
}

/**
 * The one place a client learns what it may do.
 *
 * Replaces the positional boolean array the sidebar used to build by hand,
 * where permissions[2] meant "admin panel" and permissions[i+5] meant
 * "province i". Everything here is advisory: the API enforces the same rules
 * again on every request.
 */
async function me(req, res) {
  if (!(req.session && req.session.user)) {
    return res.status(401).json({ message: 'User not authenticated' });
  }

  const u = req.session.user;
  try {
    return res.status(200).json({
      status: 'Success',
      user: {
        userId: u.userId,
        name: u.name,
        username: u.username,
        email: u.email,
        division: u.division,
        avatar: u.avatar,
      },
      role: u.role || roleOf(u),
      roleLabel: ROLE_LABELS[u.role || roleOf(u)],
      permission: u.permission,
      domains: domainsOf(u),
      capabilities: capabilitiesOf(u),
      // Storage containers the Developer has shared with this account, by key
      // and label. Read from the account now, so a designation made a moment
      // ago is already here.
      storageContainers: await storageAccess.grantedContainers(u),
      provinceAccess: userProvinceAccess(u),
      provinces: userProvinceKeys(u),
      assignedYears: u.assignedYears || [],
      authorizedYears: await authorizedYears(u),
      activeYear: req.session.activeYear || null,
    });
  } catch (error) {
    console.error('Error building /api/auth/me:', error);
    return res.status(500).json({ message: 'Failed to resolve current user' });
  }
}

async function logout(req, res) {
  if (!req.session.user) return res.status(401).json({ message: 'You are not logged in' });
  const userId = req.session.user.userId;
  try {
    const { collections } = await connectToMongo();
    const logoutTime = new Date();
    await collections.loginStatus.updateOne(
      { userId: new ObjectId(userId) },
      { $set: { isLoggedIn: false, logoutTime } }
    );
    req.session.destroy((err) => {
      if (err) return res.status(500).json({ message: 'Failed to destroy session' });
      res.clearCookie('connect.sid');
      res.status(200).json({ message: 'Logout successful' });
    });
  } catch (error) {
    console.error('Error during logout:', error);
    res.status(500).json({ message: 'An unexpected error occurred.' });
  }
}

async function currentUserAvatar(req, res) {
  try {
    const userId = req.session?.user?.userId;
    if (!userId) return res.status(401).send({ message: 'Unauthorized' });
    const { collections } = await connectToMongo();
    const user = await collections.users.findOne({ _id: new ObjectId(userId) });
    if (!user) return res.status(404).send({ message: 'User not found' });
    res.json({ avatar: user.avatar, name: user.name });
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: 'Internal Server Error' });
  }
}

function protectedSample(req, res) {
  res.json({ message: 'This is a protected route!' });
}

module.exports = {
  register,
  login,
  requestPasswordReset,
  resetPassword,
  authCheck,
  checkAuth,
  me,
  logout,
  currentUserAvatar,
  protectedSample,
};
