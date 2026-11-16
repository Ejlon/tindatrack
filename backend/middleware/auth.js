// middleware/auth.js
// Two reusable middleware functions:
//
//   verifyToken        — reads the JWT from the Authorization header,
//                        verifies it, and attaches the payload to req.user.
//                        Use it on every protected route.
//
//   requireRole(...)   — call AFTER verifyToken; rejects users whose role
//                        is not in the allowed list.
//                        Example: requireRole('owner', 'manager')

const jwt = require('jsonwebtoken');

// ── verifyToken ───────────────────────────────────────────────────────────────
const verifyToken = (req, res, next) => {
  // The client sends:  Authorization: Bearer <token>
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided. Please log in.' });
  }

  const token = authHeader.split(' ')[1]; // grab the part after "Bearer "

  try {
    // jwt.verify throws if the token is invalid or expired
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    // Attach the decoded payload to the request so downstream handlers can use it.
    // payload contains: { userId, role, branchId, iat, exp }
    req.user = payload;

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Session expired. Please log in again.' });
    }
    return res.status(401).json({ message: 'Invalid token. Please log in.' });
  }
};

// ── requireRole ───────────────────────────────────────────────────────────────
// Usage:  router.get('/sensitive', verifyToken, requireRole('owner'), handler)
//         router.get('/shared',    verifyToken, requireRole('owner', 'manager'), handler)
const requireRole = (...allowedRoles) => (req, res, next) => {
  if (!req.user) {
    // This should never happen if verifyToken runs first, but just in case.
    return res.status(401).json({ message: 'Not authenticated' });
  }

  if (!allowedRoles.includes(req.user.role)) {
    return res.status(403).json({
      message: `Access denied. Required role: ${allowedRoles.join(' or ')}.`,
    });
  }

  next();
};

// ── requireSameBranch ─────────────────────────────────────────────────────────
// Extra guard for manager/cashier routes:
// - Owners can access any branch's data.
// - Managers and cashiers can only access their own branch.
//
// Usage:  router.get('/:branchId/stock', verifyToken, requireSameBranch, handler)
//
// The route parameter must be named :branchId.
const requireSameBranch = (req, res, next) => {
  const { role, branchId } = req.user;

  // Owners see everything — no restriction.
  if (role === 'owner') return next();

  // For everyone else, the route's :branchId must match their assigned branch.
  const requestedBranch = parseInt(req.params.branchId, 10);
  if (branchId !== requestedBranch) {
    return res.status(403).json({
      message: 'You can only access data for your own branch.',
    });
  }

  next();
};

module.exports = { verifyToken, requireRole, requireSameBranch };
