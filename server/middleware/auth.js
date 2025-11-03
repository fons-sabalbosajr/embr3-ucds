function authenticateSession(req, res, next) {
  if (process.env.BYPASS_AUTH === 'true') return next();
  if (req.session && req.session.user) return next();
  res.status(401).json({ message: 'User not authenticated' });
}

module.exports = { authenticateSession };
