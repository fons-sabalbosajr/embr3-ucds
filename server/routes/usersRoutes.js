const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { authenticateSession, requireDeveloper, requireRole } = require('../middleware/auth');
const { logActivity } = require('../middleware/activityLog');
const { updateUserAvatar, createUser, updateUserById, updateProfile, approveSignUp, rejectSignUp, getUsers, getUserDetails, getLoginStatus, getSignUps, getUserAvatar, generatePassword, getCurrentUser, getOnlineUsers, updateUserPermissionsByEmail, updateProvincePermissionsByEmail, removeSignUpUser, getRecentActivity, getSignInHistory, setUserType, setUserDomains, setUserErmsUnit, listUserTypes, deleteUser, setUserYears, setMyTheme } = require('../controllers/usersController');

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
const managers = [authenticateSession, requireRole('developer', 'admin')];
// Creating accounts, and everything about account requests, is the
// Developer's: an account exists only once a Developer has approved it
// (services/accountRequests). These used to need only a session, then any
// account manager.
const developer = [authenticateSession, requireDeveloper];
router.post('/api/newusers', developer, upload.single('avatar'), logActivity, createUser);
router.post('/api/sign-up/:id/approve', developer, logActivity, approveSignUp);
router.post('/api/sign-up/:id/reject', developer, logActivity, rejectSignUp);

// PUTs migrated from server.js
// Account details are edited by account managers only; the type, storage
// containers, years and capabilities have their own routes below.
router.put('/api/users/:id', authenticateSession, requireRole('developer', 'admin'), logActivity, updateUserById);
router.put('/api/profile/update/:id', logActivity, authenticateSession, updateProfile);
router.put('/api/profile/theme', authenticateSession, setMyTheme);

// GETs migrated from server.js
router.get('/api/users', authenticateSession, getUsers);
router.get('/api/user/details', authenticateSession, getUserDetails);
router.get('/api/login-status', authenticateSession, getLoginStatus);
router.get('/api/sign-up', developer, getSignUps);
router.get('/api/user/avatar', authenticateSession, getUserAvatar);
router.get('/api/generate-password', developer, generatePassword);

// Additional endpoints migrated from server.js
router.get('/current-user', authenticateSession, getCurrentUser);
router.get('/api/online_users', authenticateSession, getOnlineUsers);
router.get('/api/recent-activity', authenticateSession, getRecentActivity);
// Who signed in and out, when and from where.
router.get('/api/sign-in-history', managers, getSignInHistory);

// Permissions updates and removal
// Changing what another account may do is an administrator's act. These two
// were session-only, which let any signed-in user grant themselves anything.
const accountManagers = [authenticateSession, requireRole('developer', 'admin')];
router.patch('/api/users/:email/permissions', accountManagers, updateUserPermissionsByEmail);
router.patch('/api/users/:email/province-permissions', accountManagers, updateProvincePermissionsByEmail);
// The year containers an account may enter (Encoders and admins alike).
router.put('/api/users/:id/years', accountManagers, logActivity, setUserYears);

// The account type — Developer, Planning Admin, Records Admin, Encoder — is
// the Developer's to set.
router.get('/api/users/types', authenticateSession, listUserTypes);
router.put('/api/users/:id/type', authenticateSession, requireDeveloper, logActivity, setUserType);
// The modules an account enters, beyond what its type gives. Developer only, like the type.
router.put('/api/users/:id/domains', authenticateSession, requireDeveloper, logActivity, setUserDomains);
// The ERMS unit ("System") an account works in. Developer only, like the type.
router.put('/api/users/:id/erms-unit', authenticateSession, requireDeveloper, logActivity, setUserErmsUnit);
router.delete('/api/users/:id', authenticateSession, requireDeveloper, logActivity, deleteUser);
router.delete('/api/remove-user/:id', developer, logActivity, removeSignUpUser);

module.exports = router;
