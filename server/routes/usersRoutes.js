const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { authenticateSession } = require('../middleware/auth');
const { logActivity } = require('../middleware/activityLog');
const { updateUserAvatar, createUser, updateUserById, updateProfile, updateSignupStatus, getUsers, getUserDetails, getLoginStatus, getSignUps, getUserAvatar, generatePassword, getCurrentUser, getOnlineUsers, updateUserPermissionsByEmail, updateProvincePermissionsByEmail, removeSignUpUser, getRecentActivity } = require('../controllers/usersController');

const router = express.Router();

// Ensure uploads directory exists (aligns with server.js static mount)
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Multer storage for profile photos and new user avatars
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});

const upload = multer({ storage });

// Legacy paths preserved
router.post('/api/users/update', authenticateSession, upload.single('photo'), updateUserAvatar);
router.post('/api/newusers', authenticateSession, upload.single('avatar'), logActivity, createUser);

// PUTs migrated from server.js
router.put('/api/users/:id', logActivity, authenticateSession, updateUserById);
router.put('/api/profile/update/:id', logActivity, authenticateSession, updateProfile);
router.put('/api/status/:id', logActivity, authenticateSession, updateSignupStatus);

// GETs migrated from server.js
router.get('/api/users', authenticateSession, getUsers);
router.get('/api/user/details', authenticateSession, getUserDetails);
router.get('/api/login-status', authenticateSession, getLoginStatus);
router.get('/api/sign-up', authenticateSession, getSignUps);
router.get('/api/user/avatar', authenticateSession, getUserAvatar);
router.get('/api/generate-password', authenticateSession, generatePassword);

// Additional endpoints migrated from server.js
router.get('/current-user', authenticateSession, getCurrentUser);
router.get('/api/online_users', authenticateSession, getOnlineUsers);
router.get('/api/recent-activity', authenticateSession, getRecentActivity);

// Permissions updates and removal
router.patch('/api/users/:email/permissions', authenticateSession, updateUserPermissionsByEmail);
router.patch('/api/users/:email/province-permissions', authenticateSession, updateProvincePermissionsByEmail);
router.delete('/api/remove-user/:id', authenticateSession, removeSignUpUser);

module.exports = router;
