// routes/auth.js
// Mounts the auth endpoints and runs input validation before the controller.
//
// Public routes (no token needed):
//   POST /api/auth/register
//   POST /api/auth/login
//
// Protected routes (token required):
//   GET  /api/auth/me
//   GET  /api/auth/users              (owner only)
//   PUT  /api/auth/users/:id/toggle   (owner only)

const express  = require('express');
const { body } = require('express-validator');
const router   = express.Router();

const { register, login, me, listUsers, toggleUserActive } = require('../controllers/authController');
const { verifyToken, requireRole } = require('../middleware/auth');

// ── Validation rule sets ──────────────────────────────────────────────────────

const registerRules = [
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required')
    .isLength({ max: 100 }).withMessage('Name must be 100 characters or fewer'),

  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Must be a valid email address')
    .normalizeEmail(),

  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter')
    .matches(/[0-9]/).withMessage('Password must contain at least one number'),

  body('role')
    .notEmpty().withMessage('Role is required')
    .isIn(['owner', 'manager', 'cashier']).withMessage("Role must be 'owner', 'manager', or 'cashier'"),

  body('branch_id')
    .optional({ nullable: true })
    .isInt({ min: 1 }).withMessage('branch_id must be a positive integer'),
];

const loginRules = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Must be a valid email address'),

  body('password')
    .notEmpty().withMessage('Password is required'),
];

// ── Routes ────────────────────────────────────────────────────────────────────

// Register a new user (in production, protect this with verifyToken + requireRole('owner'))
router.post('/register', registerRules, register);

// Login — returns a JWT
router.post('/login', loginRules, login);

// Get the currently logged-in user's profile
router.get('/me', verifyToken, me);

// List all users — owner only
router.get('/users', verifyToken, requireRole('owner'), listUsers);

// Activate or deactivate a user account — owner only
router.put('/users/:id/toggle', verifyToken, requireRole('owner'), toggleUserActive);

module.exports = router;
