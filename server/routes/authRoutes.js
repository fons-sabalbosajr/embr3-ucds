const express = require('express');
const router = express.Router();
const { authenticateSession } = require('../middleware/auth');
const {
  loginLimiter,
  passwordResetLimiter,
  registerLimiter,
} = require('../config/security');
const ctrl = require('../controllers/authController');

// Keep exact legacy paths to avoid breaking the client.
// The unauthenticated endpoints are rate limited; see config/security.js.
router.post('/register', registerLimiter, ctrl.register);
router.post('/login', loginLimiter, ctrl.login);
router.post('/request-password-reset', passwordResetLimiter, ctrl.requestPasswordReset);
router.post('/reset-password', passwordResetLimiter, ctrl.resetPassword);
router.get('/auth-check', ctrl.authCheck);

// The single source of truth for what the signed-in user may do.
router.get('/api/auth/me', authenticateSession, ctrl.me);
router.post('/logout', ctrl.logout);
router.get('/api/current-user/avatar', authenticateSession, ctrl.currentUserAvatar);
router.get('/protected-route', authenticateSession, ctrl.protectedSample);
router.get('/check-auth', authenticateSession, ctrl.checkAuth);

module.exports = router;
