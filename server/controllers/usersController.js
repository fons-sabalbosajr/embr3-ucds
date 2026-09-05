const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');
const { connectToMongo, collections } = require('../config/db');

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
      return res.status(201).json({ message: 'User created successfully', user: newUser });
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

// PUT /api/profile/update/:id — profile update (self)
async function updateProfile(req, res) {
  try {
    await connectToMongo();
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid user ID' });
    const updatedUser = stripProtectedFields(req.body);
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

module.exports = { updateUserAvatar, createUser, updateUserById, updateProfile, updateSignupStatus };
 
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
