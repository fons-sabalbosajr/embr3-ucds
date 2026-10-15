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
  canAccessAllYears,
  ermsUnitOf,
  ermsUnitsOf,
  isErmsEndUser,
  ERMS_UNIT_LABELS,
} = require('../services/authorization');
const storageAccess = require('../services/storageAccess');
const signInHistory = require('../services/signInHistory');
const presence = require('../services/presence');
const { userProvinceAccess, userProvinceKeys } = require('../services/provinces');
const { tokenFor, beginFreshSession, COOKIE_NAME } = require('../middleware/sessionToken');

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
    // The ERMS unit ("System") this account works in; see authorization.js.
    ermsUnit: ermsUnitOf(user),

    // Legacy flat fields. Existing consumers (checkAuth, authorizedProvinces)
    // still read these; they are kept in step with the structured values above
    // rather than duplicated by hand.
    ...capabilities,
    ...provinceAccess,
  };
}

// A request-access field: trimmed, tags stripped, bounded. The values are
// shown to an administrator and mailed back, so nothing markup-like gets in.
const cleanField = (v, max) => String(v ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

async function register(req, res) {
  const name = cleanField(req.body?.name, 120);
  const division = cleanField(req.body?.division, 120);
  const position = cleanField(req.body?.position, 120);
  const email = cleanField(req.body?.email, 160).toLowerCase();
  if (!name || !division || !position || !email) {
    return res.status(400).json({ error: 'Name, division/section, position, and email are required' });
  }
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  try {
    const { collections } = await connectToMongo();
    // One request per address, and none for an address that already has an
    // account — but the answer is the same either way, so the form cannot be
    // used to find out which addresses are registered.
    const [pending, existingAccount] = await Promise.all([
      collections.signUp.findOne({ email, status: 'pending' }),
      collections.users.findOne({ email }, { collation: { locale: 'en', strength: 2 }, projection: { _id: 1 } }),
    ]);
    if (pending || existingAccount) {
      return res.status(201).json({ status: 'User registration submitted for approval' });
    }

    const result = await collections.signUp.insertOne({
      name,
      division,
      position,
      email,
      status: 'pending',
      requestedAt: new Date(),
      requestedFrom: req.ip || null,
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
        reviewUrl: `${origin}/e-universe/admin/users`,
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

    // A new session for this sign-in. The one the request arrived with may be
    // another tab's (tabs share the cookie) and is left as it is.
    beginFreshSession(req);
    req.session.user = buildSessionPayload(user);
    // A fresh sign-in starts at the year container picker — except for the
    // Developer and Administrator, who hold every year, and for ERMS Users,
    // whose work is not year-scoped at all: they land in the current year
    // (or the latest open one) and never see the picker.
    delete req.session.activeYear;
    if (canAccessAllYears(user) || isErmsEndUser(user)) {
      const yearService = require('../services/yearService');
      let candidates = (await authorizedYears(user)).filter(Boolean).sort((a, b) => b - a);
      // An ERMS User with no year assigned still needs one in the session for
      // the register they may read alongside; any open container will do.
      if (!candidates.length && isErmsEndUser(user)) {
        candidates = (await yearService.listYears()).filter((y) => y.hidden !== true).map((y) => y.year).sort((a, b) => b - a);
      }
      const thisYear = new Date().getFullYear();
      const ordered = [thisYear, ...candidates.filter((y) => y !== thisYear)];
      for (const y of ordered) {
        if (candidates.includes(y) && (await yearService.isSelectableYear(y))) {
          req.session.activeYear = y;
          break;
        }
      }
    }

    // The three records of a sign-in are independent: written together, not
    // one after another, so a person waits for the slowest rather than the sum.
    await Promise.all([
      collections.loginStatus.updateOne(
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
      ),
      collections.users.updateOne({ _id: user._id }, { $set: { status: 'online' } }),
      signInHistory.record(req, user, 'sign-in'),
    ]);
    // Everyone's "who is online" list updates now, not at its next poll.
    presence.changed({ username: user.username, name: user.name, online: true });

    return res.status(200).json({
      status: 'success',
      ...buildSessionPayload(user),
      activeYear: req.session.activeYear || null,
      theme: user.preferences?.theme || null,
      // This tab's own reference to the session it just opened.
      sessionToken: tokenFor(req),
    });
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

    const resetLink = `${mailer.publicOrigin()}/e-universe/reset-password?token=${resetToken}`;
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

  try {
    const { collections } = await connectToMongo();
    // The session carries a snapshot of the account taken at sign-in. This
    // is called on every load of the application, so it is where a change
    // an administrator made since — a province granted, a capability, the
    // unit — is brought into the session, rather than waiting for the next
    // sign-in. An account that no longer exists ends the session.
    //
    // Read once, and used for everything below (the unit, the theme): this
    // was three reads of the same document per call. The session is replaced
    // only when the account actually changed — assigning it every time made
    // express-session write the session back on every load as well.
    let account = null;
    if (req.session.user.userId && ObjectId.isValid(String(req.session.user.userId))) {
      account = await collections.users.findOne({ _id: new ObjectId(String(req.session.user.userId)) });
      if (!account) {
        req.session.destroy(() => {});
        return res.status(401).json({ message: 'User not authenticated' });
      }
      const fresh = buildSessionPayload(account);
      if (JSON.stringify(fresh) !== JSON.stringify(req.session.user)) req.session.user = fresh;
    }
    const u = req.session.user;
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
      // So a tab that arrived on the cookie alone can pin itself to this
      // session and stay this account whatever other tabs do.
      sessionToken: tokenFor(req),
      // Storage containers the Developer has shared with this account, by key
      // and label. Read from the account now, so a designation made a moment
      // ago is already here.
      storageContainers: await storageAccess.grantedContainers(u),
      provinceAccess: userProvinceAccess(u),
      provinces: userProvinceKeys(u),
      assignedYears: u.assignedYears || [],
      authorizedYears: await authorizedYears(u),
      activeYear: req.session.activeYear || null,
      // The ERMS unit ("System") on the account, read now so a change made by
      // the Developer a moment ago is already here; and every unit this
      // person may see (one for an ERMS User, all three for a Developer).
      ...(() => {
        const merged = { ...u, ermsUnit: account?.ermsUnit ?? u.ermsUnit, permission: account?.permission ?? u.permission };
        const unit = ermsUnitOf(merged);
        return {
          ermsUnit: unit,
          ermsUnitLabel: unit ? ERMS_UNIT_LABELS[unit] : null,
          ermsUnits: ermsUnitsOf(merged),
          // No year container to choose: the shell hides the year switcher.
          skipYearSelect: isErmsEndUser(merged),
        };
      })(),
      // The look this person chose, kept on the account so it follows them
      // to any device (see PUT /api/profile/theme).
      theme: account?.preferences?.theme || null,
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
    await Promise.all([
      collections.loginStatus.updateOne(
        { userId: new ObjectId(userId) },
        { $set: { isLoggedIn: false, logoutTime } }
      ),
      signInHistory.record(req, req.session.user, 'sign-out'),
    ]);
    presence.changed({ username: req.session.user.username, name: req.session.user.name, online: false });
    // The cookie is cleared only when it names the session being ended. A tab
    // signing out by its own token leaves a cookie that belongs to another
    // tab's sign-in alone.
    const clearCookie = !req.sessionToken || req.sessionToken.matchesCookie;
    req.session.destroy((err) => {
      if (err) return res.status(500).json({ message: 'Failed to destroy session' });
      if (clearCookie) res.clearCookie(COOKIE_NAME);
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
