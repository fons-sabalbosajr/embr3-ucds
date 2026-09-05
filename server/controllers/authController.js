const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');
const path = require('path');
const crypto = require('crypto');
const { ObjectId } = require('../config/db');
const { connectToMongo } = require('../config/db');
const { allowedOrigins } = require('../config/cors');
const { roleOf } = require('../services/authorization');

function buildSessionPayload(user) {
  return {
    userId: user._id.toString(),
    name: user.name,
    username: user.username,
    division: user.division,
    permission: user.permission,
    role: roleOf(user),
    assignedYears: Array.isArray(user.assignedYears) ? user.assignedYears.map(Number) : [],
    avatar: user.avatar,
    canGenerateData: user.canGenerateData || false,
    canManageData: user.canManageData || false,
    canViewAdminPanel: user.canViewAdminPanel || false,
    canViewDataHistory: user.canViewDataHistory || false,
    canAccessRangePicker: user.canAccessRangePicker || false,
    aurora: user.aurora || false,
    bataan: user.bataan || false,
    bulacan: user.bulacan || false,
    nuevaEcija: user.nuevaEcija || false,
    pampanga: user.pampanga || false,
    tarlac: user.tarlac || false,
    zambales: user.zambales || false,
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

    const result = await collections.signUp.insertOne({ name, division, position, email, status: 'pending' });
    return res.status(201).json({ status: 'User registration submitted for approval', userId: result.insertedId });
  } catch (error) {
    console.error('Error during registration:', error.message);
    return res.status(500).json({ error: 'An error occurred during registration' });
  }
}

async function login(req, res) {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password are required.' });
  try {
    const { collections } = await connectToMongo();
    const user = await collections.users.findOne({ username });
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

    await collections.users.updateOne({ username }, { $set: { status: 'online' } });

    return res.status(200).json({ status: 'success', ...buildSessionPayload(user) });
  } catch (error) {
    console.error('Error during login:', error);
    return res.status(500).json({ error: 'An unexpected error occurred.' });
  }
}

async function requestPasswordReset(req, res) {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required.' });
  try {
    const { collections } = await connectToMongo();
    const user = await collections.users.findOne({ email });
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const resetToken = crypto.randomBytes(20).toString('hex');
    await collections.users.updateOne(
      { email },
      { $set: { resetToken, resetTokenExpiration: Date.now() + 3600000 } }
    );

    // Point at whichever front-end origin this deployment serves. Falls back to
    // the first allowed CORS origin so the link is never hardcoded to localhost.
    const clientUrl = (process.env.CLIENT_URL || process.env.SERVER_URL || allowedOrigins[0] || 'http://localhost:5173')
      .replace(/\/+$/, '');
    const resetLink = `${clientUrl}/universe-central-database-system/reset-password?token=${resetToken}`;

    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
      tls: { rejectUnauthorized: false },
    });

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: user.email,
      subject: 'Password Reset Request',
      html: `
        <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 20px; }
              .container { max-width: 600px; margin: 0 auto; background-color: #fff; padding: 30px; border-radius: 8px; box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1); }
              .header { text-align: center; margin-bottom: 20px; }
              .header img { width: 100px; height: 100px; }
              .content { font-size: 16px; color: #333; line-height: 1.6; }
              .content p { margin-bottom: 10px; }
              .reset-link { display: inline-block; background-color: #ccc; color: white; padding: 10px 20px; font-size: 16px; border-radius: 5px; text-decoration: none; margin-top: 20px; }
              .footer { text-align: center; margin-top: 40px; font-size: 12px; color: #888; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header"><img src="cid:logo" alt="Logo" /></div>
              <div class="content">
                <p>Hello ${user.name},</p>
                <p>We received a request to reset your password. Please click the button below to reset your password.</p>
                <a href="${resetLink}" class="reset-link">Reset Your Password</a>
                <p>If you did not request a password reset, please ignore this email.</p>
              </div>
              <div class="footer">
                <p>Environmental Management Bureau Region III</p>
                <p>Universe Central Database System</p>
              </div>
            </div>
          </body>
        </html>
      `,
      attachments: [
        {
          filename: 'UCDSInformation.png',
          path: path.join(__dirname, '..', 'assets', 'UCDSInformation.png'),
          cid: 'logo',
          contentDisposition: 'inline',
          encoding: 'base64',
        },
      ],
    };

    await transporter.sendMail(mailOptions);
    return res.status(200).json({ message: 'Password reset email sent successfully.', status: 'success', resetLink });
  } catch (error) {
    console.error('Error during password reset request:', error);
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

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await collections.users.updateOne(
      { _id: user._id },
      { $set: { password: hashedPassword }, $unset: { resetToken: '', resetTokenExpiration: '' } }
    );

    return res.status(200).json({ message: 'Password reset successful.' });
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
  logout,
  currentUserAvatar,
  protectedSample,
};
