const express = require('express');
const router = express.Router();
const { authenticateSession } = require('../middleware/auth');
const ctrl = require('../controllers/authController');

// Keep exact legacy paths to avoid breaking the client
router.post('/register', ctrl.register);
router.post('/login', ctrl.login);
router.post('/request-password-reset', ctrl.requestPasswordReset);
router.post('/reset-password', ctrl.resetPassword);
router.get('/auth-check', ctrl.authCheck);
router.post('/logout', ctrl.logout);
router.get('/api/current-user/avatar', authenticateSession, ctrl.currentUserAvatar);
router.get('/protected-route', authenticateSession, ctrl.protectedSample);
router.get('/check-auth', authenticateSession, ctrl.checkAuth);

module.exports = router;
